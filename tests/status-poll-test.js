// v1.2.0 harness: mock switch with real state, S -> ACK "S", Q -> ACK "Q" + 3 ASCII digits,
// unknown -> NAK, plus simulated front-panel changes. Usage: node v12-test.js <module-dir>
const path = require('node:path')
const net = require('node:net')
const Module = require('node:module')

const modDir = path.resolve(process.argv[2])
const logs = [], statuses = [], vars = {}
const fakeBase = {
  InstanceStatus: { Ok: 'ok', Connecting: 'connecting', Disconnected: 'disconnected', ConnectionFailure: 'connection_failure', BadConfig: 'bad_config', UnknownError: 'unknown_error' },
  combineRgb: (r, g, b) => (r << 16) | (g << 8) | b,
  runEntrypoint: () => {},
  InstanceBase: class {
    log(level, msg) { logs.push(`${level}: ${msg}`) }
    updateStatus(s, m) { statuses.push(`${s}${m ? ' (' + m + ')' : ''}`) }
    setVariableValues(v) { Object.assign(vars, v) }
    setActionDefinitions(a) { this._actions = a }
    setFeedbackDefinitions(f) { this._feedbacks = f }
    setPresetDefinitions(p) { this._presets = p }
    setVariableDefinitions(v) { this._varDefs = v }
    checkFeedbacks() {}
  },
}
const origLoad = Module._load
Module._load = function (req, ...rest) { return req === '@companion-module/base' ? fakeBase : origLoad.call(this, req, ...rest) }

const xor = (b) => b.reduce((a, c) => a ^ c, 0)
const frame = (hdr, s) => { const body = Buffer.from([hdr, ...Buffer.from(s, 'latin1'), 3]); return Buffer.concat([body, Buffer.from([xor(body)])]) }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
let failures = 0
const check = (c, l) => { console.log(`${c ? 'PASS' : 'FAIL'}  ${l}`); if (!c) failures++ }

let state = 3, answerQ = true, qFormat = (n) => String(n).padStart(3, '0'), rx = []
const server = net.createServer((s) => {
  let buf = Buffer.alloc(0)
  s.on('data', (d) => {
    buf = Buffer.concat([buf, d])
    for (let e = buf.indexOf(3); e >= 0 && e + 1 < buf.length; e = buf.indexOf(3)) {
      const f = buf.subarray(0, e + 2); buf = buf.subarray(e + 2)
      const txt = f.subarray(1, f.length - 2).toString('latin1'); rx.push(txt)
      setTimeout(() => {
        if (!s.writable) return
        if (xor(f.subarray(0, f.length - 1)) !== f[f.length - 1]) return s.write(frame(0x15, 'FF' + (txt[2] || '?')))
        if (/^FFS\d\d$/.test(txt) && +txt.slice(3) >= 1 && +txt.slice(3) <= 16) { state = +txt.slice(3); s.write(frame(0x06, 'FFS')) }
        else if (txt === 'FFQ') { if (answerQ) s.write(frame(0x06, 'FFQ' + qFormat(state))) }
        else s.write(frame(0x15, 'FF' + (txt[2] || '?')))
      }, 60)
    }
  })
  s.on('error', () => {})
})

async function main() {
  const cmd = require(path.join(modDir, 'dist', 'commands.js'))
  check(cmd.STATUS_QUERY.toString('hex') === '0246465103' + '50', 'status query bytes 02 46 46 51 03 50')
  check(cmd.buildCommand('S01').toString('hex') === '0246465330310353', 'buildCommand("S01") equals PDF frame 1')
  const p = new cmd.ReplyParser()
  const r = p.push(Buffer.concat([Buffer.from('064646530356', 'hex'), frame(6, 'FFQ007'), frame(0x15, 'FFS')]))
  check(r.map((f) => `${f.kind}:${f.func}:${f.data}`).join() === 'ack:S:,ack:Q:007,nak:S:', 'parser: captured ACK, Q reply, NAK in one segment')
  check(cmd.parseStatusData('007') === 7 && cmd.parseStatusData('16') === 16 && cmd.parseStatusData('017') === undefined && cmd.parseStatusData('A1') === undefined, 'parseStatusData accepts 1-16 only')

  await new Promise((r) => server.listen(0, '127.0.0.1', r))
  const port = server.address().port
  const { QuintechRfRouterInstance } = require(path.join(modDir, 'dist', 'main.js'))
  const inst = new QuintechRfRouterInstance({})
  const sel = (i) => inst._feedbacks.input_selected.callback({ options: { input: i } })
  await inst.init({ host: '127.0.0.1', port, connectAtStartup: true, debug: true, statusPollMs: 300 }, true, undefined)
  await sleep(250)

  check(sel(3) && vars.selection_status === 'Confirmed (switch status)', 'state known right after connect (query on connect): input 3 lit')
  check(rx[0] === 'FFQ', 'first frame sent on connect is the Q query')
  check(vars.switch_status_raw === '003', `switch_status_raw = ${vars.switch_status_raw}`)

  // Front-panel change
  state = 7; await sleep(450)
  check(sel(7) && !sel(3), 'front-panel change to 7 picked up by polling within one interval')
  check(logs.some((l) => l.includes('Switch reports input 7 (was 3)')), 'external change logged')

  // Companion select still works, polls don't disturb
  await inst.selectInput(12); await sleep(150)
  check(sel(12) && vars.selection_status.startsWith('Confirmed'), 'select 12 confirmed by ACK')
  await sleep(400)
  check(sel(12), 'subsequent polls agree (12)')

  // NAK
  await inst.sendHex('02 46 46 53 39 39 03 ' + (0x02 ^ 0x46 ^ 0x46 ^ 0x53 ^ 0x39 ^ 0x39 ^ 0x03).toString(16))
  await sleep(150)
  check(logs.some((l) => l.startsWith('warn: Switch rejected (NAK)')), 'NAK reply logged as rejected')
  check(sel(12), 'state unchanged after NAK')

  // Unexpected Q format is logged once, does not change state
  qFormat = (n) => `X${n}`; state = 2; await sleep(700)
  check(sel(12) && logs.filter((l) => l.includes('Status (Q) reply not understood')).length === 1, 'unknown Q data logged once, state untouched')
  qFormat = (n) => String(n).padStart(3, '0'); await sleep(400)
  check(sel(2), 'recovers when Q data is parseable again')

  // Switch ignores Q entirely (older firmware): selects still work via ACK
  answerQ = false; await sleep(1500)
  await inst.selectInput(9); await sleep(150)
  check(sel(9) && logs.filter((l) => l.includes('No reply to status query')).length === 1, 'no Q replies: one warning, ACK feedback still works')

  // Polling off
  answerQ = true; const before = rx.filter((t) => t === 'FFQ').length
  await inst.configUpdated({ host: '127.0.0.1', port, connectAtStartup: true, statusPollMs: 0, statusQueryAtConnect: false }, undefined)
  await sleep(800)
  check(rx.filter((t) => t === 'FFQ').length === before, 'statusPollMs 0 + query-at-connect off: no Q sent')

  // Wire format of selects unchanged
  const sFrames = rx.filter((t) => /^FFS\d\d$/.test(t))
  check(sFrames.includes('FFS12') && sFrames.includes('FFS09'), 'select frames on the wire unchanged')

  await inst.destroy(); server.close()
  console.log(`\n${failures ? failures + ' FAILURE(S)' : 'ALL TESTS PASSED'}`)
  process.exit(failures ? 1 : 0)
}
main().catch((e) => { console.error(e); process.exit(2) })

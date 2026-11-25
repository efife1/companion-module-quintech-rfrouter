// ACK-feedback test (status polling off): runs the compiled module against a mock router that replies like the real
// switch did in the 2026-11-25 capture (06 46 46 53 03 56 ~60-100 ms after each select).
// Usage: node feedback-test.js <module-dir>
const path = require('node:path')
const net = require('node:net')
const Module = require('node:module')

const modDir = path.resolve(process.argv[2])
const logs = [], statuses = [], vars = {}
let feedbackChecks = 0

const fakeBase = {
  InstanceStatus: { Ok: 'ok', Connecting: 'connecting', Disconnected: 'disconnected', ConnectionFailure: 'connection_failure', BadConfig: 'bad_config', UnknownError: 'unknown_error' },
  combineRgb: (r, g, b) => ((r & 0xff) << 16) | ((g & 0xff) << 8) | (b & 0xff),
  runEntrypoint: () => {},
  InstanceBase: class {
    log(level, msg) { logs.push(`${level}: ${msg}`) }
    updateStatus(s, m) { statuses.push(`${s}${m ? ' (' + m + ')' : ''}`) }
    setVariableValues(v) { Object.assign(vars, v) }
    setActionDefinitions(a) { this._actions = a }
    setFeedbackDefinitions(f) { this._feedbacks = f }
    setPresetDefinitions(p) { this._presets = p }
    setVariableDefinitions(v) { this._varDefs = v }
    checkFeedbacks() { feedbackChecks++ }
  },
}
const origLoad = Module._load
Module._load = function (req, ...rest) {
  if (req === '@companion-module/base') return fakeBase
  return origLoad.call(this, req, ...rest)
}

const ACK = Buffer.from('064646530356', 'hex')
const FRAME = (i) => Buffer.from(
  ['0246465330310353','0246465330320350','0246465330330351','0246465330340356','0246465330350357','0246465330360354','0246465330370355','024646533038035a','024646533039035b','0246465331300353','0246465331310352','0246465331320351','0246465331330350','0246465331340357','0246465331350356','0246465331360355'][i - 1], 'hex')
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
let failures = 0
const check = (cond, label) => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}`); if (!cond) failures++ }

// Mock router. mode: 'ack' (reply like hardware), 'silent', 'split' (ACK in two segments), 'nak'
let mode = 'ack', ackDelay = 70
let received = Buffer.alloc(0)
const sockets = new Set()
function makeServer() {
  return net.createServer((s) => {
    sockets.add(s); let buf = Buffer.alloc(0)
    s.on('data', (d) => {
      received = Buffer.concat([received, d]); buf = Buffer.concat([buf, d])
      for (let e = buf.indexOf(3); e >= 0 && e + 1 < buf.length; e = buf.indexOf(3)) {
        buf = buf.subarray(e + 2)
        if (mode === 'ack') setTimeout(() => s.writable && s.write(ACK), ackDelay)
        if (mode === 'split') setTimeout(() => { s.write(ACK.subarray(0, 3)); setTimeout(() => s.write(ACK.subarray(3)), 20) }, ackDelay)
        if (mode === 'nak') setTimeout(() => { const f = Buffer.from([0x15, 0x46, 0x46, 0x53, 0x03, 0]); f[5] = f.subarray(0, 5).reduce((a, b) => a ^ b, 0); s.write(f) }, ackDelay)
      }
    })
    s.on('close', () => sockets.delete(s)); s.on('error', () => {})
  })
}

async function main() {
  const { QuintechRfRouterInstance } = require(path.join(modDir, 'dist', 'main.js'))
  const commands = require(path.join(modDir, 'dist', 'commands.js'))

  // --- unit: checksum & parser against capture bytes
  check(commands.xorChecksum(Buffer.from('0246465330310303'.slice(0, 14), 'hex')) === 0x53, 'XOR checksum matches PDF frame 1')
  for (let i = 1; i <= 16; i++) {
    const f = FRAME(i)
    if (commands.xorChecksum(f.subarray(0, 7)) !== f[7]) check(false, `checksum frame ${i}`)
  }
  check(true, 'XOR checksum verified for all 16 PDF frames')
  const p = new commands.ReplyParser()
  check(p.push(ACK).map((f) => f.kind).join() === 'ack', 'parser: captured ACK 06 46 46 53 03 56 recognised')
  check(p.push(ACK.subarray(0, 4)).length === 0 && p.push(ACK.subarray(4)).map((f) => f.kind).join() === 'ack', 'parser: ACK split across segments')
  check(p.push(Buffer.concat([ACK, ACK])).length === 2, 'parser: two ACKs in one segment')
  const bad = Buffer.from(ACK); bad[5] = 0x00
  check(p.push(bad)[0].kind === 'other', 'parser: bad checksum rejected')
  check(commands.inputForCommand(FRAME(12)) === 12 && commands.inputForCommand(Buffer.from('0230310303', 'hex')) === undefined, 'inputForCommand maps route frames only')

  // --- integration
  let server = makeServer()
  await new Promise((r) => server.listen(0, '127.0.0.1', r))
  const port = server.address().port
  const inst = new QuintechRfRouterInstance({})
  await inst.init({ host: '127.0.0.1', port, connectAtStartup: true, debug: true, statusPollMs: 0, statusQueryAtConnect: false }, true, undefined)
  await sleep(300)

  const fb = inst._feedbacks
  const sel = (i) => fb.input_selected.callback({ options: { input: i } })
  const pend = (i) => fb.input_pending.callback({ options: { input: i } })

  check(Object.keys(fb).sort().join() === 'input_pending,input_selected', 'feedbacks defined: input_selected, input_pending')
  check(inst._presets.input_7.feedbacks.map((f) => f.feedbackId).join() === 'input_pending,input_selected' && inst._presets.input_7.feedbacks[1].options.input === 7, 'presets carry feedbacks for their own input')
  check(inst.getConfigFields().slice(0, 4).map((f) => f.id).join() === 'host,port,connectAtStartup,debug', 'v1.0.0 config IDs preserved, in order')
  check(Object.keys(inst._actions).sort().join() === 'query_status,raw_hex,select_input', 'actions: select_input, raw_hex, query_status')
  check(vars.selection_status === 'Unknown' && [...Array(16)].every((_, i) => !sel(i + 1)), 'nothing lit before any selection')

  // Select 5: pending, then confirmed on ACK
  received = Buffer.alloc(0)
  await inst._actions.select_input.callback({ options: { input: 5 } })
  await sleep(10)
  check(pend(5) && !sel(5), 'input 5 pending immediately after send, not yet selected')
  check(vars.selection_status === 'Pending (Input 5)', `status ${vars.selection_status}`)
  await sleep(150)
  check(sel(5) && !pend(5), 'input 5 selected after ACK')
  check([...Array(16)].filter((_, i) => sel(i + 1)).length === 1, 'exactly one input lit')
  check(vars.current_input === 'Input 5' && vars.selection_status === 'Confirmed', `variables: ${vars.current_input}, ${vars.selection_status}`)
  check(Number(vars.last_ack_latency_ms) >= 60 && Number(vars.last_ack_latency_ms) < 200, `ACK latency measured: ${vars.last_ack_latency_ms} ms`)
  check(received.toString('hex') === FRAME(5).toString('hex'), 'wire frame for input 5 unchanged')

  // Rapid presses 1,2,3 -> FIFO matching -> ends on 3
  for (const i of [1, 2, 3]) await inst.selectInput(i)
  await sleep(250)
  check(sel(3) && !sel(1) && !sel(2) && !sel(5), 'rapid presses 1,2,3: input 3 lit (FIFO ACK matching)')

  // Split ACK
  mode = 'split'; await inst.selectInput(8); await sleep(200)
  check(sel(8), 'ACK split across two TCP segments still confirms')

  // No ACK -> stays on previous, status No ACK
  mode = 'silent'
  await inst.selectInput(10)
  await sleep(50); check(pend(10), 'input 10 pending while waiting')
  await sleep(1100)
  check(!pend(10) && !sel(10) && sel(8), 'no ACK within 1000 ms: input 10 not lit, 8 stays lit')
  check(vars.selection_status === 'No ACK (Input 10)', `status ${vars.selection_status}`)
  check(logs.some((l) => l.startsWith('warn: No ACK from switch within 1000 ms')), 'no-ACK warning logged')

  // Unrecognised reply (possible NAK) -> not confirmed
  mode = 'nak'; await inst.selectInput(11); await sleep(200)
  check(!sel(11) && sel(8) && vars.selection_status === 'Rejected (Input 11)', 'NAK reply: input 11 not lit, status Rejected')

  // raw_hex of a route frame also confirms
  mode = 'ack'
  await inst._actions.raw_hex.callback({ options: { hex: '%02%46%46%53%31%36%03%55' } }); await sleep(200)
  check(sel(16), 'raw_hex route command for 16 confirmed and lit')
  // raw_hex of non-route bytes keeps ACK alignment
  await inst._actions.raw_hex.callback({ options: { hex: '02 30 31 03' } })
  await inst.selectInput(4); await sleep(250)
  check(sel(4), 'non-route raw_hex then select 4: ACKs stay aligned, 4 lit')

  // Unsolicited ACK ignored
  for (const s of sockets) s.write(ACK); await sleep(100)
  check(sel(4), 'unsolicited ACK ignored; 4 stays lit')

  // Reconnect: pending dropped, last confirmed kept
  mode = 'silent'; await inst.selectInput(6); await sleep(20)
  for (const s of sockets) s.destroy()
  await sleep(1600)
  check(!pend(6) && sel(4), 'connection drop clears pending; last confirmed input kept')
  check(statuses.at(-1).startsWith('ok'), 'reconnected')
  mode = 'ack'; await inst.selectInput(2); await sleep(200)
  check(sel(2), 'confirms normally after reconnect')

  // Legacy write mode
  await inst.configUpdated({ host: '127.0.0.1', port, connectAtStartup: true, debug: false, feedbackMode: 'write' }, undefined)
  await sleep(300); mode = 'silent'
  await inst.selectInput(13); await sleep(20)
  check(sel(13) && vars.selection_status === 'Sent (not ACK-checked)', 'write mode: lit immediately on send without ACK (v1.0.0 behaviour)')

  // Logging
  check(logs.some((l) => l === 'debug: RX: 06 46 46 53 03 56') && logs.some((l) => /^debug: ACK for .* after \d+ ms$/.test(l)), 'debug RX + ACK latency logging')

  await inst.destroy()
  await new Promise((r) => server.close(r))
  console.log(`\n${failures === 0 ? 'ALL TESTS PASSED' : failures + ' FAILURE(S)'}`)
  process.exit(failures ? 1 : 0)
}
main().catch((e) => { console.error(e); process.exit(2) })

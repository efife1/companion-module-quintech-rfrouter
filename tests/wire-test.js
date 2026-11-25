// Wire-format / transport test (v1.0.0 behaviour preserved): all 16 frames byte-exact, raw hex,
// TX/RX logging, reconnect. Status polling is turned off and feedbackMode 'write' is used so the
// silent mock does not need to ACK.
// Usage: node mock-test.js <module-dir>
const path = require('node:path')
const net = require('node:net')
const Module = require('node:module')

const modDir = path.resolve(process.argv[2])
const logs = []
const statuses = []
const vars = {}

// Fake @companion-module/base: records log/status/variable calls; runEntrypoint is a no-op.
const fakeBase = {
  InstanceStatus: { Ok: 'ok', Connecting: 'connecting', Disconnected: 'disconnected', ConnectionFailure: 'connection_failure', BadConfig: 'bad_config', UnknownError: 'unknown_error' },
  combineRgb: (r, g, b) => ((r & 0xff) << 16) | ((g & 0xff) << 8) | (b & 0xff),
  runEntrypoint: () => {},
  InstanceBase: class {
    constructor() {}
    log(level, msg) { logs.push(`${level}: ${msg}`) }
    updateStatus(s, m) { statuses.push(`${s}${m ? ' (' + m + ')' : ''}`) }
    setVariableValues(v) { Object.assign(vars, v) }
    setActionDefinitions(a) { this._actions = a }
    setPresetDefinitions(p) { this._presets = p }
    setVariableDefinitions(v) { this._varDefs = v }
    setFeedbackDefinitions(f) { this._feedbacks = f }
    checkFeedbacks() {}
  },
}
const origLoad = Module._load
Module._load = function (req, ...rest) {
  if (req === '@companion-module/base') return fakeBase
  return origLoad.call(this, req, ...rest)
}

const EXPECTED = {
  1: '0246465330310353', 2: '0246465330320350', 3: '0246465330330351', 4: '0246465330340356',
  5: '0246465330350357', 6: '0246465330360354', 7: '0246465330370355', 8: '024646533038035a',
  9: '024646533039035b', 10: '0246465331300353', 11: '0246465331310352', 12: '0246465331320351',
  13: '0246465331330350', 14: '0246465331340357', 15: '0246465331350356', 16: '0246465331360355',
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
let failures = 0
const check = (cond, label) => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}`); if (!cond) failures++ }

async function main() {
  const { QuintechRfRouterInstance } = require(path.join(modDir, 'dist', 'main.js'))
  let received = Buffer.alloc(0)
  let connections = 0
  const sockets = new Set()
  const makeServer = () => net.createServer((s) => {
    connections++; sockets.add(s)
    s.on('data', (d) => { received = Buffer.concat([received, d]) })
    s.on('close', () => sockets.delete(s))
  })
  let server = makeServer()
  await new Promise((r) => server.listen(0, '127.0.0.1', r))
  const port = server.address().port
  console.log(`Mock router listening on 127.0.0.1:${port}`)

  const inst = new QuintechRfRouterInstance({})
  await inst.init({ host: '127.0.0.1', port, connectAtStartup: true, debug: true, statusPollMs: 0, statusQueryAtConnect: false, feedbackMode: 'write' }, true, undefined)

  // Definitions
  check(['select_input', 'raw_hex'].every((a) => a in inst._actions), 'actions select_input and raw_hex present')
  check(Object.keys(inst._presets).length === 16 && inst._presets.input_16, '16 presets input_1..input_16')
  check(inst._varDefs.map((v) => v.variableId).slice(0, 3).join() === 'current_input,current_input_number,last_command_hex', 'v1.0.0 variables preserved')
  const cfg = inst.getConfigFields()
  check(cfg.map((f) => f.id).slice(0, 4).join() === 'host,port,connectAtStartup,debug' && cfg[1].default === 9100, 'config fields host/port(9100)/connectAtStartup/debug')

  await sleep(300)
  check(statuses.at(-1)?.startsWith('ok'), `status OK after connect (${statuses.at(-1)})`)

  // All 16 frames, in order, via the action callback (same path a button press takes)
  for (let i = 1; i <= 16; i++) {
    await inst._actions.select_input.callback({ options: { input: i } })
  }
  await sleep(300)
  const expectedAll = Object.values(EXPECTED).join('')
  check(received.length === 128, `received 128 bytes (16 x 8) — got ${received.length}`)
  check(received.toString('hex') === expectedAll, 'all 16 frames byte-exact and in order')
  for (let i = 1; i <= 16; i++) {
    const frame = received.subarray((i - 1) * 8, i * 8).toString('hex')
    if (frame !== EXPECTED[i]) check(false, `frame ${i}: got ${frame}, expected ${EXPECTED[i]}`)
  }
  check(vars.current_input === 'Input 16' && vars.current_input_number === '16', `variables current_input=${vars.current_input}`)
  check(vars.last_command_hex === '02 46 46 53 31 36 03 55', `last_command_hex=${vars.last_command_hex}`)
  check(logs.some((l) => l === 'debug: TX: 02 46 46 53 30 31 03 53'), 'debug TX logging')

  // raw_hex action with % notation from the PDF
  received = Buffer.alloc(0)
  await inst._actions.raw_hex.callback({ options: { hex: '%02%46%46%53%30%31%03%53' } })
  await sleep(150)
  check(received.toString('hex') === EXPECTED[1], 'raw_hex with %-notation sends exact frame')

  // RX logging
  for (const s of sockets) s.write(Buffer.from([0x06]))
  await sleep(150)
  check(logs.some((l) => l === 'debug: RX: 06'), 'debug RX logging')

  // Reconnect: router drops connection
  const before = connections
  for (const s of sockets) s.destroy()
  await sleep(1600)
  check(connections === before + 1, `reconnects after router closes connection (connections ${before} -> ${connections})`)
  received = Buffer.alloc(0)
  await inst.selectInput(5)
  await sleep(150)
  check(received.toString('hex') === EXPECTED[5], 'sends correctly after reconnect')

  // Router fully offline, then back
  for (const s of sockets) s.destroy()
  await new Promise((r) => server.close(r))
  await sleep(500)
  const okBefore = await inst.sendHex(EXPECTED[2])
  check(okBefore === false, 'send while router offline fails cleanly (no crash)')
  server = makeServer()
  await new Promise((r) => server.listen(port, '127.0.0.1', r))
  await sleep(2500)
  check(statuses.at(-1)?.startsWith('ok'), `recovers when router comes back (${statuses.at(-1)})`)
  received = Buffer.alloc(0)
  await inst.selectInput(9)
  await sleep(150)
  check(received.toString('hex') === EXPECTED[9], 'sends correctly after router restart')

  await inst.destroy()
  await new Promise((r) => server.close(r))
  console.log('\nStatus history:', statuses.join(' | '))
  console.log(`\n${failures === 0 ? 'ALL TESTS PASSED' : failures + ' FAILURE(S)'}`)
  process.exit(failures ? 1 : 0)
}
main().catch((e) => { console.error(e); process.exit(2) })

// Mock Quintech router for local testing. Usage: node mock-router.js [port] [--no-ack]   (default 9100)
// Behaves like the real switch did in the 2026-11-25 captures:
//   select "S nn"  -> 06 46 46 53 03 56 (ACK) about 70 ms later
//   status "Q"     -> 06 46 46 51 <3 ASCII digits> 03 CHK, e.g. 06 46 46 51 30 30 37 03 63 = input 7
// Type a number 1-16 + Enter in this window to simulate a front-panel change.
// Use --no-ack to test the "No ACK" path.
// Never point Companion at real hardware while testing with this.
const net = require('node:net')
const port = Number(process.argv.find((a, i) => i > 1 && /^\d+$/.test(a)) || 9100)
const noAck = process.argv.includes('--no-ack')
const ACK = Buffer.from('064646530356', 'hex')
const xor = (b) => b.reduce((a, c) => a ^ c, 0)
const qReply = (n) => { const body = Buffer.from([6, ...Buffer.from('FFQ' + String(n).padStart(3, '0'), 'latin1'), 3]); return Buffer.concat([body, Buffer.from([xor(body)])]) }
let state = 1
process.stdin.on('data', (d) => { const n = parseInt(String(d), 10); if (n >= 1 && n <= 16) { state = n; console.log(`[${new Date().toLocaleTimeString()}] front panel -> input ${n}`) } })
const T = ['0246465330310353','0246465330320350','0246465330330351','0246465330340356','0246465330350357','0246465330360354','0246465330370355','024646533038035a','024646533039035b','0246465331300353','0246465331310352','0246465331320351','0246465331330350','0246465331340357','0246465331350356','0246465331360355']
const ts = () => new Date().toLocaleTimeString()
net.createServer((s) => {
  const who = `${s.remoteAddress}:${s.remotePort}`
  console.log(`[${ts()}] client connected ${who}`)
  let buf = Buffer.alloc(0)
  s.on('data', (d) => {
    buf = Buffer.concat([buf, d])
    for (let e = buf.indexOf(3); e >= 0 && e + 1 < buf.length; e = buf.indexOf(3)) {
      const f = buf.subarray(0, e + 2).toString('hex'); buf = buf.subarray(e + 2)
      if (f === '024646510350') { if (!noAck) setTimeout(() => s.writable && s.write(qReply(state)), 20); continue }
      const idx = T.indexOf(f)
      if (idx >= 0) state = idx + 1
      console.log(`[${ts()}] RX ${f.match(/../g).join(' ').toUpperCase()}  ->  ${idx >= 0 ? 'selection ' + (idx + 1) : 'not a route command'}${noAck ? '  (no ACK sent)' : '  -> ACK'}`)
      if (!noAck) setTimeout(() => s.writable && s.write(ACK), 70)
    }
  })
  s.on('close', () => console.log(`[${ts()}] client disconnected ${who}`))
  s.on('error', () => {})
}).listen(port, '127.0.0.1', () => console.log(`Mock Quintech router listening on 127.0.0.1:${port}${noAck ? ' (ACKs disabled)' : ''}`))

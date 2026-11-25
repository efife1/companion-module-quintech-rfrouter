export const ROUTE_COMMANDS: Record<number, string> = {
  1: '02 46 46 53 30 31 03 53',
  2: '02 46 46 53 30 32 03 50',
  3: '02 46 46 53 30 33 03 51',
  4: '02 46 46 53 30 34 03 56',
  5: '02 46 46 53 30 35 03 57',
  6: '02 46 46 53 30 36 03 54',
  7: '02 46 46 53 30 37 03 55',
  8: '02 46 46 53 30 38 03 5A',
  9: '02 46 46 53 30 39 03 5B',
  10: '02 46 46 53 31 30 03 53',
  11: '02 46 46 53 31 31 03 52',
  12: '02 46 46 53 31 32 03 51',
  13: '02 46 46 53 31 33 03 50',
  14: '02 46 46 53 31 34 03 57',
  15: '02 46 46 53 31 35 03 56',
  16: '02 46 46 53 31 36 03 55',
}

export function parseHexString(input: string): Buffer {
  const cleaned = input.replace(/0x/gi, '').replace(/%/g, '').replace(/[^a-fA-F0-9]/g, '')

  if (cleaned.length === 0) throw new Error('Empty hex command')
  if (cleaned.length % 2 !== 0) throw new Error(`Odd number of hex characters: ${cleaned}`)

  return Buffer.from(cleaned, 'hex')
}

export function formatBufferHex(buffer: Buffer): string {
  return buffer.toString('hex').match(/.{1,2}/g)?.join(' ').toUpperCase() ?? ''
}

/** If the bytes are exactly one of the 16 route commands, return that input number. */
export function inputForCommand(buffer: Buffer): number | undefined {
  const hex = buffer.toString('hex')
  for (const [input, cmd] of Object.entries(ROUTE_COMMANDS)) {
    if (cmd.replace(/ /g, '').toLowerCase() === hex) return Number(input)
  }
  return undefined
}

// ---------------------------------------------------------------------------
// Protocol framing. Sources:
//  * Packet capture 2026-11-25 (QUINTECH-FEEDBACK-PROTOCOL-NOTES.md): select is ACKed with
//    06 46 46 53 03 56 about 60-100 ms later; the ACK carries no port; no unsolicited messages.
//  * Quintech SRR 1000/16x1 operating manual (protocol 1.21): STX/ETX wrapper,
//    ACK = 0x06 for accepted commands, NAK = 0x15 for rejected commands, and a
//    "Q" status query (02 ADR ADR 51 03 CHK) whose response "contains three ASCII data bytes".
//  * Checksum = XOR of all bytes from the header through ETX (verified on all 16 PDF frames
//    and the captured ACK).
// ---------------------------------------------------------------------------

export const STX = 0x02
export const ETX = 0x03
export const ACK = 0x06
export const NAK = 0x15
export const ADDRESS = 'FF'

export function xorChecksum(bytes: Buffer): number {
  let x = 0
  for (const b of bytes) x ^= b
  return x
}

/** Build STX ADR ADR <command+data> ETX CHK. */
export function buildCommand(commandAndData: string, address = ADDRESS): Buffer {
  const body = Buffer.from([STX, ...Buffer.from(address + commandAndData, 'ascii'), ETX])
  return Buffer.concat([body, Buffer.from([xorChecksum(body)])])
}

/** "Q" status query from the SRR 16x1 manual: 02 46 46 51 03 50 */
export const STATUS_QUERY = buildCommand('Q')

export type ProtocolReply = { kind: 'ack' | 'nak'; raw: Buffer; func: string; data: string }
export type ReplyFrame = ProtocolReply | { kind: 'other'; raw: Buffer; checksumOk: boolean }

/** If a Q-reply's data is a plain input number 1-16, return it; otherwise undefined. */
export function parseStatusData(data: string): number | undefined {
  if (!/^\d{1,3}$/.test(data)) return undefined
  const n = Number(data)
  return n >= 1 && n <= 16 ? n : undefined
}

/**
 * Incremental parser for the switch -> Companion byte stream. Handles replies split
 * across TCP segments or several replies in one segment. A frame runs from its header
 * byte to the first ETX, followed by one checksum byte.
 */
export class ReplyParser {
  private buf = Buffer.alloc(0)
  private static readonly MAX_BUFFER = 256

  push(data: Buffer): ReplyFrame[] {
    this.buf = Buffer.concat([this.buf, data])
    const frames: ReplyFrame[] = []

    for (;;) {
      // Resynchronise on a header byte if junk precedes it.
      let start = 0
      while (start < this.buf.length && this.buf[start] !== ACK && this.buf[start] !== NAK && this.buf[start] !== STX) start++
      if (start > 0) {
        frames.push({ kind: 'other', raw: Buffer.from(this.buf.subarray(0, start)), checksumOk: false })
        this.buf = this.buf.subarray(start)
      }

      const etx = this.buf.indexOf(ETX)
      if (etx < 0 || etx + 1 >= this.buf.length) break // need ETX + checksum byte

      const raw = Buffer.from(this.buf.subarray(0, etx + 2))
      this.buf = this.buf.subarray(etx + 2)

      const checksumOk = xorChecksum(raw.subarray(0, raw.length - 1)) === raw[raw.length - 1]
      if (checksumOk && (raw[0] === ACK || raw[0] === NAK) && raw.length >= 6) {
        frames.push({
          kind: raw[0] === ACK ? 'ack' : 'nak',
          raw,
          func: String.fromCharCode(raw[3]),
          data: raw.subarray(4, raw.length - 2).toString('latin1'),
        })
      } else {
        frames.push({ kind: 'other', raw, checksumOk })
      }
    }

    if (this.buf.length > ReplyParser.MAX_BUFFER) {
      frames.push({ kind: 'other', raw: Buffer.from(this.buf), checksumOk: false })
      this.buf = Buffer.alloc(0)
    }
    return frames
  }

  reset(): void {
    this.buf = Buffer.alloc(0)
  }
}

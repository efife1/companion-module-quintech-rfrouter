import net from 'node:net'
import {
  InstanceBase,
  InstanceStatus,
  runEntrypoint,
  type SomeCompanionConfigField,
} from '@companion-module/base'
import { DEFAULT_ACK_TIMEOUT_MS, DEFAULT_STATUS_POLL_MS, getConfigFields, type ModuleConfig } from './config.js'
import { getActions } from './actions.js'
import { getFeedbacks } from './feedbacks.js'
import { getPresets } from './presets.js'
import {
  ROUTE_COMMANDS,
  ReplyParser,
  STATUS_QUERY,
  STX,
  formatBufferHex,
  inputForCommand,
  parseHexString,
  parseStatusData,
  type ProtocolReply,
} from './commands.js'

interface PendingCommand {
  /** Input number if the command is one of the 16 route commands, else undefined (raw hex). */
  input?: number
  /** Command letter (byte 3 of an STX frame), used to match the switch's reply. */
  func?: string
  /** Internal status poll (not shown in last_command_hex). */
  poll?: boolean
  hex: string
  sentAt: number
  timer: NodeJS.Timeout
}

export default class QuintechRfRouterInstance extends InstanceBase<ModuleConfig, undefined> {
  config: ModuleConfig = {}
  /** Last input the switch confirmed (or, in 'write' mode, last input sent). */
  selectedInput?: number

  private socket?: net.Socket
  private reconnectTimer?: NodeJS.Timeout
  private connecting = false
  private shuttingDown = false
  private readonly parser = new ReplyParser()
  /** Commands written and awaiting ACK, oldest first. The ACK carries no port, so it is matched FIFO. */
  private pending: PendingCommand[] = []
  private pollTimer?: NodeJS.Timeout
  private readonly reportedUnknownStatus = new Set<string>()

  constructor(internal: unknown) {
    super(internal as any)
  }

  async init(config: ModuleConfig, _isFirstInit: boolean, _secrets: undefined): Promise<void> {
    this.config = config
    this.setActionDefinitions(getActions(this))
    this.setFeedbackDefinitions(getFeedbacks(this))
    this.setPresetDefinitions(getPresets() as any)
    this.setVariableDefinitions(this.getVariableDefinitions())
    this.setVariableValues({
      current_input: 'Unknown',
      current_input_number: '',
      last_command_hex: '',
      selection_status: 'Unknown',
      last_ack_latency_ms: '',
      switch_status_raw: '',
    })

    if (config.connectAtStartup !== false) {
      this.openConnection()
    } else {
      this.updateStatus(InstanceStatus.Disconnected, 'Connect at startup disabled')
    }
  }

  async configUpdated(config: ModuleConfig, _secrets: undefined): Promise<void> {
    this.config = config
    this.closeConnection()
    if (config.connectAtStartup !== false) {
      this.openConnection()
    } else {
      this.updateStatus(InstanceStatus.Disconnected, 'Connect at startup disabled')
    }
  }

  getConfigFields(): SomeCompanionConfigField[] {
    return getConfigFields()
  }

  async destroy(): Promise<void> {
    this.shuttingDown = true
    this.closeConnection()
  }

  private get feedbackMode(): 'ack' | 'write' {
    return this.config.feedbackMode === 'write' ? 'write' : 'ack'
  }

  private get ackTimeoutMs(): number {
    const v = Number(this.config.ackTimeoutMs)
    return Number.isFinite(v) && v >= 100 ? v : DEFAULT_ACK_TIMEOUT_MS
  }

  isPending(input: number): boolean {
    return this.pending.some((p) => p.input === input)
  }

  private getVariableDefinitions(): any {
    return [
      { variableId: 'current_input', name: 'Current selected RF input label' },
      { variableId: 'current_input_number', name: 'Current selected RF input number' },
      { variableId: 'last_command_hex', name: 'Last hex command sent' },
      { variableId: 'selection_status', name: 'Selection status (Confirmed / Pending / No ACK / Unknown)' },
      { variableId: 'last_ack_latency_ms', name: 'Last switch ACK latency (ms)' },
      { variableId: 'switch_status_raw', name: 'Raw data of last status (Q) reply from switch' },
    ] as any
  }

  private openConnection(): void {
    const host = this.config.host
    const port = Number(this.config.port ?? 9100)

    if (!host || !port) {
      this.updateStatus(InstanceStatus.BadConfig, 'Router host and TCP port are required')
      return
    }

    if (this.socket || this.connecting) return

    this.shuttingDown = false
    this.connecting = true
    this.updateStatus(InstanceStatus.Connecting, `Connecting to ${host}:${port}`)

    const socket = new net.Socket()
    this.socket = socket
    socket.setNoDelay(true)
    socket.setKeepAlive(true, 1000)
    socket.setTimeout(3000)

    socket.once('connect', () => {
      this.connecting = false
      socket.setTimeout(0)
      this.parser.reset()
      this.updateStatus(InstanceStatus.Ok, `Connected to ${host}:${port}`)
      if (this.config.debug) this.log('debug', `TCP connected to ${host}:${port}`)
      this.startPolling()
    })

    socket.on('data', (data: Buffer) => {
      if (this.config.debug) this.log('debug', `RX: ${formatBufferHex(data)}`)
      this.handleReplyData(data)
    })

    socket.on('timeout', () => {
      if (this.config.debug) this.log('debug', 'TCP timeout')
      socket.destroy()
    })

    socket.on('error', (err: Error) => {
      this.connecting = false
      this.updateStatus(InstanceStatus.ConnectionFailure, err.message)
      if (this.config.debug) this.log('debug', `TCP error: ${err.message}`)
    })

    socket.on('close', () => {
      this.connecting = false
      if (this.socket === socket) this.socket = undefined
      this.stopPolling()
      this.clearPending('connection closed')
      if (!this.shuttingDown && this.config.connectAtStartup !== false) {
        this.updateStatus(InstanceStatus.ConnectionFailure, 'TCP connection closed; reconnecting')
        this.scheduleReconnect()
      }
    })

    socket.connect(port, host)
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer || this.shuttingDown) return
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = undefined
      this.openConnection()
    }, 1000)
  }

  private closeConnection(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = undefined
    }
    if (this.socket) {
      this.socket.removeAllListeners()
      this.socket.destroy()
      this.socket = undefined
    }
    this.connecting = false
    this.stopPolling()
    this.clearPending('connection reset')
    this.parser.reset()
  }

  // --- reply / feedback handling -------------------------------------------------

  private handleReplyData(data: Buffer): void {
    for (const frame of this.parser.push(data)) {
      if (frame.kind === 'other') {
        this.log('warn', `Unrecognised bytes from switch${frame.checksumOk ? '' : ' (no valid frame/checksum)'}: ${formatBufferHex(frame.raw)}`)
        continue
      }
      const entry = this.takePending(frame.func)
      if (!entry) {
        if (this.config.debug) this.log('debug', `${frame.kind.toUpperCase()} "${frame.func}" with no matching command pending — ignored: ${formatBufferHex(frame.raw)}`)
        continue
      }
      clearTimeout(entry.timer)
      if (frame.kind === 'nak') this.onNak(entry, frame)
      else if (frame.func === 'Q') this.onStatusReply(entry, frame)
      else this.onAck(entry)
    }
  }

  /** Oldest pending command with the same command letter; falls back to the oldest pending. */
  private takePending(func: string): PendingCommand | undefined {
    let idx = this.pending.findIndex((p) => p.func === func)
    if (idx < 0) idx = this.pending.findIndex((p) => p.func === undefined)
    if (idx < 0) return undefined
    return this.pending.splice(idx, 1)[0]
  }

  private onAck(entry: PendingCommand): void {
    const latency = Date.now() - entry.sentAt
    this.setVariableValues({ last_ack_latency_ms: String(latency) })
    if (this.config.debug) this.log('debug', `ACK for ${entry.hex} after ${latency} ms`)

    if (entry.input !== undefined && this.feedbackMode === 'ack') {
      this.setSelected(entry.input)
      this.setSelectionStatus('Confirmed')
    }
    this.checkFeedbacks('input_pending', 'input_selected')
  }

  private onNak(entry: PendingCommand, frame: ProtocolReply): void {
    this.log('warn', `Switch rejected (NAK) ${entry.hex}: ${formatBufferHex(frame.raw)}`)
    if (entry.input !== undefined) this.setSelectionStatus(`Rejected (Input ${entry.input})`)
    this.checkFeedbacks('input_pending')
  }

  private onStatusReply(entry: PendingCommand, frame: ProtocolReply): void {
    this.setVariableValues({ switch_status_raw: frame.data })
    if (this.config.debug) this.log('debug', `Status reply after ${Date.now() - entry.sentAt} ms: data "${frame.data}" (${formatBufferHex(frame.raw)})`)
    const input = parseStatusData(frame.data)
    if (input === undefined) {
      if (!this.reportedUnknownStatus.has(frame.data)) {
        this.reportedUnknownStatus.add(frame.data)
        this.log('warn', `Status (Q) reply not understood, data "${frame.data}": ${formatBufferHex(frame.raw)}`)
      }
      return
    }
    // Do not let a poll overwrite a selection that is still waiting for its ACK.
    if (this.pending.some((p) => p.input !== undefined)) return
    if (this.selectedInput !== input) {
      if (this.selectedInput !== undefined) this.log('info', `Switch reports input ${input} (was ${this.selectedInput}) — changed outside Companion or confirmed by status`)
      this.setSelected(input)
      this.checkFeedbacks('input_selected')
    }
    this.setSelectionStatus('Confirmed (switch status)')
  }

  // --- status polling ----------------------------------------------------------

  private get statusPollMs(): number {
    const v = Number(this.config.statusPollMs ?? DEFAULT_STATUS_POLL_MS)
    return Number.isFinite(v) && v >= 250 ? v : 0
  }

  private startPolling(): void {
    this.stopPolling()
    if (this.config.statusQueryAtConnect !== false) void this.queryStatus()
    const ms = this.statusPollMs
    if (ms > 0) this.pollTimer = setInterval(() => void this.queryStatus(true), ms)
  }

  private stopPolling(): void {
    if (this.pollTimer) clearInterval(this.pollTimer)
    this.pollTimer = undefined
  }

  /** Send the documented Q status query. Polls are skipped while any command is outstanding. */
  async queryStatus(isPoll = false): Promise<void> {
    if (isPoll && this.pending.length > 0) return
    const socket = this.socket
    if (!socket || socket.destroyed || !socket.writable || this.connecting) return
    const pretty = formatBufferHex(STATUS_QUERY)
    try {
      await new Promise<void>((resolve, reject) => socket.write(STATUS_QUERY, (err?: Error | null) => (err ? reject(err) : resolve())))
      if (this.config.debug) this.log('debug', `TX: ${pretty} (status query)`)
      const entry: PendingCommand = { func: 'Q', hex: pretty, sentAt: Date.now(), poll: isPoll, timer: undefined as any }
      entry.timer = setTimeout(() => this.onAckTimeout(entry), this.ackTimeoutMs)
      this.pending.push(entry)
    } catch (err) {
      this.log('warn', `Status query failed: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  private onAckTimeout(entry: PendingCommand): void {
    const idx = this.pending.indexOf(entry)
    if (idx < 0) return
    this.pending.splice(idx, 1)
    if (entry.func === 'Q') {
      if (!this.reportedUnknownStatus.has('<timeout>')) {
        this.reportedUnknownStatus.add('<timeout>')
        this.log('warn', `No reply to status query ${entry.hex} within ${this.ackTimeoutMs} ms (further timeouts not logged)`)
      }
      return
    }
    this.log('warn', `No ACK from switch within ${this.ackTimeoutMs} ms for ${entry.hex}`)
    if (entry.input !== undefined && this.feedbackMode === 'ack') {
      this.setSelectionStatus(`No ACK (Input ${entry.input})`)
    }
    this.checkFeedbacks('input_pending')
  }

  private clearPending(reason: string): void {
    if (this.pending.length === 0) return
    if (this.config.debug) this.log('debug', `Dropping ${this.pending.length} pending command(s): ${reason}`)
    for (const p of this.pending) clearTimeout(p.timer)
    this.pending = []
    this.checkFeedbacks('input_pending')
  }

  private setSelected(input: number): void {
    this.selectedInput = input
    this.setVariableValues({ current_input: `Input ${input}`, current_input_number: String(input) })
  }

  private setSelectionStatus(status: string): void {
    this.setVariableValues({ selection_status: status })
  }

  // --- sending -----------------------------------------------------------------

  async selectInput(input: number): Promise<void> {
    const command = ROUTE_COMMANDS[input]
    if (!command) {
      this.log('error', `No command configured for input ${input}`)
      return
    }
    await this.sendHex(command)
  }

  async sendHex(hex: string): Promise<boolean> {
    try {
      const buffer = parseHexString(hex)
      const pretty = formatBufferHex(buffer)

      if (!this.socket || this.socket.destroyed || !this.socket.writable) {
        this.openConnection()
        throw new Error('TCP socket is not connected yet. Try again after status shows OK.')
      }

      await new Promise<void>((resolve, reject) => {
        this.socket!.write(buffer, (err?: Error | null) => {
          if (err) reject(err)
          else resolve()
        })
      })

      this.setVariableValues({ last_command_hex: pretty })
      if (this.config.debug) this.log('debug', `TX: ${pretty}`)
      this.afterWrite(buffer, pretty)
      return true
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      this.log('error', `Failed to send hex command: ${message}`)
      this.updateStatus(InstanceStatus.UnknownError, message)
      return false
    }
  }

  private afterWrite(buffer: Buffer, pretty: string): void {
    const input = inputForCommand(buffer)

    if (this.feedbackMode === 'write') {
      // v1.0.0 behaviour: state follows a successful socket write.
      if (input !== undefined) {
        this.setSelected(input)
        this.setSelectionStatus('Sent (not ACK-checked)')
        this.checkFeedbacks('input_selected')
      }
    } else if (input !== undefined) {
      this.setSelectionStatus(`Pending (Input ${input})`)
    }

    // Track every command (including raw hex) so ACKs stay matched in order.
    const func = buffer[0] === STX && buffer.length >= 4 ? String.fromCharCode(buffer[3]) : undefined
    const entry: PendingCommand = { input, func, hex: pretty, sentAt: Date.now(), timer: undefined as any }
    entry.timer = setTimeout(() => this.onAckTimeout(entry), this.ackTimeoutMs)
    this.pending.push(entry)
    if (input !== undefined) this.checkFeedbacks('input_pending')
  }
}

export { QuintechRfRouterInstance }

runEntrypoint(QuintechRfRouterInstance, [])

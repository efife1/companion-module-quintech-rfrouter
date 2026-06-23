import net from 'node:net'
import {
  InstanceBase,
  InstanceStatus,
  runEntrypoint,
  type SomeCompanionConfigField,
} from '@companion-module/base'
import { getConfigFields, type ModuleConfig } from './config.js'
import { getActions } from './actions.js'
import { getPresets } from './presets.js'
import { ROUTE_COMMANDS, formatBufferHex, parseHexString } from './commands.js'

export default class QuintechRfRouterInstance extends InstanceBase<ModuleConfig, undefined> {
  config: ModuleConfig = {}
  private socket?: net.Socket
  private reconnectTimer?: NodeJS.Timeout
  private connecting = false
  private shuttingDown = false

  constructor(internal: unknown) {
    super(internal as any)
  }

  async init(config: ModuleConfig, _isFirstInit: boolean, _secrets: undefined): Promise<void> {
    this.config = config
    this.setActionDefinitions(getActions(this))
    this.setPresetDefinitions(getPresets() as any)
    this.setVariableDefinitions(this.getVariableDefinitions())
    this.setVariableValues({ current_input: 'Unknown', current_input_number: '', last_command_hex: '' })

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

  private getVariableDefinitions(): any {
    return [
      { variableId: 'current_input', name: 'Current selected RF input label' },
      { variableId: 'current_input_number', name: 'Current selected RF input number' },
      { variableId: 'last_command_hex', name: 'Last hex command sent' },
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
      this.updateStatus(InstanceStatus.Ok, `Connected to ${host}:${port}`)
      if (this.config.debug) this.log('debug', `TCP connected to ${host}:${port}`)
    })

    socket.on('data', (data: Buffer) => {
      if (this.config.debug) this.log('debug', `RX: ${formatBufferHex(data)}`)
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
  }

  async selectInput(input: number): Promise<void> {
    const command = ROUTE_COMMANDS[input]
    if (!command) {
      this.log('error', `No command configured for input ${input}`)
      return
    }

    const sent = await this.sendHex(command)
    if (sent) {
      this.setVariableValues({ current_input: `Input ${input}`, current_input_number: String(input) })
    }
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
      return true
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      this.log('error', `Failed to send hex command: ${message}`)
      this.updateStatus(InstanceStatus.UnknownError, message)
      return false
    }
  }
}

export { QuintechRfRouterInstance }

runEntrypoint(QuintechRfRouterInstance, [])

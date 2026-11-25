import type { SomeCompanionConfigField } from '@companion-module/base'

export type FeedbackMode = 'ack' | 'write'

export interface ModuleConfig {
  host?: string
  port?: number
  connectAtStartup?: boolean
  debug?: boolean
  // v1.1.0
  feedbackMode?: FeedbackMode
  ackTimeoutMs?: number
  // v1.2.0
  statusQueryAtConnect?: boolean
  statusPollMs?: number
}

export const DEFAULT_ACK_TIMEOUT_MS = 1000
export const DEFAULT_STATUS_POLL_MS = 2000

export function getConfigFields(): SomeCompanionConfigField[] {
  return [
    {
      type: 'textinput',
      id: 'host',
      label: 'Quintech Switch IP Address / Hostname',
      width: 8,
      default: '',
      regex: '/^.+$/',
    },
    {
      type: 'number',
      id: 'port',
      label: 'Quintech TCP Port',
      width: 4,
      min: 1,
      max: 65535,
      default: 9100,
    },
    {
      type: 'checkbox',
      id: 'connectAtStartup',
      label: 'Connect at startup',
      width: 6,
      default: true,
    },
    {
      type: 'checkbox',
      id: 'debug',
      label: 'Debug logging',
      width: 6,
      default: false,
    },
    {
      type: 'static-text',
      id: 'feedbackInfo',
      label: 'Button feedback',
      width: 12,
      value:
        'The switch ACKs each selection but never announces changes on its own. The module asks it for the active input (Quintech "Q" status query) on connect and at the poll interval, so front-panel changes are shown too.',
    },
    {
      type: 'dropdown',
      id: 'feedbackMode',
      label: 'Feedback source',
      width: 6,
      default: 'ack',
      choices: [
        { id: 'ack', label: 'Switch ACK (recommended)' },
        { id: 'write', label: 'Command sent (v1.0.0 behaviour, no ACK check)' },
      ],
    },
    {
      type: 'number',
      id: 'ackTimeoutMs',
      label: 'ACK timeout (ms)',
      width: 6,
      min: 100,
      max: 10000,
      default: DEFAULT_ACK_TIMEOUT_MS,
    },
    {
      type: 'checkbox',
      id: 'statusQueryAtConnect',
      label: 'Query switch status on connect',
      width: 6,
      default: true,
    },
    {
      type: 'number',
      id: 'statusPollMs',
      label: 'Status poll interval (ms, 0 = off)',
      width: 6,
      min: 0,
      max: 60000,
      default: DEFAULT_STATUS_POLL_MS,
    },
  ]
}

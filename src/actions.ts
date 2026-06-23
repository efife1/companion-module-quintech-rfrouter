import { combineRgb, type CompanionActionDefinitions } from '@companion-module/base'
import type { QuintechRfRouterInstance } from './main.js'

export function getActions(instance: QuintechRfRouterInstance): CompanionActionDefinitions {
  return {
    select_input: {
      name: 'Select RF Input',
      options: [
        {
          type: 'dropdown',
          id: 'input',
          label: 'Input Port',
          default: 1,
          choices: Array.from({ length: 16 }, (_, i) => ({ id: i + 1, label: `Input ${i + 1}` })),
        },
      ],
      callback: async (event) => {
        const input = Number(event.options.input)
        await instance.selectInput(input)
      },
    },
    raw_hex: {
      name: 'Send Raw Hex Command',
      options: [
        {
          type: 'textinput',
          id: 'hex',
          label: 'Hex bytes',
          default: '02 30 31 03',
          tooltip: 'Spaces and 0x prefixes are allowed. Example: 02 30 31 03',
        },
      ],
      callback: async (event) => {
        await instance.sendHex(String(event.options.hex))
      },
    },
  }
}

export const presetColors = {
  bg: combineRgb(40, 40, 40),
  fg: combineRgb(255, 255, 255),
}

import type { CompanionPresetDefinitions } from '@companion-module/base'
import { presetColors } from './actions.js'
import { feedbackColors } from './feedbacks.js'

export function getPresets(): CompanionPresetDefinitions {
  const presets: CompanionPresetDefinitions = {}

  for (let input = 1; input <= 16; input++) {
    presets[`input_${input}`] = {
      type: 'button',
      category: 'RF Inputs',
      name: `Input ${input}`,
      style: {
        text: `RF\\n${input}`,
        size: '18',
        color: presetColors.fg,
        bgcolor: presetColors.bg,
      },
      steps: [
        {
          down: [
            {
              actionId: 'select_input',
              options: { input },
            },
          ],
          up: [],
        },
      ],
      feedbacks: [
        {
          feedbackId: 'input_pending',
          options: { input },
          style: { bgcolor: feedbackColors.pendingBg, color: feedbackColors.pendingFg },
        },
        {
          feedbackId: 'input_selected',
          options: { input },
          style: { bgcolor: feedbackColors.selectedBg, color: feedbackColors.selectedFg },
        },
      ],
    }
  }

  return presets
}

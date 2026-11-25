import { combineRgb, type CompanionFeedbackDefinitions } from '@companion-module/base'
import type { QuintechRfRouterInstance } from './main.js'

const inputChoices = Array.from({ length: 16 }, (_, i) => ({ id: i + 1, label: `Input ${i + 1}` }))

export const feedbackColors = {
  selectedBg: combineRgb(0, 170, 0),
  selectedFg: combineRgb(255, 255, 255),
  pendingBg: combineRgb(200, 140, 0),
  pendingFg: combineRgb(0, 0, 0),
}

export function getFeedbacks(instance: QuintechRfRouterInstance): CompanionFeedbackDefinitions {
  return {
    input_selected: {
      type: 'boolean',
      name: 'Input is selected (confirmed by switch)',
      description:
        'True when the switch reports this input as active: from the ACK of a Companion selection, or from the status poll (which also picks up front-panel changes).',
      defaultStyle: { bgcolor: feedbackColors.selectedBg, color: feedbackColors.selectedFg },
      options: [{ type: 'dropdown', id: 'input', label: 'Input Port', default: 1, choices: inputChoices }],
      callback: (feedback) => instance.selectedInput === Number(feedback.options.input),
    },
    input_pending: {
      type: 'boolean',
      name: 'Input selection is pending (sent, awaiting switch ACK)',
      defaultStyle: { bgcolor: feedbackColors.pendingBg, color: feedbackColors.pendingFg },
      options: [{ type: 'dropdown', id: 'input', label: 'Input Port', default: 1, choices: inputChoices }],
      callback: (feedback) => instance.isPending(Number(feedback.options.input)),
    },
  }
}

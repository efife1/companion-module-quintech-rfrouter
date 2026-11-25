"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.feedbackColors = void 0;
exports.getFeedbacks = getFeedbacks;
const base_1 = require("@companion-module/base");
const inputChoices = Array.from({ length: 16 }, (_, i) => ({ id: i + 1, label: `Input ${i + 1}` }));
exports.feedbackColors = {
    selectedBg: (0, base_1.combineRgb)(0, 170, 0),
    selectedFg: (0, base_1.combineRgb)(255, 255, 255),
    pendingBg: (0, base_1.combineRgb)(200, 140, 0),
    pendingFg: (0, base_1.combineRgb)(0, 0, 0),
};
function getFeedbacks(instance) {
    return {
        input_selected: {
            type: 'boolean',
            name: 'Input is selected (confirmed by switch)',
            description: 'True when the switch reports this input as active: from the ACK of a Companion selection, or from the status poll (which also picks up front-panel changes).',
            defaultStyle: { bgcolor: exports.feedbackColors.selectedBg, color: exports.feedbackColors.selectedFg },
            options: [{ type: 'dropdown', id: 'input', label: 'Input Port', default: 1, choices: inputChoices }],
            callback: (feedback) => instance.selectedInput === Number(feedback.options.input),
        },
        input_pending: {
            type: 'boolean',
            name: 'Input selection is pending (sent, awaiting switch ACK)',
            defaultStyle: { bgcolor: exports.feedbackColors.pendingBg, color: exports.feedbackColors.pendingFg },
            options: [{ type: 'dropdown', id: 'input', label: 'Input Port', default: 1, choices: inputChoices }],
            callback: (feedback) => instance.isPending(Number(feedback.options.input)),
        },
    };
}

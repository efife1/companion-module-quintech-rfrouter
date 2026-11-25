"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getPresets = getPresets;
const actions_js_1 = require("./actions.js");
const feedbacks_js_1 = require("./feedbacks.js");
function getPresets() {
    const presets = {};
    for (let input = 1; input <= 16; input++) {
        presets[`input_${input}`] = {
            type: 'button',
            category: 'RF Inputs',
            name: `Input ${input}`,
            style: {
                text: `RF\\n${input}`,
                size: '18',
                color: actions_js_1.presetColors.fg,
                bgcolor: actions_js_1.presetColors.bg,
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
                    style: { bgcolor: feedbacks_js_1.feedbackColors.pendingBg, color: feedbacks_js_1.feedbackColors.pendingFg },
                },
                {
                    feedbackId: 'input_selected',
                    options: { input },
                    style: { bgcolor: feedbacks_js_1.feedbackColors.selectedBg, color: feedbacks_js_1.feedbackColors.selectedFg },
                },
            ],
        };
    }
    return presets;
}

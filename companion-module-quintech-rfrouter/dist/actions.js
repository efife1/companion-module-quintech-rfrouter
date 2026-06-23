"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.presetColors = void 0;
exports.getActions = getActions;
const base_1 = require("@companion-module/base");
function getActions(instance) {
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
                const input = Number(event.options.input);
                await instance.selectInput(input);
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
                await instance.sendHex(String(event.options.hex));
            },
        },
    };
}
exports.presetColors = {
    bg: (0, base_1.combineRgb)(40, 40, 40),
    fg: (0, base_1.combineRgb)(255, 255, 255),
};

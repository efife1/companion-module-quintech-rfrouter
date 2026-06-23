"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getConfigFields = getConfigFields;
function getConfigFields() {
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
    ];
}

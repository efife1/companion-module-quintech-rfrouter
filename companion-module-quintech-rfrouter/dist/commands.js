"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ROUTE_COMMANDS = void 0;
exports.parseHexString = parseHexString;
exports.formatBufferHex = formatBufferHex;
exports.ROUTE_COMMANDS = {
    1: '02 46 46 53 30 31 03 53',
    2: '02 46 46 53 30 32 03 50',
    3: '02 46 46 53 30 33 03 51',
    4: '02 46 46 53 30 34 03 56',
    5: '02 46 46 53 30 35 03 57',
    6: '02 46 46 53 30 36 03 54',
    7: '02 46 46 53 30 37 03 55',
    8: '02 46 46 53 30 38 03 5A',
    9: '02 46 46 53 30 39 03 5B',
    10: '02 46 46 53 31 30 03 53',
    11: '02 46 46 53 31 31 03 52',
    12: '02 46 46 53 31 32 03 51',
    13: '02 46 46 53 31 33 03 50',
    14: '02 46 46 53 31 34 03 57',
    15: '02 46 46 53 31 35 03 56',
    16: '02 46 46 53 31 36 03 55',
};
function parseHexString(input) {
    const cleaned = input.replace(/0x/gi, '').replace(/%/g, '').replace(/[^a-fA-F0-9]/g, '');
    if (cleaned.length === 0)
        throw new Error('Empty hex command');
    if (cleaned.length % 2 !== 0)
        throw new Error(`Odd number of hex characters: ${cleaned}`);
    return Buffer.from(cleaned, 'hex');
}
function formatBufferHex(buffer) {
    return buffer.toString('hex').match(/.{1,2}/g)?.join(' ').toUpperCase() ?? '';
}

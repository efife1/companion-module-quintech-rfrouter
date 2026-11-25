export declare const ROUTE_COMMANDS: Record<number, string>;
export declare function parseHexString(input: string): Buffer;
export declare function formatBufferHex(buffer: Buffer): string;
/** If the bytes are exactly one of the 16 route commands, return that input number. */
export declare function inputForCommand(buffer: Buffer): number | undefined;
export declare const STX = 2;
export declare const ETX = 3;
export declare const ACK = 6;
export declare const NAK = 21;
export declare const ADDRESS = "FF";
export declare function xorChecksum(bytes: Buffer): number;
/** Build STX ADR ADR <command+data> ETX CHK. */
export declare function buildCommand(commandAndData: string, address?: string): Buffer;
/** "Q" status query from the SRR 16x1 manual: 02 46 46 51 03 50 */
export declare const STATUS_QUERY: Buffer<ArrayBufferLike>;
export type ProtocolReply = {
    kind: 'ack' | 'nak';
    raw: Buffer;
    func: string;
    data: string;
};
export type ReplyFrame = ProtocolReply | {
    kind: 'other';
    raw: Buffer;
    checksumOk: boolean;
};
/** If a Q-reply's data is a plain input number 1-16, return it; otherwise undefined. */
export declare function parseStatusData(data: string): number | undefined;
/**
 * Incremental parser for the switch -> Companion byte stream. Handles replies split
 * across TCP segments or several replies in one segment. A frame runs from its header
 * byte to the first ETX, followed by one checksum byte.
 */
export declare class ReplyParser {
    private buf;
    private static readonly MAX_BUFFER;
    push(data: Buffer): ReplyFrame[];
    reset(): void;
}

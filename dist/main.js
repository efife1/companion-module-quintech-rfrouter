"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.QuintechRfRouterInstance = void 0;
const node_net_1 = __importDefault(require("node:net"));
const base_1 = require("@companion-module/base");
const config_js_1 = require("./config.js");
const actions_js_1 = require("./actions.js");
const feedbacks_js_1 = require("./feedbacks.js");
const presets_js_1 = require("./presets.js");
const commands_js_1 = require("./commands.js");
class QuintechRfRouterInstance extends base_1.InstanceBase {
    config = {};
    /** Last input the switch confirmed (or, in 'write' mode, last input sent). */
    selectedInput;
    socket;
    reconnectTimer;
    connecting = false;
    shuttingDown = false;
    parser = new commands_js_1.ReplyParser();
    /** Commands written and awaiting ACK, oldest first. The ACK carries no port, so it is matched FIFO. */
    pending = [];
    pollTimer;
    reportedUnknownStatus = new Set();
    constructor(internal) {
        super(internal);
    }
    async init(config, _isFirstInit, _secrets) {
        this.config = config;
        this.setActionDefinitions((0, actions_js_1.getActions)(this));
        this.setFeedbackDefinitions((0, feedbacks_js_1.getFeedbacks)(this));
        this.setPresetDefinitions((0, presets_js_1.getPresets)());
        this.setVariableDefinitions(this.getVariableDefinitions());
        this.setVariableValues({
            current_input: 'Unknown',
            current_input_number: '',
            last_command_hex: '',
            selection_status: 'Unknown',
            last_ack_latency_ms: '',
            switch_status_raw: '',
        });
        if (config.connectAtStartup !== false) {
            this.openConnection();
        }
        else {
            this.updateStatus(base_1.InstanceStatus.Disconnected, 'Connect at startup disabled');
        }
    }
    async configUpdated(config, _secrets) {
        this.config = config;
        this.closeConnection();
        if (config.connectAtStartup !== false) {
            this.openConnection();
        }
        else {
            this.updateStatus(base_1.InstanceStatus.Disconnected, 'Connect at startup disabled');
        }
    }
    getConfigFields() {
        return (0, config_js_1.getConfigFields)();
    }
    async destroy() {
        this.shuttingDown = true;
        this.closeConnection();
    }
    get feedbackMode() {
        return this.config.feedbackMode === 'write' ? 'write' : 'ack';
    }
    get ackTimeoutMs() {
        const v = Number(this.config.ackTimeoutMs);
        return Number.isFinite(v) && v >= 100 ? v : config_js_1.DEFAULT_ACK_TIMEOUT_MS;
    }
    isPending(input) {
        return this.pending.some((p) => p.input === input);
    }
    getVariableDefinitions() {
        return [
            { variableId: 'current_input', name: 'Current selected RF input label' },
            { variableId: 'current_input_number', name: 'Current selected RF input number' },
            { variableId: 'last_command_hex', name: 'Last hex command sent' },
            { variableId: 'selection_status', name: 'Selection status (Confirmed / Pending / No ACK / Unknown)' },
            { variableId: 'last_ack_latency_ms', name: 'Last switch ACK latency (ms)' },
            { variableId: 'switch_status_raw', name: 'Raw data of last status (Q) reply from switch' },
        ];
    }
    openConnection() {
        const host = this.config.host;
        const port = Number(this.config.port ?? 9100);
        if (!host || !port) {
            this.updateStatus(base_1.InstanceStatus.BadConfig, 'Router host and TCP port are required');
            return;
        }
        if (this.socket || this.connecting)
            return;
        this.shuttingDown = false;
        this.connecting = true;
        this.updateStatus(base_1.InstanceStatus.Connecting, `Connecting to ${host}:${port}`);
        const socket = new node_net_1.default.Socket();
        this.socket = socket;
        socket.setNoDelay(true);
        socket.setKeepAlive(true, 1000);
        socket.setTimeout(3000);
        socket.once('connect', () => {
            this.connecting = false;
            socket.setTimeout(0);
            this.parser.reset();
            this.updateStatus(base_1.InstanceStatus.Ok, `Connected to ${host}:${port}`);
            if (this.config.debug)
                this.log('debug', `TCP connected to ${host}:${port}`);
            this.startPolling();
        });
        socket.on('data', (data) => {
            if (this.config.debug)
                this.log('debug', `RX: ${(0, commands_js_1.formatBufferHex)(data)}`);
            this.handleReplyData(data);
        });
        socket.on('timeout', () => {
            if (this.config.debug)
                this.log('debug', 'TCP timeout');
            socket.destroy();
        });
        socket.on('error', (err) => {
            this.connecting = false;
            this.updateStatus(base_1.InstanceStatus.ConnectionFailure, err.message);
            if (this.config.debug)
                this.log('debug', `TCP error: ${err.message}`);
        });
        socket.on('close', () => {
            this.connecting = false;
            if (this.socket === socket)
                this.socket = undefined;
            this.stopPolling();
            this.clearPending('connection closed');
            if (!this.shuttingDown && this.config.connectAtStartup !== false) {
                this.updateStatus(base_1.InstanceStatus.ConnectionFailure, 'TCP connection closed; reconnecting');
                this.scheduleReconnect();
            }
        });
        socket.connect(port, host);
    }
    scheduleReconnect() {
        if (this.reconnectTimer || this.shuttingDown)
            return;
        this.reconnectTimer = setTimeout(() => {
            this.reconnectTimer = undefined;
            this.openConnection();
        }, 1000);
    }
    closeConnection() {
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = undefined;
        }
        if (this.socket) {
            this.socket.removeAllListeners();
            this.socket.destroy();
            this.socket = undefined;
        }
        this.connecting = false;
        this.stopPolling();
        this.clearPending('connection reset');
        this.parser.reset();
    }
    // --- reply / feedback handling -------------------------------------------------
    handleReplyData(data) {
        for (const frame of this.parser.push(data)) {
            if (frame.kind === 'other') {
                this.log('warn', `Unrecognised bytes from switch${frame.checksumOk ? '' : ' (no valid frame/checksum)'}: ${(0, commands_js_1.formatBufferHex)(frame.raw)}`);
                continue;
            }
            const entry = this.takePending(frame.func);
            if (!entry) {
                if (this.config.debug)
                    this.log('debug', `${frame.kind.toUpperCase()} "${frame.func}" with no matching command pending — ignored: ${(0, commands_js_1.formatBufferHex)(frame.raw)}`);
                continue;
            }
            clearTimeout(entry.timer);
            if (frame.kind === 'nak')
                this.onNak(entry, frame);
            else if (frame.func === 'Q')
                this.onStatusReply(entry, frame);
            else
                this.onAck(entry);
        }
    }
    /** Oldest pending command with the same command letter; falls back to the oldest pending. */
    takePending(func) {
        let idx = this.pending.findIndex((p) => p.func === func);
        if (idx < 0)
            idx = this.pending.findIndex((p) => p.func === undefined);
        if (idx < 0)
            return undefined;
        return this.pending.splice(idx, 1)[0];
    }
    onAck(entry) {
        const latency = Date.now() - entry.sentAt;
        this.setVariableValues({ last_ack_latency_ms: String(latency) });
        if (this.config.debug)
            this.log('debug', `ACK for ${entry.hex} after ${latency} ms`);
        if (entry.input !== undefined && this.feedbackMode === 'ack') {
            this.setSelected(entry.input);
            this.setSelectionStatus('Confirmed');
        }
        this.checkFeedbacks('input_pending', 'input_selected');
    }
    onNak(entry, frame) {
        this.log('warn', `Switch rejected (NAK) ${entry.hex}: ${(0, commands_js_1.formatBufferHex)(frame.raw)}`);
        if (entry.input !== undefined)
            this.setSelectionStatus(`Rejected (Input ${entry.input})`);
        this.checkFeedbacks('input_pending');
    }
    onStatusReply(entry, frame) {
        this.setVariableValues({ switch_status_raw: frame.data });
        if (this.config.debug)
            this.log('debug', `Status reply after ${Date.now() - entry.sentAt} ms: data "${frame.data}" (${(0, commands_js_1.formatBufferHex)(frame.raw)})`);
        const input = (0, commands_js_1.parseStatusData)(frame.data);
        if (input === undefined) {
            if (!this.reportedUnknownStatus.has(frame.data)) {
                this.reportedUnknownStatus.add(frame.data);
                this.log('warn', `Status (Q) reply not understood, data "${frame.data}": ${(0, commands_js_1.formatBufferHex)(frame.raw)}`);
            }
            return;
        }
        // Do not let a poll overwrite a selection that is still waiting for its ACK.
        if (this.pending.some((p) => p.input !== undefined))
            return;
        if (this.selectedInput !== input) {
            if (this.selectedInput !== undefined)
                this.log('info', `Switch reports input ${input} (was ${this.selectedInput}) — changed outside Companion or confirmed by status`);
            this.setSelected(input);
            this.checkFeedbacks('input_selected');
        }
        this.setSelectionStatus('Confirmed (switch status)');
    }
    // --- status polling ----------------------------------------------------------
    get statusPollMs() {
        const v = Number(this.config.statusPollMs ?? config_js_1.DEFAULT_STATUS_POLL_MS);
        return Number.isFinite(v) && v >= 250 ? v : 0;
    }
    startPolling() {
        this.stopPolling();
        if (this.config.statusQueryAtConnect !== false)
            void this.queryStatus();
        const ms = this.statusPollMs;
        if (ms > 0)
            this.pollTimer = setInterval(() => void this.queryStatus(true), ms);
    }
    stopPolling() {
        if (this.pollTimer)
            clearInterval(this.pollTimer);
        this.pollTimer = undefined;
    }
    /** Send the documented Q status query. Polls are skipped while any command is outstanding. */
    async queryStatus(isPoll = false) {
        if (isPoll && this.pending.length > 0)
            return;
        const socket = this.socket;
        if (!socket || socket.destroyed || !socket.writable || this.connecting)
            return;
        const pretty = (0, commands_js_1.formatBufferHex)(commands_js_1.STATUS_QUERY);
        try {
            await new Promise((resolve, reject) => socket.write(commands_js_1.STATUS_QUERY, (err) => (err ? reject(err) : resolve())));
            if (this.config.debug)
                this.log('debug', `TX: ${pretty} (status query)`);
            const entry = { func: 'Q', hex: pretty, sentAt: Date.now(), poll: isPoll, timer: undefined };
            entry.timer = setTimeout(() => this.onAckTimeout(entry), this.ackTimeoutMs);
            this.pending.push(entry);
        }
        catch (err) {
            this.log('warn', `Status query failed: ${err instanceof Error ? err.message : String(err)}`);
        }
    }
    onAckTimeout(entry) {
        const idx = this.pending.indexOf(entry);
        if (idx < 0)
            return;
        this.pending.splice(idx, 1);
        if (entry.func === 'Q') {
            if (!this.reportedUnknownStatus.has('<timeout>')) {
                this.reportedUnknownStatus.add('<timeout>');
                this.log('warn', `No reply to status query ${entry.hex} within ${this.ackTimeoutMs} ms (further timeouts not logged)`);
            }
            return;
        }
        this.log('warn', `No ACK from switch within ${this.ackTimeoutMs} ms for ${entry.hex}`);
        if (entry.input !== undefined && this.feedbackMode === 'ack') {
            this.setSelectionStatus(`No ACK (Input ${entry.input})`);
        }
        this.checkFeedbacks('input_pending');
    }
    clearPending(reason) {
        if (this.pending.length === 0)
            return;
        if (this.config.debug)
            this.log('debug', `Dropping ${this.pending.length} pending command(s): ${reason}`);
        for (const p of this.pending)
            clearTimeout(p.timer);
        this.pending = [];
        this.checkFeedbacks('input_pending');
    }
    setSelected(input) {
        this.selectedInput = input;
        this.setVariableValues({ current_input: `Input ${input}`, current_input_number: String(input) });
    }
    setSelectionStatus(status) {
        this.setVariableValues({ selection_status: status });
    }
    // --- sending -----------------------------------------------------------------
    async selectInput(input) {
        const command = commands_js_1.ROUTE_COMMANDS[input];
        if (!command) {
            this.log('error', `No command configured for input ${input}`);
            return;
        }
        await this.sendHex(command);
    }
    async sendHex(hex) {
        try {
            const buffer = (0, commands_js_1.parseHexString)(hex);
            const pretty = (0, commands_js_1.formatBufferHex)(buffer);
            if (!this.socket || this.socket.destroyed || !this.socket.writable) {
                this.openConnection();
                throw new Error('TCP socket is not connected yet. Try again after status shows OK.');
            }
            await new Promise((resolve, reject) => {
                this.socket.write(buffer, (err) => {
                    if (err)
                        reject(err);
                    else
                        resolve();
                });
            });
            this.setVariableValues({ last_command_hex: pretty });
            if (this.config.debug)
                this.log('debug', `TX: ${pretty}`);
            this.afterWrite(buffer, pretty);
            return true;
        }
        catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            this.log('error', `Failed to send hex command: ${message}`);
            this.updateStatus(base_1.InstanceStatus.UnknownError, message);
            return false;
        }
    }
    afterWrite(buffer, pretty) {
        const input = (0, commands_js_1.inputForCommand)(buffer);
        if (this.feedbackMode === 'write') {
            // v1.0.0 behaviour: state follows a successful socket write.
            if (input !== undefined) {
                this.setSelected(input);
                this.setSelectionStatus('Sent (not ACK-checked)');
                this.checkFeedbacks('input_selected');
            }
        }
        else if (input !== undefined) {
            this.setSelectionStatus(`Pending (Input ${input})`);
        }
        // Track every command (including raw hex) so ACKs stay matched in order.
        const func = buffer[0] === commands_js_1.STX && buffer.length >= 4 ? String.fromCharCode(buffer[3]) : undefined;
        const entry = { input, func, hex: pretty, sentAt: Date.now(), timer: undefined };
        entry.timer = setTimeout(() => this.onAckTimeout(entry), this.ackTimeoutMs);
        this.pending.push(entry);
        if (input !== undefined)
            this.checkFeedbacks('input_pending');
    }
}
exports.default = QuintechRfRouterInstance;
exports.QuintechRfRouterInstance = QuintechRfRouterInstance;
(0, base_1.runEntrypoint)(QuintechRfRouterInstance, []);

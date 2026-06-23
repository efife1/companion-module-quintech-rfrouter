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
const presets_js_1 = require("./presets.js");
const commands_js_1 = require("./commands.js");
class QuintechRfRouterInstance extends base_1.InstanceBase {
    config = {};
    socket;
    reconnectTimer;
    connecting = false;
    shuttingDown = false;
    constructor(internal) {
        super(internal);
    }
    async init(config, _isFirstInit, _secrets) {
        this.config = config;
        this.setActionDefinitions((0, actions_js_1.getActions)(this));
        this.setPresetDefinitions((0, presets_js_1.getPresets)());
        this.setVariableDefinitions(this.getVariableDefinitions());
        this.setVariableValues({ current_input: 'Unknown', current_input_number: '', last_command_hex: '' });
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
    getVariableDefinitions() {
        return [
            { variableId: 'current_input', name: 'Current selected RF input label' },
            { variableId: 'current_input_number', name: 'Current selected RF input number' },
            { variableId: 'last_command_hex', name: 'Last hex command sent' },
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
            this.updateStatus(base_1.InstanceStatus.Ok, `Connected to ${host}:${port}`);
            if (this.config.debug)
                this.log('debug', `TCP connected to ${host}:${port}`);
        });
        socket.on('data', (data) => {
            if (this.config.debug)
                this.log('debug', `RX: ${(0, commands_js_1.formatBufferHex)(data)}`);
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
    }
    async selectInput(input) {
        const command = commands_js_1.ROUTE_COMMANDS[input];
        if (!command) {
            this.log('error', `No command configured for input ${input}`);
            return;
        }
        const sent = await this.sendHex(command);
        if (sent) {
            this.setVariableValues({ current_input: `Input ${input}`, current_input_number: String(input) });
        }
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
            return true;
        }
        catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            this.log('error', `Failed to send hex command: ${message}`);
            this.updateStatus(base_1.InstanceStatus.UnknownError, message);
            return false;
        }
    }
}
exports.default = QuintechRfRouterInstance;
exports.QuintechRfRouterInstance = QuintechRfRouterInstance;
(0, base_1.runEntrypoint)(QuintechRfRouterInstance, []);

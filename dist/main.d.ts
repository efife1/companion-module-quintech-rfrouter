import { InstanceBase, type SomeCompanionConfigField } from '@companion-module/base';
import { type ModuleConfig } from './config.js';
export default class QuintechRfRouterInstance extends InstanceBase<ModuleConfig, undefined> {
    config: ModuleConfig;
    /** Last input the switch confirmed (or, in 'write' mode, last input sent). */
    selectedInput?: number;
    private socket?;
    private reconnectTimer?;
    private connecting;
    private shuttingDown;
    private readonly parser;
    /** Commands written and awaiting ACK, oldest first. The ACK carries no port, so it is matched FIFO. */
    private pending;
    private pollTimer?;
    private readonly reportedUnknownStatus;
    constructor(internal: unknown);
    init(config: ModuleConfig, _isFirstInit: boolean, _secrets: undefined): Promise<void>;
    configUpdated(config: ModuleConfig, _secrets: undefined): Promise<void>;
    getConfigFields(): SomeCompanionConfigField[];
    destroy(): Promise<void>;
    private get feedbackMode();
    private get ackTimeoutMs();
    isPending(input: number): boolean;
    private getVariableDefinitions;
    private openConnection;
    private scheduleReconnect;
    private closeConnection;
    private handleReplyData;
    /** Oldest pending command with the same command letter; falls back to the oldest pending. */
    private takePending;
    private onAck;
    private onNak;
    private onStatusReply;
    private get statusPollMs();
    private startPolling;
    private stopPolling;
    /** Send the documented Q status query. Polls are skipped while any command is outstanding. */
    queryStatus(isPoll?: boolean): Promise<void>;
    private onAckTimeout;
    private clearPending;
    private setSelected;
    private setSelectionStatus;
    selectInput(input: number): Promise<void>;
    sendHex(hex: string): Promise<boolean>;
    private afterWrite;
}
export { QuintechRfRouterInstance };

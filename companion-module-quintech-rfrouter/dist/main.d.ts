import { InstanceBase, type SomeCompanionConfigField } from '@companion-module/base';
import { type ModuleConfig } from './config.js';
export default class QuintechRfRouterInstance extends InstanceBase<ModuleConfig, undefined> {
    config: ModuleConfig;
    private socket?;
    private reconnectTimer?;
    private connecting;
    private shuttingDown;
    constructor(internal: unknown);
    init(config: ModuleConfig, _isFirstInit: boolean, _secrets: undefined): Promise<void>;
    configUpdated(config: ModuleConfig, _secrets: undefined): Promise<void>;
    getConfigFields(): SomeCompanionConfigField[];
    destroy(): Promise<void>;
    private getVariableDefinitions;
    private openConnection;
    private scheduleReconnect;
    private closeConnection;
    selectInput(input: number): Promise<void>;
    sendHex(hex: string): Promise<boolean>;
}
export { QuintechRfRouterInstance };

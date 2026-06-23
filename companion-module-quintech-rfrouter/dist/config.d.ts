import type { SomeCompanionConfigField } from '@companion-module/base';
export interface ModuleConfig {
    host?: string;
    port?: number;
    connectAtStartup?: boolean;
    debug?: boolean;
}
export declare function getConfigFields(): SomeCompanionConfigField[];

import type { SomeCompanionConfigField } from '@companion-module/base';
export type FeedbackMode = 'ack' | 'write';
export interface ModuleConfig {
    host?: string;
    port?: number;
    connectAtStartup?: boolean;
    debug?: boolean;
    feedbackMode?: FeedbackMode;
    ackTimeoutMs?: number;
    statusQueryAtConnect?: boolean;
    statusPollMs?: number;
}
export declare const DEFAULT_ACK_TIMEOUT_MS = 1000;
export declare const DEFAULT_STATUS_POLL_MS = 2000;
export declare function getConfigFields(): SomeCompanionConfigField[];

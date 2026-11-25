import { type CompanionFeedbackDefinitions } from '@companion-module/base';
import type { QuintechRfRouterInstance } from './main.js';
export declare const feedbackColors: {
    selectedBg: number;
    selectedFg: number;
    pendingBg: number;
    pendingFg: number;
};
export declare function getFeedbacks(instance: QuintechRfRouterInstance): CompanionFeedbackDefinitions;

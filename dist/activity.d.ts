import type { ActivityDataset, ActivityProvider, AiActivityCoverage, AiActivityDay } from "./types.js";
export type ActivitySummary = {
    total: number;
    activeDays: number;
    peak: number;
    peakDate: string | null;
    currentStreak: number | null;
    longestStreak: number;
    unknownDays: number;
};
export declare function parseDateKey(value: string): Date;
export declare function dateKey(value: Date): string;
export declare function addDays(value: Date, amount: number): Date;
export declare function getCalendarRange(to: string, weeks: number): {
    from: string;
    to: string;
};
export declare function trimToDisplayRange(data: ActivityDataset, weeks: number): ActivityDataset;
export declare function summarizeActivity(days: ReadonlyArray<{
    date: string;
    value: number;
    known?: boolean;
}>, range: {
    from: string;
    to: string;
}): ActivitySummary;
export declare function sumAiProviderTokens(providers: Partial<Record<ActivityProvider, number>> | null | undefined): number;
export declare function getAllAiTokens(day: AiActivityDay | undefined): number;
export declare function getProviderCoverage(data: ActivityDataset, provider: ActivityProvider): AiActivityCoverage | null;
export declare function isDateCovered(coverage: AiActivityCoverage | null, date: string): boolean;
export declare function formatCompactNumber(value: number): string;
export declare function formatExactNumber(value: number): string;
export declare function formatDateLong(value: string | null | undefined): string;
//# sourceMappingURL=activity.d.ts.map
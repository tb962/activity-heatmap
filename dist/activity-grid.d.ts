export type ActivityGridPoint = {
    date: string | Date;
    value: number;
    label?: string;
    known?: boolean;
};
export type ActivityGridDay = {
    key: string;
    date: Date;
    inside: boolean;
    value: number;
    known: boolean;
    data: ActivityGridPoint | null;
};
export type ActivityGridWeek = ActivityGridDay[];
export type ActivityGridResult = {
    weeks: ActivityGridWeek[];
    maximum: number;
    total: number;
    unknownDays: number;
    /** Upper bound of each shade band, ascending. Empty when nothing is active. */
    thresholds: number[];
    monthLabels: Array<{
        column: number;
        text: string;
    }>;
};
export declare function dayKey(value: string | Date): string;
/**
 * Shade bands are cut at quantiles of the active days rather than at fractions
 * of the maximum. Token counts are heavy-tailed — one long day can be 20x the
 * median — so linear-against-max collapses most of the calendar into the
 * palest shade. Ranking the active days keeps all four shades in use whatever
 * the unit is (tokens, contributions, messages, edited lines).
 */
export declare function quantileThresholds(values: readonly number[], bands?: number): number[];
export declare function activityLevel(value: number, maximumOrThresholds: number | readonly number[]): number;
export declare function columnsToCover(end: string | Date, minimumDays: number): number;
export declare function columnsWithin(end: string | Date, maximumDays: number): number;
export declare function gridMeasures({ width, desiredCell, gap, minimumColumns, maximumColumns, fitToWidth, }: {
    width: number;
    desiredCell?: number;
    gap?: number;
    minimumColumns?: number;
    maximumColumns?: number;
    fitToWidth?: boolean;
}): {
    columns: number;
    cell: number;
};
export declare function buildActivityGrid({ data, from, to, columns, }?: {
    data?: ActivityGridPoint[];
    from?: string | Date;
    to?: string | Date;
    columns?: number;
}): ActivityGridResult;
//# sourceMappingURL=activity-grid.d.ts.map
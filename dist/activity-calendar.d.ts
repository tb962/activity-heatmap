import { type ActivityGridDay, type ActivityGridPoint } from "./activity-grid.js";
type ActivityCalendarTheme = "dark" | "light";
/** How each day is drawn. "rounded" matches the familiar contribution grid. */
export type ActivityCellShape = "rounded" | "square" | "circle";
type ActivityRange = {
    from: string;
    to: string;
    days: number;
    columns: number;
};
export type ActivityCalendarProps = {
    theme?: ActivityCalendarTheme;
    data?: ActivityGridPoint[];
    to?: Date | string;
    weeks?: number;
    minDays?: number;
    maxDays?: number;
    fitToWidth?: boolean;
    title?: string;
    unitLabel?: string;
    showSummary?: boolean;
    baseColor?: string;
    /** Replace the whole shade ramp instead of deriving it from baseColor. */
    levelColors?: string[];
    /** Colour of a day with no activity. */
    emptyColor?: string;
    tooltip?: (day: ActivityGridDay) => string;
    cell?: number;
    gap?: number;
    shape?: ActivityCellShape;
    showLegend?: boolean;
    onRangeChange?: (range: ActivityRange) => void;
};
export declare function ActivityCalendar({ theme, data, to, weeks, minDays, maxDays, fitToWidth, title, unitLabel, showSummary, baseColor, levelColors, emptyColor, tooltip, cell, gap, shape, showLegend, onRangeChange, }: ActivityCalendarProps): import("react").JSX.Element;
export default ActivityCalendar;
//# sourceMappingURL=activity-calendar.d.ts.map
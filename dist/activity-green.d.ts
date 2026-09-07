import { type ActivityGridDay, type ActivityGridPoint } from "./activity-grid.js";
type ActivityGreenTheme = "dark" | "light";
type ActivityRange = {
    from: string;
    to: string;
    days: number;
    columns: number;
};
export type ActivityGreenProps = {
    theme?: ActivityGreenTheme;
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
    tooltip?: (day: ActivityGridDay) => string;
    cell?: number;
    onRangeChange?: (range: ActivityRange) => void;
};
export declare function ActivityGreen({ theme, data, to, weeks, minDays, maxDays, fitToWidth, title, unitLabel, showSummary, baseColor, tooltip, cell, onRangeChange, }: ActivityGreenProps): import("react").JSX.Element;
export default ActivityGreen;
//# sourceMappingURL=activity-green.d.ts.map
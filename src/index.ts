"use client";

export { ActivityHeatmap } from "./activity-heatmap.js";
export { createDemoActivityData, DEFAULT_ACTIVITY_DATA } from "./demo-data.js";
export {
  ACTIVITY_PROVIDERS,
  type ActivityColors,
  type ActivityDataset,
  type ActivityDimension,
  type ActivityHeatmapProps,
  type ActivityProvider,
  type ActivityTheme,
  type AiActivityCoverage,
  type AiActivityDay,
  type AiActivityView,
  type GitHubActivityDay,
} from "./types.js";
// Re-exported so consumers can reach the primitive without a second install.
export {
  CalendarHeatmap,
  CalendarHeatmap3D,
  Heatmap,
  Heatmap3D,
  deriveRamp,
} from "@thilakbhat/heatmap-ui";
export type {
  CalendarCell,
  CalendarDay,
  Heatmap3DBlockStyle,
  Heatmap3DCamera,
  Heatmap3DShape,
  Heatmap3DThemeName,
  HeatmapProps,
  HeatmapScale,
  HeatmapShape,
  ResolvedCell,
} from "@thilakbhat/heatmap-ui";
export {
  formatCompactNumber,
  formatDateLong,
  formatExactNumber,
  getCalendarRange,
  summarizeActivity,
  trimToDisplayRange,
  type ActivitySummary,
} from "./activity.js";

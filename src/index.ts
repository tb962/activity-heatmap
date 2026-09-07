"use client";

export { ActivityGraph } from "./activity-graph.js";
export { createDemoActivityData, DEFAULT_ACTIVITY_DATA } from "./demo-data.js";
export {
  ACTIVITY_PROVIDERS,
  type ActivityCellShape,
  type ActivityColors,
  type ActivityDataset,
  type ActivityGraphProps,
  type ActivityProvider,
  type ActivityTheme,
  type AiActivityCoverage,
  type AiActivityDay,
  type AiActivityView,
  type GitHubActivityDay,
} from "./types.js";
// Re-exported so consumers can reach the primitive without a second install.
export { CalendarHeatmap, Heatmap, deriveRamp } from "@tb962/heatmap-ui";
export type {
  CalendarDay,
  HeatmapProps,
  HeatmapShape,
  ResolvedCell,
} from "@tb962/heatmap-ui";
export {
  formatCompactNumber,
  formatDateLong,
  formatExactNumber,
  getCalendarRange,
  summarizeActivity,
  trimToDisplayRange,
  type ActivitySummary,
} from "./activity.js";

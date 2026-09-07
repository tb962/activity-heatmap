import type { ActivityDataset } from "./types.js";
export type DemoActivityOptions = {
    weeks?: number;
    to?: string;
    username?: string;
};
/** Stable sample content keeps SSR and hydration identical until real data is supplied. */
export declare function createDemoActivityData({ weeks, to, username, }?: DemoActivityOptions): ActivityDataset;
export declare const DEFAULT_ACTIVITY_DATA: ActivityDataset;
//# sourceMappingURL=demo-data.d.ts.map
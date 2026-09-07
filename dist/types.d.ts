import type { CSSProperties, HTMLAttributes } from "react";
import type { HeatmapShape } from "@tb962/heatmap-ui";
export declare const ACTIVITY_PROVIDERS: readonly ["claude", "codex", "cursor"];
export type ActivityProvider = (typeof ACTIVITY_PROVIDERS)[number];
export type GitHubActivityDay = {
    date: string;
    contributions: number;
};
export type AiActivityDay = {
    date: string;
    totalTokens?: number;
    providers?: Partial<Record<ActivityProvider, number>>;
};
export type AiActivityCoverage = {
    from: string;
    to: string;
    source?: string;
    complete?: boolean;
};
/**
 * The component is intentionally data-only. A producer can write this shape
 * from GitHub, a local log collector, a CSV, or hand-authored demo data.
 */
export type ActivityDataset = {
    schema?: "activity.v1" | string;
    generatedAt?: string;
    timezone?: string;
    range: {
        from: string;
        to: string;
    };
    github: {
        username?: string;
        days: GitHubActivityDay[];
        source?: string;
        href?: string;
    };
    ai?: {
        metric?: "tokens" | string;
        available?: boolean;
        source?: string;
        days?: AiActivityDay[];
        /**
         * Unit per provider. Claude and Codex report "tokens"; Cursor reports
         * "aiEdits", "messages" or "edits" because it keeps no token counts on
         * disk — they exist only in a Cursor cloud account.
         */
        metrics?: Partial<Record<ActivityProvider, string>>;
        sources?: Partial<Record<ActivityProvider, string>>;
        coverage?: Partial<Record<ActivityProvider, AiActivityCoverage>>;
    };
};
export type AiActivityView = "all" | ActivityProvider;
/** "system" follows the visitor's prefers-color-scheme. */
export type ActivityTheme = "light" | "dark" | "system";
/** @deprecated Use HeatmapShape from @tb962/heatmap-ui. */
export type ActivityCellShape = HeatmapShape;
/** Per-view colour overrides. Keys not given fall back to the defaults. */
export type ActivityColors = Partial<Record<AiActivityView | "github", string>>;
export type ActivityGraphProps = HTMLAttributes<HTMLElement> & {
    /** Pass a dataset to replace the built-in demo data. */
    data?: ActivityDataset;
    /** Number of calendar columns to render. Defaults to 20 weeks. */
    weeks?: number;
    /** Hide the AI column when a GitHub-only chart is wanted. */
    showAi?: boolean;
    /** Provider selected when the graph first mounts. */
    defaultAiProvider?: AiActivityView;
    /** Override labels without changing the data schema. */
    providerLabels?: Partial<Record<AiActivityView, string>>;
    /** Force a palette, or follow the visitor's OS setting. Defaults to "system". */
    theme?: ActivityTheme;
    /** Bordered, padded, shadowed container around the charts. */
    card?: boolean;
    /** Per-column "GITHUB" / "AI ACTIVITY" labels and their source lines. */
    showColumnLabels?: boolean;
    /** The totals row above each calendar. */
    showStats?: boolean;
    /** The less/more colour key under each calendar. */
    showLegend?: boolean;
    /** The All/Claude/Codex/Cursor switcher. */
    showProviderToggle?: boolean;
    /** Day-cell shape. Defaults to "rounded". */
    cellShape?: HeatmapShape;
    /** Day-cell size in pixels. Defaults to 13. */
    cellSize?: number;
    /** Gap between day cells in pixels. Defaults to 3. */
    cellGap?: number;
    /** Base colour per view, e.g. { github: "#2f81f7", claude: "#d97757" }. */
    colors?: ActivityColors;
    /** Replace the derived shade ramp entirely, darkest last. */
    levelColors?: string[];
    /** Colour of a day with no activity. */
    emptyColor?: string;
    /** Override the outer style without replacing the package CSS. */
    style?: CSSProperties;
};
//# sourceMappingURL=types.d.ts.map
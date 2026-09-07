import type { CSSProperties, HTMLAttributes } from "react";
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
 * from GitHub, OpenUsage, a CSV, a database, or hand-authored demo data.
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
        sources?: Partial<Record<ActivityProvider, string>>;
        coverage?: Partial<Record<ActivityProvider, AiActivityCoverage>>;
    };
};
export type AiActivityView = "all" | ActivityProvider;
export type ActivityGraphProps = Omit<HTMLAttributes<HTMLElement>, "title"> & {
    /** Pass a dataset to replace the built-in demo data. */
    data?: ActivityDataset;
    /** Editorial heading above both charts. */
    title?: string;
    /** Number of calendar columns to render. Defaults to 20 weeks. */
    weeks?: number;
    /** Hide the AI column when a GitHub-only chart is wanted. */
    showAi?: boolean;
    /** Provider selected when the graph first mounts. */
    defaultAiProvider?: AiActivityView;
    /** Override labels without changing the data schema. */
    providerLabels?: Partial<Record<AiActivityView, string>>;
    /** Override the outer card style without replacing the package CSS. */
    style?: CSSProperties;
};
//# sourceMappingURL=types.d.ts.map
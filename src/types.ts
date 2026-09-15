import type { CSSProperties, HTMLAttributes } from "react";

import type {
  Heatmap3DAnimation,
  Heatmap3DBlockStyle,
  Heatmap3DCamera,
  Heatmap3DMaterial,
  Heatmap3DShape,
  Heatmap3DThemeName,
  HeatmapEncoding,
  HeatmapScale,
  HeatmapShape,
} from "@thilakbhat/heatmap-ui";

export const ACTIVITY_PROVIDERS = ["claude", "codex", "cursor"] as const;

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

/** A flat calendar, or the same calendar as an isometric SVG scene. */
export type ActivityDimension = "2d" | "3d";


/** Per-view colour overrides. Keys not given fall back to the defaults. */
export type ActivityColors = Partial<Record<AiActivityView | "github", string>>;

export type ActivityHeatmapProps = HTMLAttributes<HTMLElement> & {
  /** Pass a dataset to replace the built-in demo data. */
  data?: ActivityDataset;
  /** Number of calendar columns to render. Defaults to 20 weeks. */
  weeks?: number;
  /** Hide the AI column when a GitHub-only chart is wanted. */
  showAi?: boolean;
  /** Hide the GitHub column when an AI-only chart is wanted. */
  showGithub?: boolean;
  /** Provider selected when the graph first mounts. */
  defaultAiProvider?: AiActivityView;
  /** Override labels without changing the data schema. */
  providerLabels?: Partial<Record<AiActivityView, string>>;
  /** Force a palette, or follow the visitor's OS setting. Defaults to "system". */
  theme?: ActivityTheme;

  /*
   * Chrome. The package ships heatmaps, not a layout — there is no heading,
   * caption or surface unless you ask for one. Render your own headings
   * around the component.
   */
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

  /* Appearance. Each of these is a heatmap-ui prop handed straight through. */
  /** Day-cell shape. Defaults to "rounded". */
  cellShape?: HeatmapShape;
  /** Day-cell size in pixels. Defaults to 13. */
  cellSize?: number;
  /** Gap between day cells in pixels. Defaults to 3. */
  cellGap?: number;
  /** Corner rounding, overriding whatever the shape does on its own. */
  cellRadius?: number | string;
  /**
   * How shade bands are cut. "linear" is the default, cutting at even
   * fractions of the busiest day, which is what readers know from GitHub.
   * "quantile" ranks the active days instead and suits heavy-tailed token
   * counts — see the README.
   */
  scale?: HeatmapScale;
  /** Number of shade bands. Defaults to the length of the ramp, so 4. */
  levels?: number;
  /** Whether intensity is carried by colour, cell size, or both. */
  encode?: HeatmapEncoding;
  /** Opacity of days outside a source's known coverage. Defaults to 0.5. */
  unknownOpacity?: number;

  /* Calendar layout. */
  /** 0 = weeks start on Sunday (default), 1 = Monday. */
  weekStart?: 0 | 1;
  /** The Jan/Feb/Mar row above each calendar. Defaults to true. */
  showMonthLabels?: boolean;
  /** Mon/Wed/Fri labels down the left of each calendar. Defaults to false. */
  showWeekdayLabels?: boolean;

  /* The isometric mode. Every prop below is inert while `dimension` is "2d". */
  /** "3d" swaps both calendars for heatmap-ui's isometric SVG scene. */
  dimension?: ActivityDimension;
  /** Block form: "rectangle" (default), "circle" or "bar". */
  cellShape3d?: Heatmap3DShape;
  /** Plain solids, LEGO bricks, or windowed facades. */
  blockStyle?: Heatmap3DBlockStyle;
  /**
   * Surface treatment. "color" (default) paints the blocks with the ramp the
   * other colour props describe; the rest pick their own palette, and the
   * ramp steps aside while one of them is on.
   */
  blockTheme?: Heatmap3DThemeName;
  /** Flat fills, or the built-in SVG bitmap fills. */
  material?: Heatmap3DMaterial;
  /** Opt-in entrance motion. Reduced motion is handled by the stylesheet. */
  animation?: Heatmap3DAnimation;
  /** Tallest block, in grid units. Defaults to 100. */
  maxHeight?: number;
  /** Horizontal orbit in degrees. Defaults to -35. */
  yaw?: number;
  /** Elevation in degrees, clamped to 15-75. Defaults to 38. */
  pitch?: number;
  /** Magnification, clamped to 0.55-2. Defaults to 1. */
  zoom?: number;
  /** Fires while the reader drags or keys the camera around. */
  onCameraChange?: (camera: Heatmap3DCamera) => void;
  /** Drag to orbit, arrows to rotate, +/- to zoom. Defaults to true. */
  interactive?: boolean;
  /** Base colour per view, e.g. { github: "#2f81f7", claude: "#d97757" }. */
  colors?: ActivityColors;
  /** Replace the derived shade ramp entirely, darkest last. */
  levelColors?: string[];
  /** Colour of a day with no activity. */
  emptyColor?: string;

  /** Override the outer style without replacing the package CSS. */
  style?: CSSProperties;
};

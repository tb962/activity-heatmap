import { addDays, dateKey, getCalendarRange, parseDateKey } from "./activity.js";
import type { ActivityDataset, ActivityProvider } from "./types.js";

export type DemoActivityOptions = {
  weeks?: number;
  to?: string;
  username?: string;
};

/**
 * Deterministic hash in [0, 1). Modular arithmetic on the day index alone is a
 * trap here: any stride that shares a factor with the modulus repeats, and an
 * earlier version advanced by a multiple of its modulus every day, so the whole
 * demo changed value only once a week and rendered as vertical stripes.
 */
function noise(index: number, salt: number): number {
  let value = Math.imul(index + salt * 0x9e37, 0x85ebca6b) ^ (salt * 0xc2b2ae35);
  value = Math.imul(value ^ (value >>> 13), 0xc2b2ae35);
  value ^= value >>> 16;
  return (value >>> 0) / 0x100000000;
}

/** Stable sample content keeps SSR and hydration identical until real data is supplied. */
export function createDemoActivityData({
  weeks = 20,
  to = "2026-09-07",
  username = "your-handle",
}: DemoActivityOptions = {}): ActivityDataset {
  const range = getCalendarRange(to, weeks);
  const start = parseDateKey(range.from);
  const end = parseDateKey(range.to);
  const githubDays = [];
  const aiDays = [];

  for (let current = start; current.getTime() <= end.getTime(); current = addDays(current, 1)) {
    const date = dateKey(current);
    const index = Math.round((current.getTime() - start.getTime()) / (24 * 60 * 60 * 1000));
    const weekday = current.getUTCDay();
    // Weekends are quieter, the way a real contribution graph looks.
    const weekendDip = weekday === 0 || weekday === 6 ? 0.45 : 1;

    const githubRoll = noise(index, 1);
    const contributions =
      githubRoll < 0.22 ? 0 : Math.max(1, Math.round(noise(index, 2) * 9 * weekendDip));
    githubDays.push({ date, contributions });

    const providers: Partial<Record<ActivityProvider, number>> = {};
    if (noise(index, 3) > 0.28) {
      providers.claude = Math.round((3 + noise(index, 4) * 26) * weekendDip) * 1_000_000;
    }
    if (noise(index, 5) > 0.34) {
      providers.codex = Math.round((2 + noise(index, 6) * 17) * weekendDip) * 1_000_000;
    }
    // Cursor reports AI edits, so it is deliberately a different order of
    // magnitude and never folded into totalTokens.
    if (noise(index, 7) > 0.38) {
      providers.cursor = Math.round((4 + noise(index, 8) * 48) * weekendDip);
    }
    const totalTokens = (providers.claude ?? 0) + (providers.codex ?? 0);
    aiDays.push({ date, totalTokens, providers });
  }

  return {
    schema: "activity.v1",
    timezone: "UTC",
    range,
    github: {
      username,
      days: githubDays,
      source: "demo data",
    },
    ai: {
      metric: "tokens",
      available: true,
      source: "demo data — replace with your own ledger",
      metrics: { claude: "tokens", codex: "tokens", cursor: "aiEdits" },
      days: aiDays,
      coverage: {
        claude: { from: range.from, to: range.to, source: "demo data", complete: true },
        codex: { from: range.from, to: range.to, source: "demo data", complete: true },
        cursor: { from: range.from, to: range.to, source: "demo data", complete: true },
      },
    },
  };
}

export const DEFAULT_ACTIVITY_DATA = createDemoActivityData();

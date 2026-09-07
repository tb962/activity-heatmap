import type {
  ActivityDataset,
  ActivityProvider,
  AiActivityCoverage,
  AiActivityDay,
} from "./types.js";

export type ActivitySummary = {
  total: number;
  activeDays: number;
  peak: number;
  peakDate: string | null;
  currentStreak: number | null;
  longestStreak: number;
  unknownDays: number;
};

const DAY_IN_MS = 24 * 60 * 60 * 1000;

export function parseDateKey(value: string): Date {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

export function dateKey(value: Date): string {
  return value.toISOString().slice(0, 10);
}

export function addDays(value: Date, amount: number): Date {
  return new Date(value.getTime() + amount * DAY_IN_MS);
}

export function getCalendarRange(to: string, weeks: number): { from: string; to: string } {
  const end = parseDateKey(to);
  const startOfEndWeek = addDays(end, -end.getUTCDay());

  return {
    from: dateKey(addDays(startOfEndWeek, -(Math.max(1, weeks) - 1) * 7)),
    to: dateKey(end),
  };
}

export function trimToDisplayRange(data: ActivityDataset, weeks: number): ActivityDataset {
  const { from } = getCalendarRange(data.range.to, weeks);
  return {
    ...data,
    github: {
      ...data.github,
      days: data.github.days.filter((day) => day.date >= from),
    },
    ai: data.ai
      ? {
          ...data.ai,
          days: (data.ai.days ?? []).filter((day) => day.date >= from),
        }
      : undefined,
  };
}

export function summarizeActivity(
  days: ReadonlyArray<{ date: string; value: number; known?: boolean }>,
  range: { from: string; to: string },
): ActivitySummary {
  const valuesByDate = new Map(
    days.map((day) => [day.date, { value: day.value, known: day.known !== false }]),
  );
  const start = parseDateKey(range.from);
  const end = parseDateKey(range.to);
  let total = 0;
  let activeDays = 0;
  let peak = 0;
  let peakDate: string | null = null;
  let longestStreak = 0;
  let runningStreak = 0;
  let unknownDays = 0;

  for (
    let current = start;
    current.getTime() <= end.getTime();
    current = addDays(current, 1)
  ) {
    const currentKey = dateKey(current);
    const point = valuesByDate.get(currentKey);
    if (!point || !point.known) {
      unknownDays += 1;
      runningStreak = 0;
      continue;
    }

    const value = point.value;
    total += value;
    if (value > 0) {
      activeDays += 1;
      runningStreak += 1;
      longestStreak = Math.max(longestStreak, runningStreak);
      if (value > peak) {
        peak = value;
        peakDate = currentKey;
      }
    } else {
      runningStreak = 0;
    }
  }

  let currentStreak: number | null = 0;
  for (
    let current = end;
    current.getTime() >= start.getTime();
    current = addDays(current, -1)
  ) {
    const point = valuesByDate.get(dateKey(current));
    if (!point || !point.known) {
      currentStreak = null;
      break;
    }
    if (point.value <= 0) break;
    currentStreak += 1;
  }

  return {
    total,
    activeDays,
    peak,
    peakDate,
    currentStreak,
    longestStreak,
    unknownDays,
  };
}

export function sumAiProviderTokens(
  providers: Partial<Record<ActivityProvider, number>> | null | undefined,
): number {
  return Object.values(providers ?? {}).reduce(
    (sum, value) =>
      sum +
      (typeof value === "number" && Number.isFinite(value) && value > 0 ? value : 0),
    0,
  );
}

export function getAllAiTokens(day: AiActivityDay | undefined): number {
  if (!day) return 0;
  const providers = day.providers ?? {};
  return Object.keys(providers).length > 0
    ? sumAiProviderTokens(providers)
    : Math.max(0, day.totalTokens ?? 0);
}

export function getProviderCoverage(
  data: ActivityDataset,
  provider: ActivityProvider,
): AiActivityCoverage | null {
  const explicitCoverage = data.ai?.coverage?.[provider];
  if (explicitCoverage) return explicitCoverage;

  const dates = (data.ai?.days ?? [])
    .filter((day) => Object.prototype.hasOwnProperty.call(day.providers ?? {}, provider))
    .map((day) => day.date)
    .sort();
  if (dates.length === 0) return null;

  return {
    from: dates[0],
    to: dates[dates.length - 1],
    source: "activity dataset",
    complete: false,
  };
}

export function isDateCovered(coverage: AiActivityCoverage | null, date: string): boolean {
  return Boolean(coverage && date >= coverage.from && date <= coverage.to);
}

export function formatCompactNumber(value: number): string {
  return new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: value >= 1000 ? 1 : 0,
  }).format(value);
}

export function formatExactNumber(value: number): string {
  return new Intl.NumberFormat("en-US").format(value);
}

export function formatDateLong(value: string | null | undefined): string {
  if (!value) return "—";
  return parseDateKey(value).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

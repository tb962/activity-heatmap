"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";

import { CalendarHeatmap, deriveRamp } from "@tb962/heatmap-ui";

import {
  addDays,
  dateKey,
  formatCompactNumber,
  formatExactNumber,
  getCalendarRange,
  getProviderCoverage,
  isDateCovered,
  parseDateKey,
  sumAiProviderTokens,
  summarizeActivity,
  trimToDisplayRange,
} from "./activity.js";
import { DEFAULT_ACTIVITY_DATA } from "./demo-data.js";
import type {
  ActivityDataset,
  ActivityHeatmapProps,
  ActivityProvider,
  ActivityTheme,
  AiActivityView,
} from "./types.js";

const PROVIDER_ORDER: ActivityProvider[] = ["claude", "codex", "cursor"];

const DEFAULT_PROVIDER_LABELS: Record<AiActivityView, string> = {
  all: "All",
  claude: "Claude",
  codex: "Codex",
  cursor: "Cursor",
};

/**
 * Cursor does not persist token counts locally, so it reports a different
 * unit. Each view therefore carries its own metric label.
 */
const METRIC_LABELS: Record<string, string> = {
  tokens: "tokens",
  aiEdits: "AI edits",
  messages: "messages",
  edits: "edited lines",
};

/**
 * GitHub's own ramp, used verbatim so the contribution grid still looks like
 * the thing it mirrors. Deriving four shades from a single seed is close but
 * visibly flatter, so it is reserved for colours the caller supplies.
 */
const GITHUB_RAMP = {
  light: ["#9be9a8", "#40c463", "#30a14e", "#216e39"],
  dark: ["#0e4429", "#006d32", "#26a641", "#39d353"],
} as const;

const PROVIDER_COLORS: Record<AiActivityView | "github", string> = {
  github: "#216e39",
  all: "#2563eb",
  claude: "#d97757",
  codex: "#10a37f",
  cursor: "#181818",
};

type ActivityView = {
  days: Array<{ date: string; value: number; known?: boolean }>;
  summary: ReturnType<typeof summarizeActivity>;
};

export function ActivityHeatmap({
  data = DEFAULT_ACTIVITY_DATA,
  weeks = 20,
  showAi = true,
  defaultAiProvider = "all",
  providerLabels: customProviderLabels,
  theme = "system",
  card = false,
  showColumnLabels = true,
  showStats = true,
  showLegend = true,
  showProviderToggle = true,
  cellShape = "rounded",
  cellSize = 13,
  cellGap = 3,
  colors: customColors,
  levelColors,
  emptyColor,
  className,
  style,
  ...sectionProps
}: ActivityHeatmapProps) {
  const [aiProvider, setAiProvider] = useState<AiActivityView>(defaultAiProvider);
  const resolvedTheme = useResolvedTheme(theme);
  // Memoised so downstream useMemo deps stay stable across renders.
  const providerLabels = useMemo(
    () => ({ ...DEFAULT_PROVIDER_LABELS, ...customProviderLabels }),
    [customProviderLabels],
  );
  const colors = useMemo(
    () => ({ ...PROVIDER_COLORS, ...customColors }),
    [customColors],
  );
  const displayData = useMemo(() => trimToDisplayRange(data, weeks), [data, weeks]);
  const displayRange = useMemo(
    () => getCalendarRange(displayData.range.to, weeks),
    [displayData.range.to, weeks],
  );

  const githubView = useMemo(
    () => ({
      days: displayData.github.days.map((day) => ({ date: day.date, value: day.contributions })),
      summary: summarizeActivity(
        displayData.github.days.map((day) => ({ date: day.date, value: day.contributions })),
        displayRange,
      ),
    }),
    [displayData.github.days, displayRange],
  );

  const aiView = useMemo(
    () => buildAiActivityView(displayData, aiProvider, displayRange),
    [aiProvider, displayData, displayRange],
  );

  const aiMetricLabel = useMemo(
    () => resolveMetricLabel(displayData, aiProvider),
    [displayData, aiProvider],
  );
  // The ramp has to fade toward whatever the cells sit on, and the empty cell
  // has to read as empty against it.
  const ground = resolvedTheme === "dark" ? "#171614" : "#ffffff";
  const emptyForTheme = resolvedTheme === "dark" ? "#26231f" : "#ebedf0";
  const githubSource = displayData.github.source ?? "github.com/" + (displayData.github.username ?? "your-handle");
  const aiConfigured = Boolean(displayData.ai && displayData.ai.available !== false);
  const rootClassName = [
    "activity-heatmap",
    card ? "activity-heatmap--card" : null,
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <section
      className={rootClassName}
      data-activity-theme={theme === "system" ? undefined : theme}
      style={style}
      {...sectionProps}
    >
      <div className="activity-heatmap__surface">
        <div className={showAi ? "activity-heatmap__columns" : "activity-heatmap__columns activity-heatmap__columns--single"}>
          <div className="activity-heatmap__column">
            {showColumnLabels ? (
              <div className="activity-heatmap__column-heading">
                <div>
                  <p className="activity-heatmap__column-label">GitHub</p>
                  <p className="activity-heatmap__source">
                    Source:{" "}
                    {displayData.github.href ? (
                      <a href={displayData.github.href} target="_blank" rel="noreferrer">
                        {githubSource}
                      </a>
                    ) : githubSource}
                  </p>
                </div>
              </div>
            ) : null}

            {showStats ? (
              <ActivitySummaryStats
                summary={githubView.summary}
                metricLabel="contributions"
                summaryLabel="GitHub activity summary"
              />
            ) : null}
            <CalendarHeatmap
              values={githubView.days}
              to={displayData.range.to}
              weeks={weeks}
              unitLabel="contributions"
              ariaLabel="GitHub activity"
              showLegend={showLegend}
              colors={
                levelColors ??
                (customColors?.github
                  ? deriveRamp(customColors.github, { ground })
                  : GITHUB_RAMP[resolvedTheme])
              }
              emptyColor={emptyColor ?? emptyForTheme}
              cellSize={cellSize}
              gap={cellGap}
              shape={cellShape}
              data-heatmap-theme={resolvedTheme}
              tooltip={(day) =>
                day.known ? day.value + " contributions" : "No data for this day"
              }
            />
          </div>

          {showAi ? (
            <div
              className="activity-heatmap__column activity-heatmap__column--ai"
              style={{ "--activity-provider-color": colors[aiProvider] } as CSSProperties}
            >
              {showColumnLabels || showProviderToggle ? (
                <div className="activity-heatmap__column-heading">
                  {showColumnLabels ? (
                    <div className="activity-heatmap__column-heading-copy">
                      <p className="activity-heatmap__column-label">AI activity</p>
                      <p className="activity-heatmap__source">
                        Source: {displayData.ai?.source ?? displayData.ai?.sources?.[aiProvider === "all" ? "claude" : aiProvider] ?? "No AI activity source connected"}
                      </p>
                      {!aiConfigured ? (
                        <p className="activity-heatmap__empty-note">
                          Pass <code>data.ai</code> to replace the demo ledger.
                        </p>
                      ) : null}
                    </div>
                  ) : null}

                  {showProviderToggle ? (
                    <div className="activity-heatmap__provider-toggle" role="group" aria-label="Choose AI activity view">
                      {(["all", ...PROVIDER_ORDER] as AiActivityView[]).map((provider) => (
                        <button
                          type="button"
                          className="activity-heatmap__provider-button"
                          data-active={aiProvider === provider ? "true" : "false"}
                          aria-pressed={aiProvider === provider}
                          key={provider}
                          onClick={() => setAiProvider(provider)}
                        >
                          {providerLabels[provider]}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
              ) : null}

              {showStats ? (
                <ActivitySummaryStats
                  summary={aiView.summary}
                  metricLabel={aiMetricLabel}
                  summaryLabel={providerLabels[aiProvider] + " activity summary"}
                />
              ) : null}

              <CalendarHeatmap
                values={aiView.days}
                to={displayData.range.to}
                weeks={weeks}
                unitLabel={aiMetricLabel}
                ariaLabel={providerLabels[aiProvider] + " AI activity"}
                showLegend={showLegend}
                colors={levelColors ?? deriveRamp(colors[aiProvider], { ground })}
                emptyColor={emptyColor ?? emptyForTheme}
                cellSize={cellSize}
                gap={cellGap}
                shape={cellShape}
                data-heatmap-theme={resolvedTheme}
                tooltip={(day) =>
                  day.known
                    ? formatCompactNumber(day.value) + " " + aiMetricLabel
                    : "No data for this day"
                }
              />
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}

/** Providers that share the dataset's dominant unit, in display order. */
function metricProviders(data: ActivityDataset, metric: string): ActivityProvider[] {
  return PROVIDER_ORDER.filter(
    (provider) => (data.ai?.metrics?.[provider] ?? "tokens") === metric,
  );
}

function dominantMetric(data: ActivityDataset): string {
  return data.ai?.metric ?? "tokens";
}

function resolveMetricLabel(data: ActivityDataset, view: AiActivityView): string {
  const metric =
    view === "all" ? dominantMetric(data) : data.ai?.metrics?.[view] ?? dominantMetric(data);
  return METRIC_LABELS[metric] ?? metric;
}

/**
 * Follows the OS setting when the host asks for "system". The server render
 * and first client render both use "light", so hydration matches; the effect
 * corrects it immediately after mount.
 */
function useResolvedTheme(theme: ActivityTheme): "light" | "dark" {
  const [systemTheme, setSystemTheme] = useState<"light" | "dark">("light");

  useEffect(() => {
    if (theme !== "system" || typeof window === "undefined" || !window.matchMedia) return;
    const query = window.matchMedia("(prefers-color-scheme: dark)");
    const sync = () => setSystemTheme(query.matches ? "dark" : "light");
    sync();
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, [theme]);

  return theme === "system" ? systemTheme : theme;
}

function buildActivityView(
  days: Array<{ date: string; value: number; known?: boolean }>,
  range: { from: string; to: string },
): ActivityView {
  return { days, summary: summarizeActivity(days, range) };
}

function buildAiActivityView(
  data: ActivityDataset,
  provider: AiActivityView,
  range: { from: string; to: string },
): ActivityView {
  const daysByDate = new Map((data.ai?.days ?? []).map((day) => [day.date, day]));
  const coverage = provider === "all" ? null : getProviderCoverage(data, provider);
  const aggregated = metricProviders(data, dominantMetric(data));
  const allCoverage = provider === "all"
    ? aggregated.map((candidate) => getProviderCoverage(data, candidate))
    : [];
  const days: Array<{ date: string; value: number; known?: boolean }> = [];

  for (
    let current = parseDateKey(range.from);
    current.getTime() <= parseDateKey(range.to).getTime();
    current = addDays(current, 1)
  ) {
    const date = dateKey(current);
    const day = daysByDate.get(date);
    const known = data.ai?.available !== false && (
      provider === "all"
        ? allCoverage.some((candidate) => isDateCovered(candidate, date))
        : isDateCovered(coverage, date)
    );

    days.push({
      date,
      value:
        provider === "all"
          ? sumAiProviderTokens(
              Object.fromEntries(
                aggregated.map((candidate) => [candidate, day?.providers?.[candidate] ?? 0]),
              ),
            )
          : day?.providers?.[provider] ?? 0,
      known,
    });
  }

  return buildActivityView(days, range);
}

function ActivitySummaryStats({
  summary,
  metricLabel,
  summaryLabel,
}: {
  summary: ActivityView["summary"];
  metricLabel: string;
  summaryLabel: string;
}) {
  return (
    <div className="activity-heatmap__stats" aria-label={summaryLabel}>
      <ActivityStat value={formatCompactNumber(summary.total)} label={metricLabel} />
      <ActivityStat value={formatExactNumber(summary.activeDays)} label="active days" />
      <ActivityStat value={formatCompactNumber(summary.peak)} label="peak" />
      <ActivityStat value={formatDayCount(summary.currentStreak)} label="current streak" />
      <ActivityStat value={formatDayCount(summary.longestStreak)} label="longest streak" />
    </div>
  );
}

function ActivityStat({ value, label }: { value: string; label: string }) {
  return (
    <div className="activity-heatmap__stat">
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}

function formatDayCount(value: number | null): string {
  if (value === null) return "—";
  return value + (value === 1 ? " day" : " days");
}

export default ActivityHeatmap;

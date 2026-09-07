"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";

import {
  addDays,
  dateKey,
  formatCompactNumber,
  formatDateLong,
  formatExactNumber,
  getCalendarRange,
  getProviderCoverage,
  isDateCovered,
  parseDateKey,
  sumAiProviderTokens,
  summarizeActivity,
  trimToDisplayRange,
} from "./activity.js";
import { ActivityGreen } from "./activity-green.js";
import { MonoRoundedDonut } from "./mono-rounded-donut.js";
import { DEFAULT_ACTIVITY_DATA } from "./demo-data.js";
import type {
  ActivityDataset,
  ActivityGraphProps,
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

const PROVIDER_COLORS: Record<AiActivityView, string> = {
  all: "#2563eb",
  claude: "#d97757",
  codex: "#10a37f",
  cursor: "#181818",
};

type ActivityView = {
  days: Array<{ date: string; value: number; known?: boolean }>;
  summary: ReturnType<typeof summarizeActivity>;
};

export function ActivityGraph({
  data = DEFAULT_ACTIVITY_DATA,
  title = "The work behind the work.",
  weeks = 20,
  showAi = true,
  defaultAiProvider = "all",
  providerLabels: customProviderLabels,
  theme = "system",
  className,
  style,
  ...sectionProps
}: ActivityGraphProps) {
  const [aiProvider, setAiProvider] = useState<AiActivityView>(defaultAiProvider);
  const resolvedTheme = useResolvedTheme(theme);
  // Memoised so downstream useMemo deps stay stable across renders.
  const providerLabels = useMemo(
    () => ({ ...DEFAULT_PROVIDER_LABELS, ...customProviderLabels }),
    [customProviderLabels],
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

  const aiProviderBreakdown = useMemo(
    () => buildAiProviderBreakdown(displayData, displayRange, providerLabels),
    [displayData, displayRange, providerLabels],
  );

  const aiMetricLabel = useMemo(
    () => resolveMetricLabel(displayData, aiProvider),
    [displayData, aiProvider],
  );
  const generatedLabel = displayData.generatedAt
    ? "Updated " + formatDateLong(displayData.generatedAt.slice(0, 10))
    : "Demo data";
  const githubSource = displayData.github.source ?? "github.com/" + (displayData.github.username ?? "your-handle");
  const aiConfigured = Boolean(displayData.ai && displayData.ai.available !== false);
  const rootClassName = ["activity-graph", className].filter(Boolean).join(" ");

  return (
    <section
      className={rootClassName}
      data-activity-theme={theme === "system" ? undefined : theme}
      style={style}
      {...sectionProps}
    >
      <div className="activity-graph__card">
        <div className="activity-graph__heading">
          <h2>{title}</h2>
          <span className="activity-graph__freshness">
            {generatedLabel}
            <span aria-hidden="true">•</span>
            Last {weeks} weeks
          </span>
        </div>

        <div className={showAi ? "activity-graph__columns" : "activity-graph__columns activity-graph__columns--single"}>
          <div className="activity-graph__column">
            <div className="activity-graph__column-heading">
              <div>
                <p className="activity-graph__column-label">GitHub</p>
                <p className="activity-graph__source">
                  Source:{" "}
                  {displayData.github.href ? (
                    <a href={displayData.github.href} target="_blank" rel="noreferrer">
                      {githubSource}
                    </a>
                  ) : githubSource}
                </p>
              </div>
            </div>

            <ActivitySummaryStats
              summary={githubView.summary}
              metricLabel="contributions"
              summaryLabel="GitHub activity summary"
            />
            <ActivityGreen
              theme={resolvedTheme}
              data={githubView.days}
              to={displayData.range.to}
              weeks={weeks}
              fitToWidth={false}
              title="GitHub activity"
              unitLabel="contributions"
              showSummary={false}
              cell={13}
            />
          </div>

          {showAi ? (
            <div
              className="activity-graph__column activity-graph__column--ai"
              style={{ "--activity-provider-color": PROVIDER_COLORS[aiProvider] } as CSSProperties}
            >
              <div className="activity-graph__column-heading">
                <div className="activity-graph__column-heading-copy">
                  <p className="activity-graph__column-label">AI activity</p>
                  <p className="activity-graph__source">
                    Source: {displayData.ai?.source ?? displayData.ai?.sources?.[aiProvider === "all" ? "claude" : aiProvider] ?? "No AI activity source connected"}
                  </p>
                  {!aiConfigured ? (
                    <p className="activity-graph__empty-note">
                      Pass <code>data.ai</code> to replace the demo ledger.
                    </p>
                  ) : null}
                </div>

                <div className="activity-graph__provider-toggle" role="group" aria-label="Choose AI activity view">
                  {(["all", ...PROVIDER_ORDER] as AiActivityView[]).map((provider) => (
                    <button
                      type="button"
                      className="activity-graph__provider-button"
                      data-active={aiProvider === provider ? "true" : "false"}
                      aria-pressed={aiProvider === provider}
                      key={provider}
                      onClick={() => setAiProvider(provider)}
                    >
                      {providerLabels[provider]}
                    </button>
                  ))}
                </div>
              </div>

              <ActivitySummaryStats
                summary={aiView.summary}
                metricLabel={aiMetricLabel}
                summaryLabel={providerLabels[aiProvider] + " activity summary"}
              />

              <div className="activity-graph__ai-visuals">
                <ActivityGreen
                  theme={resolvedTheme}
                  data={aiView.days}
                  to={displayData.range.to}
                  weeks={weeks}
                  fitToWidth={false}
                  title={providerLabels[aiProvider] + " AI activity"}
                  unitLabel={aiMetricLabel}
                  showSummary={false}
                  baseColor={PROVIDER_COLORS[aiProvider]}
                  tooltip={(day) => formatCompactNumber(day.value) + " " + aiMetricLabel}
                  cell={13}
                />

                <div className="activity-graph__ai-breakdown">
                  <MonoRoundedDonut
                    data={aiProviderBreakdown}
                    valueFormatter={formatCompactNumber}
                    centerLabel="all tokens"
                    ariaLabel="AI token breakdown by provider"
                  />
                </div>
              </div>
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

/**
 * Only providers sharing the dominant unit can be summed into one ring —
 * adding Cursor's message count to a token total would be meaningless.
 */
function buildAiProviderBreakdown(
  data: ActivityDataset,
  range: { from: string; to: string },
  providerLabels: Record<AiActivityView, string>,
) {
  const providers = metricProviders(data, dominantMetric(data));
  const totals = Object.fromEntries(providers.map((provider) => [provider, 0])) as Record<ActivityProvider, number>;
  (data.ai?.days ?? []).forEach((day) => {
    if (day.date < range.from || day.date > range.to) return;
    providers.forEach((provider) => {
      totals[provider] += day.providers?.[provider] ?? 0;
    });
  });

  return providers.map((provider) => ({
    id: provider,
    label: providerLabels[provider],
    value: totals[provider],
    color: PROVIDER_COLORS[provider],
  }));
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
    <div className="activity-graph__stats" aria-label={summaryLabel}>
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
    <div className="activity-graph__stat">
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}

function formatDayCount(value: number | null): string {
  if (value === null) return "—";
  return value + (value === 1 ? " day" : " days");
}

export default ActivityGraph;

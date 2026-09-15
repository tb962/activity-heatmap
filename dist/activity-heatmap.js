"use client";
import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useMemo, useState } from "react";
import { CalendarHeatmap, CalendarHeatmap3D, deriveRamp, } from "@thilakbhat/heatmap-ui";
import { addDays, dateKey, formatCompactNumber, formatExactNumber, getCalendarRange, getProviderCoverage, isDateCovered, parseDateKey, sumAiProviderTokens, summarizeActivity, trimToDisplayRange, } from "./activity.js";
import { DEFAULT_ACTIVITY_DATA } from "./demo-data.js";
const PROVIDER_ORDER = ["claude", "codex", "cursor"];
const DEFAULT_PROVIDER_LABELS = {
    all: "All",
    claude: "Claude",
    codex: "Codex",
    cursor: "Cursor",
};
/**
 * Cursor does not persist token counts locally, so it reports a different
 * unit. Each view therefore carries its own metric label.
 */
const METRIC_LABELS = {
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
};
const PROVIDER_COLORS = {
    github: "#216e39",
    all: "#2563eb",
    claude: "#d97757",
    codex: "#10a37f",
    cursor: "#181818",
};
export function ActivityHeatmap({ data = DEFAULT_ACTIVITY_DATA, weeks = 20, showAi = true, showGithub = true, defaultAiProvider = "all", providerLabels: customProviderLabels, theme = "system", card = false, showColumnLabels = true, showStats = true, showLegend = true, showProviderToggle = true, cellShape = "rounded", cellSize = 13, cellGap = 3, cellRadius, scale = "linear", levels = 4, encode = "color", unknownOpacity, weekStart = 0, showMonthLabels = true, showWeekdayLabels = false, dimension = "2d", cellShape3d = "rectangle", blockStyle = "solid", blockTheme = "color", material = "solid", animation = "none", maxHeight = 100, yaw = -35, pitch = 38, zoom = 1, onCameraChange, interactive = true, colors: customColors, levelColors, emptyColor, className, style, ...sectionProps }) {
    const [aiProvider, setAiProvider] = useState(defaultAiProvider);
    const resolvedTheme = useResolvedTheme(theme);
    // Memoised so downstream useMemo deps stay stable across renders.
    const providerLabels = useMemo(() => ({ ...DEFAULT_PROVIDER_LABELS, ...customProviderLabels }), [customProviderLabels]);
    const colors = useMemo(() => ({ ...PROVIDER_COLORS, ...customColors }), [customColors]);
    const displayData = useMemo(() => trimToDisplayRange(data, weeks), [data, weeks]);
    const displayRange = useMemo(() => getCalendarRange(displayData.range.to, weeks), [displayData.range.to, weeks]);
    const githubView = useMemo(() => ({
        days: displayData.github.days.map((day) => ({ date: day.date, value: day.contributions })),
        summary: summarizeActivity(displayData.github.days.map((day) => ({ date: day.date, value: day.contributions })), displayRange),
    }), [displayData.github.days, displayRange]);
    const aiView = useMemo(() => buildAiActivityView(displayData, aiProvider, displayRange), [aiProvider, displayData, displayRange]);
    const aiMetricLabel = useMemo(() => resolveMetricLabel(displayData, aiProvider), [displayData, aiProvider]);
    // The ramp has to fade toward whatever the cells sit on, and the empty cell
    // has to read as empty against it.
    const ground = resolvedTheme === "dark" ? "#171614" : "#ffffff";
    const emptyForTheme = resolvedTheme === "dark" ? "#26231f" : "#ebedf0";
    // Every heatmap-ui control the card surfaces, resolved once. Both calendars
    // are the same chart with different data, so they must not drift.
    const sharedProps = {
        weeks,
        weekStart,
        showMonthLabels,
        showWeekdayLabels,
        showLegend,
        scale,
        levels,
        cellSize,
        gap: cellGap,
        unknownOpacity,
        "data-heatmap-theme": resolvedTheme,
    };
    /**
     * Three of the 3D themes paint their own blocks, so handing them a ramp
     * would overrule a palette they never asked for. The colour props are
     * withheld while one of them is on.
     */
    const themed3d = dimension === "3d" && blockTheme !== "color";
    /**
     * GitHub's own four shades are used verbatim at the default band count;
     * anything else has to be derived, or the extra bands would all land on the
     * darkest colour heatmap-ui clamps to.
     */
    const rampFor = (base, fixed) => levelColors ??
        (fixed && fixed.length === levels ? [...fixed] : deriveRamp(base, { ground, levels }));
    const paletteFor = (base, fixed) => themed3d ? {} : { colors: rampFor(base, fixed), emptyColor: emptyColor ?? emptyForTheme };
    /**
     * The flat calendar and the isometric one take the same data and differ
     * only in how a cell is drawn, so the choice is made in one place rather
     * than at every call site.
     */
    const renderCalendar = (view) => dimension === "3d" ? (_jsx(CalendarHeatmap3D, { ...sharedProps, shape: cellShape3d, blockStyle: blockStyle, theme: blockTheme, material: material, animation: animation, maxHeight: maxHeight, yaw: yaw, pitch: pitch, zoom: zoom, interactive: interactive, onCameraChange: onCameraChange, ...view })) : (_jsx(CalendarHeatmap, { ...sharedProps, shape: cellShape, encode: encode, radius: cellRadius, ...view }));
    const githubSource = displayData.github.source ?? "github.com/" + (displayData.github.username ?? "your-handle");
    const aiConfigured = Boolean(displayData.ai && displayData.ai.available !== false);
    const rootClassName = [
        "activity-heatmap",
        card ? "activity-heatmap--card" : null,
        className,
    ]
        .filter(Boolean)
        .join(" ");
    return (_jsx("section", { className: rootClassName, "data-activity-theme": theme === "system" ? undefined : theme, style: style, ...sectionProps, children: _jsx("div", { className: "activity-heatmap__surface", children: _jsxs("div", { className: showAi && showGithub
                    ? "activity-heatmap__columns"
                    : "activity-heatmap__columns activity-heatmap__columns--single", children: [showGithub ? (_jsxs("div", { className: "activity-heatmap__column", children: [showColumnLabels ? (_jsx("div", { className: "activity-heatmap__column-heading", children: _jsxs("div", { children: [_jsx("p", { className: "activity-heatmap__column-label", children: "GitHub" }), _jsxs("p", { className: "activity-heatmap__source", children: ["Source:", " ", displayData.github.href ? (_jsx("a", { href: displayData.github.href, target: "_blank", rel: "noreferrer", children: githubSource })) : githubSource] })] }) })) : null, showStats ? (_jsx(ActivitySummaryStats, { summary: githubView.summary, metricLabel: "contributions", summaryLabel: "GitHub activity summary" })) : null, renderCalendar({
                                values: githubView.days,
                                to: displayData.range.to,
                                unitLabel: "contributions",
                                ariaLabel: "GitHub activity",
                                tooltip: (day) => day.known ? day.value + " contributions" : "No data for this day",
                                ...paletteFor(colors.github, customColors?.github ? undefined : GITHUB_RAMP[resolvedTheme]),
                            })] })) : null, showAi ? (_jsxs("div", { className: "activity-heatmap__column activity-heatmap__column--ai", style: { "--activity-provider-color": colors[aiProvider] }, children: [showColumnLabels || showProviderToggle ? (_jsxs("div", { className: "activity-heatmap__column-heading", children: [showColumnLabels ? (_jsxs("div", { className: "activity-heatmap__column-heading-copy", children: [_jsx("p", { className: "activity-heatmap__column-label", children: "AI activity" }), _jsxs("p", { className: "activity-heatmap__source", children: ["Source: ", displayData.ai?.source ?? displayData.ai?.sources?.[aiProvider === "all" ? "claude" : aiProvider] ?? "No AI activity source connected"] }), !aiConfigured ? (_jsxs("p", { className: "activity-heatmap__empty-note", children: ["Pass ", _jsx("code", { children: "data.ai" }), " to replace the demo ledger."] })) : null] })) : null, showProviderToggle ? (_jsx("div", { className: "activity-heatmap__provider-toggle", role: "group", "aria-label": "Choose AI activity view", children: ["all", ...PROVIDER_ORDER].map((provider) => (_jsx("button", { type: "button", className: "activity-heatmap__provider-button", "data-active": aiProvider === provider ? "true" : "false", "aria-pressed": aiProvider === provider, onClick: () => setAiProvider(provider), children: providerLabels[provider] }, provider))) })) : null] })) : null, showStats ? (_jsx(ActivitySummaryStats, { summary: aiView.summary, metricLabel: aiMetricLabel, summaryLabel: providerLabels[aiProvider] + " activity summary" })) : null, renderCalendar({
                                values: aiView.days,
                                to: displayData.range.to,
                                unitLabel: aiMetricLabel,
                                ariaLabel: providerLabels[aiProvider] + " AI activity",
                                tooltip: (day) => day.known
                                    ? formatCompactNumber(day.value) + " " + aiMetricLabel
                                    : "No data for this day",
                                ...paletteFor(colors[aiProvider]),
                            })] })) : null] }) }) }));
}
/** Providers that share the dataset's dominant unit, in display order. */
function metricProviders(data, metric) {
    return PROVIDER_ORDER.filter((provider) => (data.ai?.metrics?.[provider] ?? "tokens") === metric);
}
function dominantMetric(data) {
    return data.ai?.metric ?? "tokens";
}
function resolveMetricLabel(data, view) {
    const metric = view === "all" ? dominantMetric(data) : data.ai?.metrics?.[view] ?? dominantMetric(data);
    return METRIC_LABELS[metric] ?? metric;
}
/**
 * Follows the OS setting when the host asks for "system". The server render
 * and first client render both use "light", so hydration matches; the effect
 * corrects it immediately after mount.
 */
function useResolvedTheme(theme) {
    const [systemTheme, setSystemTheme] = useState("light");
    useEffect(() => {
        if (theme !== "system" || typeof window === "undefined" || !window.matchMedia)
            return;
        const query = window.matchMedia("(prefers-color-scheme: dark)");
        const sync = () => setSystemTheme(query.matches ? "dark" : "light");
        sync();
        query.addEventListener("change", sync);
        return () => query.removeEventListener("change", sync);
    }, [theme]);
    return theme === "system" ? systemTheme : theme;
}
function buildActivityView(days, range) {
    return { days, summary: summarizeActivity(days, range) };
}
function buildAiActivityView(data, provider, range) {
    const daysByDate = new Map((data.ai?.days ?? []).map((day) => [day.date, day]));
    const coverage = provider === "all" ? null : getProviderCoverage(data, provider);
    const aggregated = metricProviders(data, dominantMetric(data));
    const allCoverage = provider === "all"
        ? aggregated.map((candidate) => getProviderCoverage(data, candidate))
        : [];
    const days = [];
    for (let current = parseDateKey(range.from); current.getTime() <= parseDateKey(range.to).getTime(); current = addDays(current, 1)) {
        const date = dateKey(current);
        const day = daysByDate.get(date);
        const known = data.ai?.available !== false && (provider === "all"
            ? allCoverage.some((candidate) => isDateCovered(candidate, date))
            : isDateCovered(coverage, date));
        days.push({
            date,
            value: provider === "all"
                ? sumAiProviderTokens(Object.fromEntries(aggregated.map((candidate) => [candidate, day?.providers?.[candidate] ?? 0])))
                : day?.providers?.[provider] ?? 0,
            known,
        });
    }
    return buildActivityView(days, range);
}
function ActivitySummaryStats({ summary, metricLabel, summaryLabel, }) {
    return (_jsxs("div", { className: "activity-heatmap__stats", "aria-label": summaryLabel, children: [_jsx(ActivityStat, { value: formatCompactNumber(summary.total), label: metricLabel }), _jsx(ActivityStat, { value: formatExactNumber(summary.activeDays), label: "active days" }), _jsx(ActivityStat, { value: formatCompactNumber(summary.peak), label: "peak" }), _jsx(ActivityStat, { value: formatDayCount(summary.currentStreak), label: "current streak" }), _jsx(ActivityStat, { value: formatDayCount(summary.longestStreak), label: "longest streak" })] }));
}
function ActivityStat({ value, label }) {
    return (_jsxs("div", { className: "activity-heatmap__stat", children: [_jsx("strong", { children: value }), _jsx("span", { children: label })] }));
}
function formatDayCount(value) {
    if (value === null)
        return "—";
    return value + (value === 1 ? " day" : " days");
}
export default ActivityHeatmap;
//# sourceMappingURL=activity-heatmap.js.map
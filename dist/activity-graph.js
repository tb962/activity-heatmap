"use client";
import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useMemo, useState } from "react";
import { addDays, dateKey, formatCompactNumber, formatDateLong, formatExactNumber, getAllAiTokens, getCalendarRange, getProviderCoverage, isDateCovered, parseDateKey, summarizeActivity, trimToDisplayRange, } from "./activity.js";
import { ActivityGreen } from "./activity-green.js";
import { MonoRoundedDonut } from "./mono-rounded-donut.js";
import { DEFAULT_ACTIVITY_DATA } from "./demo-data.js";
const PROVIDER_ORDER = ["claude", "codex", "cursor"];
const DEFAULT_PROVIDER_LABELS = {
    all: "All",
    claude: "Claude",
    codex: "Codex",
    cursor: "Cursor",
};
const PROVIDER_COLORS = {
    all: "#2563eb",
    claude: "#d97757",
    codex: "#10a37f",
    cursor: "#181818",
};
export function ActivityGraph({ data = DEFAULT_ACTIVITY_DATA, title = "The work behind the work.", weeks = 20, showAi = true, defaultAiProvider = "all", providerLabels: customProviderLabels, className, style, ...sectionProps }) {
    const [aiProvider, setAiProvider] = useState(defaultAiProvider);
    const providerLabels = { ...DEFAULT_PROVIDER_LABELS, ...customProviderLabels };
    const displayData = useMemo(() => trimToDisplayRange(data, weeks), [data, weeks]);
    const displayRange = useMemo(() => getCalendarRange(displayData.range.to, weeks), [displayData.range.to, weeks]);
    const githubView = useMemo(() => ({
        days: displayData.github.days.map((day) => ({ date: day.date, value: day.contributions })),
        summary: summarizeActivity(displayData.github.days.map((day) => ({ date: day.date, value: day.contributions })), displayRange),
    }), [displayData.github.days, displayRange]);
    const aiView = useMemo(() => buildAiActivityView(displayData, aiProvider, displayRange), [aiProvider, displayData, displayRange]);
    const aiProviderBreakdown = useMemo(() => buildAiProviderBreakdown(displayData, displayRange, providerLabels), [displayData, displayRange, providerLabels]);
    const generatedLabel = displayData.generatedAt
        ? "Updated " + formatDateLong(displayData.generatedAt.slice(0, 10))
        : "Demo data";
    const githubSource = displayData.github.source ?? "github.com/" + (displayData.github.username ?? "your-handle");
    const aiConfigured = Boolean(displayData.ai && displayData.ai.available !== false);
    const rootClassName = ["activity-graph", className].filter(Boolean).join(" ");
    return (_jsx("section", { className: rootClassName, style: style, ...sectionProps, children: _jsxs("div", { className: "activity-graph__card", children: [_jsxs("div", { className: "activity-graph__heading", children: [_jsx("h2", { children: title }), _jsxs("span", { className: "activity-graph__freshness", children: [generatedLabel, _jsx("span", { "aria-hidden": "true", children: "\u2022" }), "Last ", weeks, " weeks"] })] }), _jsxs("div", { className: showAi ? "activity-graph__columns" : "activity-graph__columns activity-graph__columns--single", children: [_jsxs("div", { className: "activity-graph__column", children: [_jsx("div", { className: "activity-graph__column-heading", children: _jsxs("div", { children: [_jsx("p", { className: "activity-graph__column-label", children: "GitHub" }), _jsxs("p", { className: "activity-graph__source", children: ["Source:", " ", displayData.github.href ? (_jsx("a", { href: displayData.github.href, target: "_blank", rel: "noreferrer", children: githubSource })) : githubSource] })] }) }), _jsx(ActivitySummaryStats, { summary: githubView.summary, metricLabel: "contributions", summaryLabel: "GitHub activity summary" }), _jsx(ActivityGreen, { theme: "light", data: githubView.days, to: displayData.range.to, weeks: weeks, fitToWidth: false, title: "GitHub activity", unitLabel: "contributions", showSummary: false, cell: 13 })] }), showAi ? (_jsxs("div", { className: "activity-graph__column activity-graph__column--ai", style: { "--activity-provider-color": PROVIDER_COLORS[aiProvider] }, children: [_jsxs("div", { className: "activity-graph__column-heading", children: [_jsxs("div", { className: "activity-graph__column-heading-copy", children: [_jsx("p", { className: "activity-graph__column-label", children: "AI activity" }), _jsxs("p", { className: "activity-graph__source", children: ["Source: ", displayData.ai?.source ?? displayData.ai?.sources?.[aiProvider === "all" ? "claude" : aiProvider] ?? "No AI activity source connected"] }), !aiConfigured ? (_jsxs("p", { className: "activity-graph__empty-note", children: ["Pass ", _jsx("code", { children: "data.ai" }), " to replace the demo ledger."] })) : null] }), _jsx("div", { className: "activity-graph__provider-toggle", role: "group", "aria-label": "Choose AI activity view", children: ["all", ...PROVIDER_ORDER].map((provider) => (_jsx("button", { type: "button", className: "activity-graph__provider-button", "data-active": aiProvider === provider ? "true" : "false", "aria-pressed": aiProvider === provider, onClick: () => setAiProvider(provider), children: providerLabels[provider] }, provider))) })] }), _jsx(ActivitySummaryStats, { summary: aiView.summary, metricLabel: "tokens", summaryLabel: providerLabels[aiProvider] + " token activity summary" }), _jsxs("div", { className: "activity-graph__ai-visuals", children: [_jsx(ActivityGreen, { theme: "light", data: aiView.days, to: displayData.range.to, weeks: weeks, fitToWidth: false, title: providerLabels[aiProvider] + " AI token activity", unitLabel: "tokens", showSummary: false, baseColor: PROVIDER_COLORS[aiProvider], tooltip: (day) => formatCompactNumber(day.value) + " tokens", cell: 13 }), _jsx("div", { className: "activity-graph__ai-breakdown", children: _jsx(MonoRoundedDonut, { data: aiProviderBreakdown, valueFormatter: formatCompactNumber, centerLabel: "all tokens", ariaLabel: "AI token breakdown by provider" }) })] })] })) : null] })] }) }));
}
function buildActivityView(days, range) {
    return { days, summary: summarizeActivity(days, range) };
}
function buildAiProviderBreakdown(data, range, providerLabels) {
    const totals = Object.fromEntries(PROVIDER_ORDER.map((provider) => [provider, 0]));
    (data.ai?.days ?? []).forEach((day) => {
        if (day.date < range.from || day.date > range.to)
            return;
        PROVIDER_ORDER.forEach((provider) => {
            totals[provider] += day.providers?.[provider] ?? 0;
        });
    });
    return PROVIDER_ORDER.map((provider) => ({
        id: provider,
        label: providerLabels[provider],
        value: totals[provider],
        color: PROVIDER_COLORS[provider],
    }));
}
function buildAiActivityView(data, provider, range) {
    const daysByDate = new Map((data.ai?.days ?? []).map((day) => [day.date, day]));
    const coverage = provider === "all" ? null : getProviderCoverage(data, provider);
    const allCoverage = provider === "all"
        ? PROVIDER_ORDER.map((candidate) => getProviderCoverage(data, candidate))
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
            value: provider === "all" ? getAllAiTokens(day) : day?.providers?.[provider] ?? 0,
            known,
        });
    }
    return buildActivityView(days, range);
}
function ActivitySummaryStats({ summary, metricLabel, summaryLabel, }) {
    return (_jsxs("div", { className: "activity-graph__stats", "aria-label": summaryLabel, children: [_jsx(ActivityStat, { value: formatCompactNumber(summary.total), label: metricLabel }), _jsx(ActivityStat, { value: formatExactNumber(summary.activeDays), label: "active days" }), _jsx(ActivityStat, { value: formatCompactNumber(summary.peak), label: "peak" }), _jsx(ActivityStat, { value: formatDayCount(summary.currentStreak), label: "current streak" }), _jsx(ActivityStat, { value: formatDayCount(summary.longestStreak), label: "longest streak" })] }));
}
function ActivityStat({ value, label }) {
    return (_jsxs("div", { className: "activity-graph__stat", children: [_jsx("strong", { children: value }), _jsx("span", { children: label })] }));
}
function formatDayCount(value) {
    if (value === null)
        return "—";
    return value + (value === 1 ? " day" : " days");
}
export default ActivityGraph;
//# sourceMappingURL=activity-graph.js.map
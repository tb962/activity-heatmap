"use client";
import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { activityLevel, buildActivityGrid, columnsToCover, columnsWithin, gridMeasures, } from "./activity-grid.js";
const SHAPE_RADIUS = {
    rounded: "22%",
    square: "0",
    circle: "50%",
};
const PALETTE = {
    dark: {
        empty: "#1b1f23",
        levels: ["#0e4429", "#006d32", "#26a641", "#39d353"],
        text: "#8b949e",
        strongText: "#e6edf3",
    },
    light: {
        empty: "#ebedf0",
        levels: ["#9be9a8", "#40c463", "#30a14e", "#216e39"],
        text: "#57606a",
        strongText: "#1f2328",
    },
};
const TOOLTIP_DELAY = 300;
export function ActivityCalendar({ theme = "dark", data = [], to, weeks, minDays = 30, maxDays = 371, fitToWidth = true, title, unitLabel = "events", showSummary = true, baseColor, levelColors, emptyColor, tooltip, cell = 13, gap = 3, shape = "rounded", showLegend = true, onRangeChange, }) {
    const colors = useMemo(() => buildActivityPalette(theme, baseColor, levelColors, emptyColor), [theme, baseColor, levelColors, emptyColor]);
    const gridRef = useRef(null);
    const [width, setWidth] = useState(0);
    useEffect(() => {
        const element = gridRef.current;
        if (!element || typeof ResizeObserver === "undefined")
            return;
        const observer = new ResizeObserver((entries) => {
            setWidth(Math.floor(entries[0]?.contentRect?.width ?? 0));
        });
        observer.observe(element);
        return () => observer.disconnect();
    }, []);
    const end = useMemo(() => (to ? new Date(to) : new Date()), [to]);
    const measurements = useMemo(() => gridMeasures({
        width,
        desiredCell: cell,
        gap,
        minimumColumns: weeks ?? columnsToCover(end, minDays),
        maximumColumns: weeks ?? columnsWithin(end, maxDays),
        fitToWidth,
    }), [width, cell, end, weeks, minDays, maxDays, fitToWidth]);
    const grid = useMemo(() => buildActivityGrid({ data, to: end, columns: measurements.columns }), [data, end, measurements.columns]);
    const firstDay = grid.weeks[0]?.[0]?.date ?? null;
    const visibleDays = measurements.columns * 7;
    useEffect(() => {
        if (!onRangeChange || !firstDay)
            return;
        onRangeChange({
            from: firstDay.toISOString().slice(0, 10),
            to: end.toISOString().slice(0, 10),
            days: visibleDays,
            columns: measurements.columns,
        });
    }, [onRangeChange, firstDay, end, visibleDays, measurements.columns]);
    const columnWidth = measurements.cell + gap;
    const ariaLabel = (title ? title + ". " : "") +
        grid.total +
        " " +
        unitLabel +
        " in the displayed period." +
        (grid.unknownDays > 0
            ? " Data not available for " + grid.unknownDays + " days."
            : "");
    return (
    // `role="img"` would make the whole subtree presentational, hiding the
    // per-day cells that are keyboard focusable. A labelled group keeps both
    // the summary and the individual cells reachable.
    _jsxs("div", { className: "activity-graph__calendar", "data-theme": theme, role: "group", "aria-label": ariaLabel, children: [showSummary && (title || grid.total > 0) ? (_jsxs("div", { className: "activity-graph__calendar-summary", children: [title ? _jsx("h4", { children: title }) : _jsx("span", {}), _jsx("span", { children: grid.total + " " + unitLabel + " in period" })] })) : null, _jsxs("div", { ref: gridRef, className: "activity-graph__calendar-grid", children: [_jsx("div", { className: "activity-graph__month-row", children: grid.monthLabels.map((month) => (_jsx("span", { style: { left: month.column * columnWidth }, children: month.text }, month.text + "-" + month.column))) }), _jsx("div", { className: "activity-graph__weeks", style: { gap }, children: grid.weeks.map((week, columnIndex) => (_jsx("div", { className: "activity-graph__week", style: { gap }, children: week.map((day) => (_jsx(ActivityCell, { day: day, thresholds: grid.thresholds, size: measurements.cell, colors: colors, shape: shape, unitLabel: unitLabel, tooltip: tooltip, tooltipAlign: columnIndex === 0
                                    ? "start"
                                    : columnIndex === grid.weeks.length - 1
                                        ? "end"
                                        : "center" }, day.key))) }, columnIndex))) }), showLegend ? (_jsxs("div", { className: "activity-graph__legend", children: [_jsx("span", { children: "less" }), _jsx(LegendCell, { color: colors.empty, shape: shape }), colors.levels.map((color) => (_jsx(LegendCell, { color: color, shape: shape }, color))), _jsx("span", { children: "more" }), grid.unknownDays > 0 ? (_jsxs(_Fragment, { children: [_jsx("span", { className: "activity-graph__legend-na", children: "n/a" }), _jsx(LegendCell, { color: colors.empty, shape: shape, opacity: 0.5 })] })) : null] })) : null] })] }));
}
function ActivityCell({ day, thresholds, size, colors, shape, unitLabel, tooltip, tooltipAlign, }) {
    const tooltipId = useId();
    const tooltipTimer = useRef(null);
    const [tooltipVisible, setTooltipVisible] = useState(false);
    const level = activityLevel(day.value, thresholds);
    const dateLabel = day.date.toLocaleDateString("en-US", {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
        timeZone: "UTC",
    });
    const detailLabel = !day.known
        ? "Data not available for this day"
        : tooltip
            ? tooltip(day)
            : day.value + " " + unitLabel;
    const hasTooltip = day.inside;
    const hasInfo = day.inside && day.known;
    useEffect(() => {
        return () => {
            if (tooltipTimer.current !== null)
                window.clearTimeout(tooltipTimer.current);
        };
    }, []);
    const clearTooltipTimer = () => {
        if (tooltipTimer.current !== null) {
            window.clearTimeout(tooltipTimer.current);
            tooltipTimer.current = null;
        }
    };
    const showTooltip = () => {
        if (!hasTooltip)
            return;
        clearTooltipTimer();
        tooltipTimer.current = window.setTimeout(() => {
            setTooltipVisible(true);
            tooltipTimer.current = null;
        }, TOOLTIP_DELAY);
    };
    const hideTooltip = () => {
        clearTooltipTimer();
        setTooltipVisible(false);
    };
    const cellStyle = {
        width: size,
        height: size,
        minWidth: 4,
        minHeight: 4,
        background: !day.inside
            ? "transparent"
            : !day.known
                ? colors.empty
                : level === 0
                    ? colors.empty
                    : colors.levels[level - 1],
        opacity: day.inside && !day.known ? 0.5 : 1,
        borderRadius: SHAPE_RADIUS[shape],
    };
    return (_jsxs("div", { className: "activity-graph__cell-hit-area", "data-has-info": hasInfo ? "true" : "false", "data-has-tooltip": hasTooltip ? "true" : "false", tabIndex: hasTooltip ? 0 : undefined, "aria-describedby": tooltipVisible ? tooltipId : undefined, "aria-label": hasTooltip ? dateLabel + ". " + detailLabel : undefined, onPointerEnter: showTooltip, onPointerLeave: hideTooltip, onFocus: showTooltip, onBlur: hideTooltip, style: { width: size, height: size, minWidth: 4, minHeight: 4 }, children: [_jsx("div", { className: "activity-graph__cell", style: cellStyle }), tooltipVisible && hasTooltip ? (_jsxs("div", { id: tooltipId, className: "activity-graph__tooltip", "data-align": tooltipAlign, role: "tooltip", children: [_jsx("span", { className: "activity-graph__tooltip-date", children: dateLabel }), _jsx("span", { className: "activity-graph__tooltip-detail", children: detailLabel })] })) : null] }));
}
function LegendCell({ color, shape, opacity = 1, }) {
    return (_jsx("span", { className: "activity-graph__legend-cell", style: { background: color, opacity, borderRadius: SHAPE_RADIUS[shape] }, "aria-hidden": "true" }));
}
function buildActivityPalette(theme, baseColor, levelColors, emptyColor) {
    const palette = PALETTE[theme] ?? PALETTE.light;
    const empty = emptyColor ?? palette.empty;
    // An explicit ramp wins over anything derived from a single base colour.
    if (levelColors && levelColors.length > 0) {
        return { ...palette, empty, levels: levelColors };
    }
    const base = baseColor ? parseHex(baseColor) : null;
    if (!base)
        return { ...palette, empty };
    // Faint shades have to fade toward the surface behind them, so a dark card
    // ramps down to near-black instead of washing out to white.
    const ground = theme === "dark" ? { r: 22, g: 21, b: 19 } : { r: 255, g: 255, b: 255 };
    const peak = theme === "dark" ? { r: 255, g: 255, b: 255 } : { r: 0, g: 0, b: 0 };
    return {
        ...palette,
        empty,
        levels: [
            mixRgb(base, ground, 0.8),
            mixRgb(base, ground, 0.5),
            mixRgb(base, ground, 0.22),
            mixRgb(base, peak, 0.1),
        ],
    };
}
function parseHex(value) {
    const normalized = value.trim().replace(/^#/, "");
    if (!/^[0-9a-f]{6}$/i.test(normalized))
        return null;
    return {
        r: Number.parseInt(normalized.slice(0, 2), 16),
        g: Number.parseInt(normalized.slice(2, 4), 16),
        b: Number.parseInt(normalized.slice(4, 6), 16),
    };
}
function mixRgb(color, target, targetWeight) {
    const channel = (value, targetValue) => Math.round(value + (targetValue - value) * targetWeight);
    return ("#" +
        [channel(color.r, target.r), channel(color.g, target.g), channel(color.b, target.b)]
            .map((value) => value.toString(16).padStart(2, "0"))
            .join(""));
}
export default ActivityCalendar;
//# sourceMappingURL=activity-calendar.js.map
"use client";
import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useMemo, useState } from "react";
const VIEWBOX_SIZE = 100;
const CENTER = VIEWBOX_SIZE / 2;
const RADIUS = 35;
const STROKE_WIDTH = 13;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
const SEGMENT_GAP = 17;
export function MonoRoundedDonut({ data, valueFormatter = (value) => String(value), centerLabel = "all tokens", ariaLabel = "Activity breakdown", }) {
    const [hoveredId, setHoveredId] = useState(null);
    const total = data.reduce((sum, item) => sum + normalizeValue(item.value), 0);
    const segments = useMemo(() => buildSegments(data, total), [data, total]);
    const hoveredSegment = segments.find((segment) => segment.id === hoveredId);
    const centerValue = hoveredSegment && total > 0
        ? Math.round((hoveredSegment.value / total) * 100) + "%"
        : valueFormatter(total);
    const centerText = hoveredSegment?.label ?? centerLabel;
    return (_jsx("div", { className: "activity-graph__donut", role: "group", "aria-label": ariaLabel, children: _jsxs("div", { className: "activity-graph__donut-stage", children: [_jsx("svg", { className: "activity-graph__donut-svg", viewBox: `0 0 ${VIEWBOX_SIZE} ${VIEWBOX_SIZE}`, role: "img", "aria-label": ariaLabel, children: _jsx("g", { transform: `rotate(-90 ${CENTER} ${CENTER})`, children: segments.map((segment) => (_jsx("circle", { className: "activity-graph__donut-segment", "data-active": hoveredId === segment.id ? "true" : "false", "data-muted": hoveredId && hoveredId !== segment.id ? "true" : "false", cx: CENTER, cy: CENTER, r: RADIUS, fill: "none", stroke: segment.color, strokeDasharray: `${segment.length} ${CIRCUMFERENCE}`, strokeDashoffset: segment.offset, strokeLinecap: "round", strokeWidth: STROKE_WIDTH, tabIndex: segment.value > 0 ? 0 : -1, "aria-label": `${segment.label}: ${valueFormatter(segment.value)}`, onFocus: () => setHoveredId(segment.id), onMouseEnter: () => setHoveredId(segment.id), onBlur: () => setHoveredId(null), onMouseLeave: () => setHoveredId(null) }, segment.id))) }) }), _jsxs("div", { className: "activity-graph__donut-center", "aria-hidden": "true", children: [_jsx("strong", { children: centerValue }), _jsx("span", { children: centerText })] }), hoveredSegment ? (_jsxs("div", { className: "activity-graph__donut-detail", "aria-hidden": "true", children: [_jsx("span", { className: "activity-graph__donut-detail-dot", style: { backgroundColor: hoveredSegment.color } }), _jsx("span", { className: "activity-graph__donut-detail-label", children: hoveredSegment.label }), _jsx("strong", { className: "activity-graph__donut-detail-value", children: valueFormatter(hoveredSegment.value) })] })) : null] }) }));
}
function buildSegments(data, total) {
    const activeSegments = data.filter((item) => normalizeValue(item.value) > 0).length;
    const gap = activeSegments > 1 ? SEGMENT_GAP : 0;
    let offset = 0;
    return data.map((item) => {
        const value = normalizeValue(item.value);
        const sweep = total > 0 ? (value / total) * CIRCUMFERENCE : 0;
        const length = value > 0 ? Math.max(sweep - gap, 0.1) : 0;
        const segment = {
            ...item,
            value,
            length,
            offset: -(offset + (value > 0 ? gap / 2 : 0)),
        };
        offset += sweep;
        return segment;
    });
}
function normalizeValue(value) {
    return Number.isFinite(value) && value > 0 ? value : 0;
}
//# sourceMappingURL=mono-rounded-donut.js.map
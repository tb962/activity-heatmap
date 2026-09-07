"use client";

import { useMemo, useState } from "react";

export type MonoRoundedDonutDatum = {
  id: string;
  label: string;
  value: number;
  color: string;
};

type MonoRoundedDonutProps = {
  data: MonoRoundedDonutDatum[];
  valueFormatter?: (value: number) => string;
  centerLabel?: string;
  ariaLabel?: string;
};

const VIEWBOX_SIZE = 100;
const CENTER = VIEWBOX_SIZE / 2;
const RADIUS = 35;
const STROKE_WIDTH = 13;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
const SEGMENT_GAP = 17;

export function MonoRoundedDonut({
  data,
  valueFormatter = (value) => String(value),
  centerLabel = "all tokens",
  ariaLabel = "Activity breakdown",
}: MonoRoundedDonutProps) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const total = data.reduce((sum, item) => sum + normalizeValue(item.value), 0);
  const segments = useMemo(() => buildSegments(data, total), [data, total]);
  const hoveredSegment = segments.find((segment) => segment.id === hoveredId);
  const centerValue = hoveredSegment && total > 0
    ? Math.round((hoveredSegment.value / total) * 100) + "%"
    : valueFormatter(total);
  const centerText = hoveredSegment?.label ?? centerLabel;

  return (
    <div className="activity-graph__donut" role="group" aria-label={ariaLabel}>
      <div className="activity-graph__donut-stage">
        <svg
          className="activity-graph__donut-svg"
          viewBox={`0 0 ${VIEWBOX_SIZE} ${VIEWBOX_SIZE}`}
          role="img"
          aria-label={ariaLabel}
        >
          <g transform={`rotate(-90 ${CENTER} ${CENTER})`}>
            {segments.map((segment) => (
              <circle
                className="activity-graph__donut-segment"
                data-active={hoveredId === segment.id ? "true" : "false"}
                data-muted={hoveredId && hoveredId !== segment.id ? "true" : "false"}
                key={segment.id}
                cx={CENTER}
                cy={CENTER}
                r={RADIUS}
                fill="none"
                stroke={segment.color}
                strokeDasharray={`${segment.length} ${CIRCUMFERENCE}`}
                strokeDashoffset={segment.offset}
                strokeLinecap="round"
                strokeWidth={STROKE_WIDTH}
                tabIndex={segment.value > 0 ? 0 : -1}
                aria-label={`${segment.label}: ${valueFormatter(segment.value)}`}
                onFocus={() => setHoveredId(segment.id)}
                onMouseEnter={() => setHoveredId(segment.id)}
                onBlur={() => setHoveredId(null)}
                onMouseLeave={() => setHoveredId(null)}
              />
            ))}
          </g>
        </svg>

        <div className="activity-graph__donut-center" aria-hidden="true">
          <strong>{centerValue}</strong>
          <span>{centerText}</span>
        </div>

        {hoveredSegment ? (
          <div className="activity-graph__donut-detail" aria-hidden="true">
            <span
              className="activity-graph__donut-detail-dot"
              style={{ backgroundColor: hoveredSegment.color }}
            />
            <span className="activity-graph__donut-detail-label">{hoveredSegment.label}</span>
            <strong className="activity-graph__donut-detail-value">
              {valueFormatter(hoveredSegment.value)}
            </strong>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function buildSegments(data: MonoRoundedDonutDatum[], total: number) {
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

function normalizeValue(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : 0;
}

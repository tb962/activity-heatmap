"use client";

import { useEffect, useId, useMemo, useRef, useState, type CSSProperties } from "react";

import {
  activityLevel,
  buildActivityGrid,
  columnsToCover,
  columnsWithin,
  gridMeasures,
  type ActivityGridDay,
  type ActivityGridPoint,
} from "./activity-grid.js";

type ActivityGreenTheme = "dark" | "light";

type ActivityRange = {
  from: string;
  to: string;
  days: number;
  columns: number;
};

type ActivityPalette = {
  empty: string;
  levels: string[];
  text: string;
  strongText: string;
};

export type ActivityGreenProps = {
  theme?: ActivityGreenTheme;
  data?: ActivityGridPoint[];
  to?: Date | string;
  weeks?: number;
  minDays?: number;
  maxDays?: number;
  fitToWidth?: boolean;
  title?: string;
  unitLabel?: string;
  showSummary?: boolean;
  baseColor?: string;
  tooltip?: (day: ActivityGridDay) => string;
  cell?: number;
  onRangeChange?: (range: ActivityRange) => void;
};

const PALETTE: Record<ActivityGreenTheme, ActivityPalette> = {
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

export function ActivityGreen({
  theme = "dark",
  data = [],
  to,
  weeks,
  minDays = 30,
  maxDays = 371,
  fitToWidth = true,
  title,
  unitLabel = "events",
  showSummary = true,
  baseColor,
  tooltip,
  cell = 13,
  onRangeChange,
}: ActivityGreenProps) {
  const colors = useMemo(() => buildActivityPalette(theme, baseColor), [theme, baseColor]);
  const gap = 3;
  const gridRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const element = gridRef.current;
    if (!element || typeof ResizeObserver === "undefined") return;

    const observer = new ResizeObserver((entries) => {
      setWidth(Math.floor(entries[0]?.contentRect?.width ?? 0));
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const end = useMemo(() => (to ? new Date(to) : new Date()), [to]);
  const measurements = useMemo(
    () =>
      gridMeasures({
        width,
        desiredCell: cell,
        gap,
        minimumColumns: weeks ?? columnsToCover(end, minDays),
        maximumColumns: weeks ?? columnsWithin(end, maxDays),
        fitToWidth,
      }),
    [width, cell, end, weeks, minDays, maxDays, fitToWidth],
  );
  const grid = useMemo(
    () => buildActivityGrid({ data, to: end, columns: measurements.columns }),
    [data, end, measurements.columns],
  );
  const firstDay = grid.weeks[0]?.[0]?.date ?? null;
  const visibleDays = measurements.columns * 7;

  useEffect(() => {
    if (!onRangeChange || !firstDay) return;
    onRangeChange({
      from: firstDay.toISOString().slice(0, 10),
      to: end.toISOString().slice(0, 10),
      days: visibleDays,
      columns: measurements.columns,
    });
  }, [onRangeChange, firstDay, end, visibleDays, measurements.columns]);

  const columnWidth = measurements.cell + gap;
  const ariaLabel =
    (title ? title + ". " : "") +
    grid.total +
    " " +
    unitLabel +
    " in the displayed period." +
    (grid.unknownDays > 0
      ? " Data not available for " + grid.unknownDays + " days."
      : "");

  return (
    <div className="activity-graph__calendar" data-theme={theme} role="img" aria-label={ariaLabel}>
      {showSummary && (title || grid.total > 0) ? (
        <div className="activity-graph__calendar-summary">
          {title ? <h4>{title}</h4> : <span />}
          <span>{grid.total + " " + unitLabel + " in period"}</span>
        </div>
      ) : null}

      <div ref={gridRef} className="activity-graph__calendar-grid">
        <div className="activity-graph__month-row">
          {grid.monthLabels.map((month) => (
            <span
              key={month.text + "-" + month.column}
              style={{ left: month.column * columnWidth }}
            >
              {month.text}
            </span>
          ))}
        </div>

        <div className="activity-graph__weeks" style={{ gap }}>
          {grid.weeks.map((week, columnIndex) => (
            <div className="activity-graph__week" style={{ gap }} key={columnIndex}>
              {week.map((day) => (
                <ActivityCell
                  key={day.key}
                  day={day}
                  maximum={grid.maximum}
                  size={measurements.cell}
                  colors={colors}
                  unitLabel={unitLabel}
                  tooltip={tooltip}
                  tooltipAlign={
                    columnIndex === 0
                      ? "start"
                      : columnIndex === grid.weeks.length - 1
                        ? "end"
                        : "center"
                  }
                />
              ))}
            </div>
          ))}
        </div>

        <div className="activity-graph__legend">
          <span>less</span>
          <LegendCell color={colors.empty} />
          {colors.levels.map((color) => <LegendCell key={color} color={color} />)}
          <span>more</span>
          {grid.unknownDays > 0 ? (
            <>
              <span className="activity-graph__legend-na">n/a</span>
              <LegendCell color={colors.empty} opacity={0.5} />
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function ActivityCell({
  day,
  maximum,
  size,
  colors,
  unitLabel,
  tooltip,
  tooltipAlign,
}: {
  day: ActivityGridDay;
  maximum: number;
  size: number;
  colors: ActivityPalette;
  unitLabel: string;
  tooltip?: (day: ActivityGridDay) => string;
  tooltipAlign: "start" | "center" | "end";
}) {
  const tooltipId = useId();
  const tooltipTimer = useRef<number | null>(null);
  const [tooltipVisible, setTooltipVisible] = useState(false);
  const level = activityLevel(day.value, maximum);
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
      if (tooltipTimer.current !== null) window.clearTimeout(tooltipTimer.current);
    };
  }, []);

  const clearTooltipTimer = () => {
    if (tooltipTimer.current !== null) {
      window.clearTimeout(tooltipTimer.current);
      tooltipTimer.current = null;
    }
  };

  const showTooltip = () => {
    if (!hasTooltip) return;
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

  const cellStyle: CSSProperties = {
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
  };

  return (
    <div
      className="activity-graph__cell-hit-area"
      data-has-info={hasInfo ? "true" : "false"}
      data-has-tooltip={hasTooltip ? "true" : "false"}
      tabIndex={hasTooltip ? 0 : undefined}
      aria-describedby={tooltipVisible ? tooltipId : undefined}
      aria-label={hasTooltip ? dateLabel + ". " + detailLabel : undefined}
      onPointerEnter={showTooltip}
      onPointerLeave={hideTooltip}
      onFocus={showTooltip}
      onBlur={hideTooltip}
      style={{ width: size, height: size, minWidth: 4, minHeight: 4 }}
    >
      <div className="activity-graph__cell" style={cellStyle} />
      {tooltipVisible && hasTooltip ? (
        <div
          id={tooltipId}
          className="activity-graph__tooltip"
          data-align={tooltipAlign}
          role="tooltip"
        >
          <span className="activity-graph__tooltip-date">{dateLabel}</span>
          <span className="activity-graph__tooltip-detail">{detailLabel}</span>
        </div>
      ) : null}
    </div>
  );
}

function LegendCell({ color, opacity = 1 }: { color: string; opacity?: number }) {
  return <span className="activity-graph__legend-cell" style={{ background: color, opacity }} aria-hidden="true" />;
}

function buildActivityPalette(theme: ActivityGreenTheme, baseColor?: string): ActivityPalette {
  const palette = PALETTE[theme] ?? PALETTE.light;
  const base = baseColor ? parseHex(baseColor) : null;
  if (!base) return palette;

  return {
    ...palette,
    levels: [
      mixRgb(base, { r: 255, g: 255, b: 255 }, 0.8),
      mixRgb(base, { r: 255, g: 255, b: 255 }, 0.5),
      mixRgb(base, { r: 255, g: 255, b: 255 }, 0.22),
      mixRgb(base, { r: 0, g: 0, b: 0 }, 0.1),
    ],
  };
}

function parseHex(value: string): { r: number; g: number; b: number } | null {
  const normalized = value.trim().replace(/^#/, "");
  if (!/^[0-9a-f]{6}$/i.test(normalized)) return null;
  return {
    r: Number.parseInt(normalized.slice(0, 2), 16),
    g: Number.parseInt(normalized.slice(2, 4), 16),
    b: Number.parseInt(normalized.slice(4, 6), 16),
  };
}

function mixRgb(
  color: { r: number; g: number; b: number },
  target: { r: number; g: number; b: number },
  targetWeight: number,
): string {
  const channel = (value: number, targetValue: number) =>
    Math.round(value + (targetValue - value) * targetWeight);

  return (
    "#" +
    [channel(color.r, target.r), channel(color.g, target.g), channel(color.b, target.b)]
      .map((value) => value.toString(16).padStart(2, "0"))
      .join("")
  );
}

export default ActivityGreen;

const MONTH_LABELS = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
];
const DAY_IN_MS = 24 * 60 * 60 * 1000;
export function dayKey(value) {
    const date = new Date(value);
    return (date.getUTCFullYear() +
        "-" +
        String(date.getUTCMonth() + 1).padStart(2, "0") +
        "-" +
        String(date.getUTCDate()).padStart(2, "0"));
}
function midnightUtc(value) {
    const date = new Date(value);
    return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}
/**
 * Shade bands are cut at quantiles of the active days rather than at fractions
 * of the maximum. Token counts are heavy-tailed — one long day can be 20x the
 * median — so linear-against-max collapses most of the calendar into the
 * palest shade. Ranking the active days keeps all four shades in use whatever
 * the unit is (tokens, contributions, messages, edited lines).
 */
export function quantileThresholds(values, bands = 4) {
    const active = values.filter((value) => value > 0).sort((left, right) => left - right);
    if (active.length === 0)
        return [];
    const thresholds = [];
    for (let band = 1; band < bands; band += 1) {
        const rank = Math.ceil((active.length * band) / bands) - 1;
        const candidate = active[Math.max(0, Math.min(active.length - 1, rank))];
        // Keep the ladder strictly increasing so repeated values do not create
        // bands that can never be reached.
        if (thresholds.length === 0 || candidate > thresholds[thresholds.length - 1]) {
            thresholds.push(candidate);
        }
    }
    // The top band always ends at the maximum, but only as a new rung: pushing
    // a duplicate would inflate the band count and skew every lookup below it.
    const maximum = active[active.length - 1];
    if (thresholds.length === 0 || maximum > thresholds[thresholds.length - 1]) {
        thresholds.push(maximum);
    }
    return thresholds;
}
export function activityLevel(value, maximumOrThresholds) {
    if (value <= 0)
        return 0;
    if (typeof maximumOrThresholds !== "number") {
        const thresholds = maximumOrThresholds;
        if (thresholds.length === 0)
            return 0;
        const index = thresholds.findIndex((threshold) => value <= threshold);
        const band = index === -1 ? thresholds.length : index + 1;
        // A short ladder (few distinct values) still maps onto the 4-shade palette.
        return Math.max(1, Math.min(4, Math.round((band / thresholds.length) * 4)));
    }
    const maximum = maximumOrThresholds;
    if (maximum <= 0)
        return 0;
    if (maximum <= 1)
        return 4;
    return Math.max(1, Math.min(4, Math.ceil((value / maximum) * 4)));
}
export function columnsToCover(end, minimumDays) {
    const daysInLastColumn = new Date(end).getUTCDay() + 1;
    if (minimumDays <= daysInLastColumn)
        return 1;
    return 1 + Math.ceil((minimumDays - daysInLastColumn) / 7);
}
export function columnsWithin(end, maximumDays) {
    const daysInLastColumn = new Date(end).getUTCDay() + 1;
    if (maximumDays <= daysInLastColumn)
        return 1;
    return 1 + Math.floor((maximumDays - daysInLastColumn) / 7);
}
export function gridMeasures({ width, desiredCell = 13, gap = 3, minimumColumns = 1, maximumColumns = Infinity, fitToWidth = true, }) {
    if (!width || width <= 0) {
        return { columns: minimumColumns, cell: desiredCell };
    }
    const columnsThatFit = Math.floor((width + gap) / (desiredCell + gap));
    const columns = Math.max(minimumColumns, Math.min(Math.max(columnsThatFit, 1), maximumColumns));
    const availableCell = (width - (columns - 1) * gap) / columns;
    const cell = fitToWidth ? availableCell : Math.min(desiredCell, availableCell);
    return { columns, cell: Math.max(4, cell) };
}
function startForColumns(end, columns) {
    const finish = midnightUtc(end);
    const startOfFinishWeek = new Date(finish);
    startOfFinishWeek.setUTCDate(startOfFinishWeek.getUTCDate() - startOfFinishWeek.getUTCDay());
    const start = new Date(startOfFinishWeek);
    start.setUTCDate(start.getUTCDate() - (columns - 1) * 7);
    return start;
}
export function buildActivityGrid({ data = [], from, to, columns, } = {}) {
    const finish = midnightUtc(to ?? new Date());
    const start = columns
        ? startForColumns(finish, columns)
        : midnightUtc(from ?? new Date(finish.getTime() - 29 * DAY_IN_MS));
    const values = new Map();
    data.forEach((point) => {
        if (point?.date)
            values.set(dayKey(point.date), point);
    });
    const cursor = new Date(start);
    cursor.setUTCDate(cursor.getUTCDate() - cursor.getUTCDay());
    const weeks = [];
    const monthLabels = [];
    let previousMonth = "";
    let maximum = 0;
    let total = 0;
    let unknownDays = 0;
    const activeValues = [];
    while (cursor.getTime() <= finish.getTime()) {
        const week = [];
        for (let dayIndex = 0; dayIndex < 7; dayIndex += 1) {
            const date = new Date(cursor);
            const key = dayKey(date);
            const inside = date.getTime() >= start.getTime() && date.getTime() <= finish.getTime();
            const point = inside ? values.get(key) : undefined;
            const value = point?.value ?? 0;
            const known = !inside || Boolean(point && point.known !== false);
            if (inside) {
                if (known) {
                    maximum = Math.max(maximum, value);
                    total += value;
                    if (value > 0)
                        activeValues.push(value);
                }
                else {
                    unknownDays += 1;
                }
            }
            week.push({ key, date, inside, value, known, data: point ?? null });
            cursor.setUTCDate(cursor.getUTCDate() + 1);
        }
        const firstInside = week.find((day) => day.inside);
        if (firstInside) {
            const month = firstInside.date.getUTCMonth();
            const monthKey = firstInside.date.getUTCFullYear() + "-" + month;
            if (monthKey !== previousMonth) {
                monthLabels.push({ column: weeks.length, text: MONTH_LABELS[month] });
                previousMonth = monthKey;
            }
        }
        weeks.push(week);
    }
    return {
        weeks,
        maximum,
        total,
        unknownDays,
        thresholds: quantileThresholds(activeValues),
        monthLabels,
    };
}
//# sourceMappingURL=activity-grid.js.map
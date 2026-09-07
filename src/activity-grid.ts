export type ActivityGridPoint = {
  date: string | Date;
  value: number;
  label?: string;
  known?: boolean;
};

export type ActivityGridDay = {
  key: string;
  date: Date;
  inside: boolean;
  value: number;
  known: boolean;
  data: ActivityGridPoint | null;
};

export type ActivityGridWeek = ActivityGridDay[];

export type ActivityGridResult = {
  weeks: ActivityGridWeek[];
  maximum: number;
  total: number;
  unknownDays: number;
  monthLabels: Array<{ column: number; text: string }>;
};

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
] as const;

const DAY_IN_MS = 24 * 60 * 60 * 1000;

export function dayKey(value: string | Date): string {
  const date = new Date(value);
  return (
    date.getUTCFullYear() +
    "-" +
    String(date.getUTCMonth() + 1).padStart(2, "0") +
    "-" +
    String(date.getUTCDate()).padStart(2, "0")
  );
}

function midnightUtc(value: string | Date): Date {
  const date = new Date(value);
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

export function activityLevel(value: number, maximum: number): number {
  if (value <= 0 || maximum <= 0) return 0;
  if (maximum <= 1) return 4;

  return Math.max(1, Math.min(4, Math.ceil((value / maximum) * 4)));
}

export function columnsToCover(end: string | Date, minimumDays: number): number {
  const daysInLastColumn = new Date(end).getUTCDay() + 1;
  if (minimumDays <= daysInLastColumn) return 1;
  return 1 + Math.ceil((minimumDays - daysInLastColumn) / 7);
}

export function columnsWithin(end: string | Date, maximumDays: number): number {
  const daysInLastColumn = new Date(end).getUTCDay() + 1;
  if (maximumDays <= daysInLastColumn) return 1;
  return 1 + Math.floor((maximumDays - daysInLastColumn) / 7);
}

export function gridMeasures({
  width,
  desiredCell = 13,
  gap = 3,
  minimumColumns = 1,
  maximumColumns = Infinity,
  fitToWidth = true,
}: {
  width: number;
  desiredCell?: number;
  gap?: number;
  minimumColumns?: number;
  maximumColumns?: number;
  fitToWidth?: boolean;
}): { columns: number; cell: number } {
  if (!width || width <= 0) {
    return { columns: minimumColumns, cell: desiredCell };
  }

  const columnsThatFit = Math.floor((width + gap) / (desiredCell + gap));
  const columns = Math.max(
    minimumColumns,
    Math.min(Math.max(columnsThatFit, 1), maximumColumns),
  );
  const availableCell = (width - (columns - 1) * gap) / columns;
  const cell = fitToWidth ? availableCell : Math.min(desiredCell, availableCell);

  return { columns, cell: Math.max(4, cell) };
}

function startForColumns(end: string | Date, columns: number): Date {
  const finish = midnightUtc(end);
  const startOfFinishWeek = new Date(finish);
  startOfFinishWeek.setUTCDate(
    startOfFinishWeek.getUTCDate() - startOfFinishWeek.getUTCDay(),
  );

  const start = new Date(startOfFinishWeek);
  start.setUTCDate(start.getUTCDate() - (columns - 1) * 7);
  return start;
}

export function buildActivityGrid({
  data = [],
  from,
  to,
  columns,
}: {
  data?: ActivityGridPoint[];
  from?: string | Date;
  to?: string | Date;
  columns?: number;
} = {}): ActivityGridResult {
  const finish = midnightUtc(to ?? new Date());
  const start = columns
    ? startForColumns(finish, columns)
    : midnightUtc(from ?? new Date(finish.getTime() - 29 * DAY_IN_MS));
  const values = new Map<string, ActivityGridPoint>();

  data.forEach((point) => {
    if (point?.date) values.set(dayKey(point.date), point);
  });

  const cursor = new Date(start);
  cursor.setUTCDate(cursor.getUTCDate() - cursor.getUTCDay());
  const weeks: ActivityGridWeek[] = [];
  const monthLabels: Array<{ column: number; text: string }> = [];
  let previousMonth = "";
  let maximum = 0;
  let total = 0;
  let unknownDays = 0;

  while (cursor.getTime() <= finish.getTime()) {
    const week: ActivityGridWeek = [];

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
        } else {
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

  return { weeks, maximum, total, unknownDays, monthLabels };
}

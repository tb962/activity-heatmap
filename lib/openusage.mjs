import { dateKeyInZone } from "./local-ai.mjs";

const PROVIDERS = ["claude", "codex", "cursor"];

function numericValue(value) {
  const normalized = typeof value === "string" ? value.replaceAll(",", "").trim() : value;
  const number = Number(normalized);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

function isInRange(value, range) {
  return value >= range.from && value <= range.to;
}

function isDateKey(value) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function providerIdForSnapshot(snapshot) {
  const rawValue = snapshot?.providerId || snapshot?.provider || snapshot?.id || "";
  const value = typeof rawValue === "string"
    ? rawValue.toLowerCase()
    : String(rawValue?.id || "").toLowerCase();
  return PROVIDERS.find((provider) => value.includes(provider)) || null;
}

function getUsageSnapshots(body) {
  if (Array.isArray(body)) return body;
  if (Array.isArray(body?.snapshots)) return body.snapshots;
  if (Array.isArray(body?.providers)) return body.providers;
  if (body && typeof body === "object") return [body];
  return [];
}

function getLines(snapshot) {
  const candidates = [
    snapshot?.lines,
    snapshot?.usage?.lines,
    snapshot?.data?.lines,
    snapshot?.usage?.data?.lines,
  ];
  return candidates.find((candidate) => Array.isArray(candidate)) || [];
}

function getSnapshotTimestamp(snapshot) {
  return snapshot?.fetchedAt || snapshot?.updatedAt || snapshot?.timestamp || new Date().toISOString();
}

function parsePointDate(point, snapshot, timeZone, range) {
  const explicitDate = typeof point?.date === "string"
    ? point.date.match(/\d{4}-\d{2}-\d{2}/)?.[0]
    : null;
  if (explicitDate && isInRange(explicitDate, range)) return explicitDate;

  const label = String(point?.label || "").trim();
  const monthFirstDate = label.match(/^([A-Za-z]{3,9})\s+(\d{1,2})(?:,?\s+(\d{4}))?$/);
  const dayFirstDate = label.match(/^(\d{1,2})\s+([A-Za-z]{3,9})(?:,?\s+(\d{4}))?$/);
  const fullDate = monthFirstDate || dayFirstDate;
  if (!fullDate) return null;

  const monthNames = {
    jan: 0, january: 0, feb: 1, february: 1, mar: 2, march: 2,
    apr: 3, april: 3, may: 4, jun: 5, june: 5, jul: 6, july: 6,
    aug: 7, august: 7, sep: 8, sept: 8, september: 8, oct: 9,
    october: 9, nov: 10, november: 10, dec: 11, december: 11,
  };
  const monthName = monthFirstDate ? fullDate[1] : fullDate[2];
  const dayValue = monthFirstDate ? fullDate[2] : fullDate[1];
  const month = monthNames[monthName.toLowerCase()];
  const day = Number(dayValue);
  if (month === undefined || !Number.isInteger(day)) return null;

  const fetchedAt = new Date(getSnapshotTimestamp(snapshot));
  const referenceKey = dateKeyInZone(
    Number.isNaN(fetchedAt.getTime()) ? new Date() : fetchedAt,
    timeZone,
  );
  const referenceYear = Number(referenceKey.slice(0, 4));
  const explicitYear = fullDate[3] ? Number(fullDate[3]) : null;
  const candidateYears = explicitYear
    ? [explicitYear]
    : [referenceYear - 1, referenceYear, referenceYear + 1];

  return candidateYears
    .map((year) => new Date(Date.UTC(year, month, day)))
    .filter((candidate) => !Number.isNaN(candidate.getTime()))
    .map((candidate) => ({
      value: candidate.toISOString().slice(0, 10),
      distance: Math.abs(candidate.getTime() - fetchedAt.getTime()),
    }))
    .filter((candidate) => isInRange(candidate.value, range))
    .sort((left, right) => left.distance - right.distance)[0]?.value || null;
}

export function parseOpenUsage(body, timeZone, range) {
  const providerDays = Object.fromEntries(PROVIDERS.map((provider) => [provider, new Map()]));

  getUsageSnapshots(body).forEach((snapshot) => {
    const provider = providerIdForSnapshot(snapshot);
    if (!provider) return;

    getLines(snapshot)
      .filter((line) => line?.type === "barChart" && Array.isArray(line?.points))
      .forEach((line) => {
        line.points.forEach((point) => {
          const value = numericValue(point?.value);
          const pointDate = parsePointDate(point, snapshot, timeZone, range);
          if (value === null || !pointDate) return;
          const previous = providerDays[provider].get(pointDate) || 0;
          providerDays[provider].set(pointDate, Math.max(previous, value));
        });
      });
  });

  return providerDays;
}

export async function fetchOpenUsage({
  url,
  timeZone,
  range,
  fetchImpl = fetch,
}) {
  const response = await fetchImpl(url, {
    headers: { accept: "application/json" },
  });
  if (!response.ok) throw new Error("OpenUsage returned HTTP " + response.status);
  return parseOpenUsage(await response.json(), timeZone, range);
}

export function coverageFromProviderDays(providerDays, source = "openusage-local") {
  const coverage = {};
  PROVIDERS.forEach((provider) => {
    const dates = Array.from(providerDays[provider]?.keys() || []).sort();
    if (dates.length === 0) return;
    coverage[provider] = {
      from: dates[0],
      to: dates.at(-1),
      source,
      complete: false,
    };
  });
  return coverage;
}

import { createReadStream } from "node:fs";
import { readdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createInterface } from "node:readline";

export const PROVIDERS = ["claude", "codex", "cursor"];

const DAY_IN_MS = 24 * 60 * 60 * 1000;

function numericValue(value) {
  const normalized = typeof value === "string" ? value.replaceAll(",", "").trim() : value;
  const number = Number(normalized);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

function dateKeyInTimeZone(value, timeZone) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return values.year + "-" + values.month + "-" + values.day;
}

async function walkFiles(root, predicate) {
  const files = [];

  async function visit(directory) {
    let entries = [];
    try {
      entries = await readdir(directory, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const filePath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        await visit(filePath);
      } else if (entry.isFile() && predicate(filePath)) {
        files.push(filePath);
      }
    }
  }

  await visit(root);
  return files.sort();
}

function usageValue(usage, key) {
  return numericValue(usage?.[key]) || 0;
}

export async function scanClaudeLogs({ homeDir = os.homedir(), timeZone }) {
  const root = path.join(homeDir, ".claude", "projects");
  const files = await walkFiles(root, (filePath) => filePath.endsWith(".jsonl"));
  const requests = new Map();
  let records = 0;
  let usageRows = 0;
  let parseErrors = 0;

  for (const filePath of files) {
    const input = createReadStream(filePath);
    const lines = createInterface({ input, crlfDelay: Infinity });
    let lineNumber = 0;

    for await (const line of lines) {
      lineNumber += 1;
      if (!line.trim()) continue;

      let row;
      try {
        row = JSON.parse(line);
      } catch {
        parseErrors += 1;
        continue;
      }

      records += 1;
      const usage = row?.message?.usage;
      if (!usage || typeof usage !== "object") continue;

      const hasTokenField = [
        "input_tokens",
        "output_tokens",
        "cache_creation_input_tokens",
        "cache_read_input_tokens",
      ].some((key) => numericValue(usage[key]) !== null);
      if (!hasTokenField) continue;

      usageRows += 1;
      const requestKey = String(
        row.requestId || usage.id || row.message?.id || row.uuid || filePath + ":" + lineNumber,
      );
      const existing = requests.get(requestKey);
      const next = {
        input: usageValue(usage, "input_tokens"),
        output: usageValue(usage, "output_tokens"),
        cacheCreation: usageValue(usage, "cache_creation_input_tokens"),
        cacheRead: usageValue(usage, "cache_read_input_tokens"),
        timestamp: row.timestamp || row.message?.timestamp || existing?.timestamp || null,
      };

      if (!existing) {
        requests.set(requestKey, next);
        continue;
      }

      requests.set(requestKey, {
        input: Math.max(existing.input, next.input),
        output: Math.max(existing.output, next.output),
        cacheCreation: Math.max(existing.cacheCreation, next.cacheCreation),
        cacheRead: Math.max(existing.cacheRead, next.cacheRead),
        timestamp: next.timestamp || existing.timestamp,
      });
    }
  }

  const days = new Map();
  for (const request of requests.values()) {
    const timestamp = new Date(request.timestamp || "");
    if (Number.isNaN(timestamp.getTime())) continue;

    const day = dateKeyInTimeZone(timestamp, timeZone);
    const tokens = request.input + request.output + request.cacheCreation + request.cacheRead;
    if (tokens > 0) days.set(day, (days.get(day) || 0) + tokens);
  }

  return {
    provider: "claude",
    source: "claude-code-logs",
    days,
    files: files.length,
    records,
    usageRows,
    uniqueRequests: requests.size,
    parseErrors,
  };
}

function tokenSignature(last) {
  return [
    last?.cached_input_tokens,
    last?.input_tokens,
    last?.output_tokens,
    last?.reasoning_output_tokens,
    last?.total_tokens,
  ].join(":");
}

export async function scanCodexLogs({ homeDir = os.homedir(), timeZone }) {
  const roots = [
    path.join(homeDir, ".codex", "sessions"),
    path.join(homeDir, ".codex", "archived_sessions"),
  ];
  const files = [];
  for (const root of roots) {
    files.push(...(await walkFiles(root, (filePath) => filePath.endsWith(".jsonl"))));
  }
  files.sort();

  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const localDate = (timestamp) => {
    const date = new Date(timestamp || "");
    if (Number.isNaN(date.getTime())) return null;
    const parts = Object.fromEntries(
      formatter.formatToParts(date).map((part) => [part.type, part.value]),
    );
    return parts.year + "-" + parts.month + "-" + parts.day;
  };

  const days = new Map();
  let records = 0;
  let tokenRows = 0;
  let uniqueEvents = 0;
  let parseErrors = 0;
  let filesWithUsage = 0;

  for (const filePath of files) {
    const seenEvents = new Set();
    let fileUsage = 0;
    const input = createReadStream(filePath);
    const lines = createInterface({ input, crlfDelay: Infinity });

    for await (const line of lines) {
      if (!line.trim()) continue;

      let row;
      try {
        row = JSON.parse(line);
      } catch {
        parseErrors += 1;
        continue;
      }

      records += 1;
      if (row?.payload?.type !== "token_count") continue;

      const info = row.payload.info;
      const last = info?.last_token_usage;
      if (!last || typeof last !== "object") continue;

      tokenRows += 1;
      const tokens = numericValue(last.total_tokens);
      if (!tokens || tokens <= 0) continue;

      const cumulative = numericValue(info?.total_token_usage?.total_tokens);
      const eventKey = cumulative === null ? tokenSignature(last) : String(cumulative);
      if (seenEvents.has(eventKey)) continue;
      seenEvents.add(eventKey);

      const day = localDate(row.timestamp || row.payload?.timestamp);
      if (!day) continue;

      uniqueEvents += 1;
      fileUsage += 1;
      days.set(day, (days.get(day) || 0) + tokens);
    }

    if (fileUsage > 0) filesWithUsage += 1;
  }

  return {
    provider: "codex",
    source: "codex-session-logs",
    days,
    files: files.length,
    filesWithUsage,
    records,
    tokenRows,
    uniqueEvents,
    parseErrors,
  };
}

export function createEmptyProviderMaps() {
  return Object.fromEntries(PROVIDERS.map((provider) => [provider, new Map()]));
}

export function getLocalSourceSummary(scans) {
  return Object.fromEntries(
    Object.entries(scans).map(([provider, scan]) => [provider, {
      source: scan.source,
      files: scan.files,
      activeDays: scan.days.size,
      tokens: Array.from(scan.days.values()).reduce((sum, value) => sum + value, 0),
      from: Array.from(scan.days.keys()).sort()[0] || null,
      to: Array.from(scan.days.keys()).sort().at(-1) || null,
    }]),
  );
}

export function dateKey(value) {
  return value.toISOString().slice(0, 10);
}

export function parseDateKey(value) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

export function addDays(value, amount) {
  return new Date(value.getTime() + amount * DAY_IN_MS);
}

export function dateKeyInZone(value, timeZone) {
  return dateKeyInTimeZone(value, timeZone);
}

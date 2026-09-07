import { execFile } from "node:child_process";
import { access } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

/**
 * Cursor keeps chat state in a SQLite database written by VS Code's storage
 * layer. Three shapes matter here:
 *
 *   composerHeaders            one indexed row per conversation: composerId,
 *                              createdAt, lastUpdatedAt, plus a small JSON
 *                              blob with totalLinesAdded / totalLinesRemoved.
 *   cursorDiskKV bubbleId:*    one row per message, keyed
 *                              bubbleId:<composerId>:<messageId>.
 *   cursorDiskKV composerData:* the full conversation. Huge, and only needed
 *                              on older Cursor builds that predate the
 *                              composerHeaders table.
 *
 * Cursor does NOT record usable token counts locally. Every bubble carries a
 * tokenCount object, but it is populated so rarely (12 of 60,183 rows on the
 * machine this was built against) that it cannot be charted. So Cursor
 * reports MESSAGES or EDITED LINES per day rather than tokens.
 *
 * Conversations carry no per-message timestamps, so a whole thread is
 * attributed to the day it was last updated. A thread worked on across
 * several days lands entirely on the final day.
 *
 * Cursor keeps a second database that does have exact timestamps:
 *
 *   ~/.cursor/ai-tracking/ai-code-tracking.db
 *     ai_code_hashes   one row per block of AI-written code, with the exact
 *                      millisecond it landed and the model that wrote it
 *
 * That is the most accurate signal available without credentials, so it is
 * the default. Cursor prunes the table to a rolling window of about two
 * weeks, which does not matter here: the sync appends to its own history
 * file, so coverage accumulates from the first run onward.
 */

export const CURSOR_METRICS = ["aiEdits", "messages", "edits"];

const HEADER_QUERY = [
  "select composerId,",
  "  createdAt,",
  "  lastUpdatedAt,",
  "  coalesce(json_extract(value, '$.totalLinesAdded'), 0) as linesAdded,",
  "  coalesce(json_extract(value, '$.totalLinesRemoved'), 0) as linesRemoved",
  "from composerHeaders",
].join(" ");

/**
 * Key-only scan: never touches the (very large) value column. Keys look like
 * `bubbleId:<composerId>:<messageId>`; the composer id is read up to the next
 * colon rather than at a fixed width, so it does not depend on ids being
 * 36-character UUIDs.
 */
const BUBBLE_COUNT_QUERY = [
  "select substr(key, 10, instr(substr(key, 10), ':') - 1) as composerId,",
  "  count(*) as messages",
  "from cursorDiskKV",
  "where key like 'bubbleId:%:%'",
  "group by composerId",
].join(" ");

// Fallback for Cursor builds with no composerHeaders table. Parses every
// conversation blob, so it is roughly 300x slower than the header path.
const LEGACY_QUERY = [
  "select json_extract(value, '$.composerId') as composerId,",
  "  json_extract(value, '$.createdAt') as createdAt,",
  "  json_extract(value, '$.lastUpdatedAt') as lastUpdatedAt,",
  "  0 as linesAdded,",
  "  0 as linesRemoved,",
  "  json_array_length(json_extract(value, '$.fullConversationHeadersOnly')) as messages",
  "from cursorDiskKV",
  "where key like 'composerData:%'",
].join(" ");

const AI_TRACKING_QUERY = [
  "select timestamp, source",
  "from ai_code_hashes",
  "where timestamp is not null",
].join(" ");

export function defaultCursorTrackingDbPaths(homeDir = os.homedir()) {
  return [path.join(homeDir, ".cursor", "ai-tracking", "ai-code-tracking.db")];
}

export function defaultCursorDbPaths(homeDir = os.homedir(), platform = process.platform, env = process.env) {
  const leaf = path.join("User", "globalStorage", "state.vscdb");
  if (platform === "darwin") {
    return [path.join(homeDir, "Library", "Application Support", "Cursor", leaf)];
  }
  if (platform === "win32") {
    const appData = env.APPDATA || path.join(homeDir, "AppData", "Roaming");
    return [path.join(appData, "Cursor", leaf)];
  }
  return [
    path.join(homeDir, ".config", "Cursor", leaf),
    path.join(homeDir, ".config", "cursor", leaf),
  ];
}

async function firstExistingPath(candidates) {
  for (const candidate of candidates) {
    try {
      await access(candidate);
      return candidate;
    } catch {
      // Try the next candidate.
    }
  }
  return null;
}

/**
 * Node >= 22.5 ships node:sqlite; older runtimes fall back to the sqlite3 CLI.
 * Returns null when neither the module nor the table is usable, so the caller
 * can try the next strategy.
 */
function createReader(dbPath) {
  let database = null;
  let sqliteModule = null;

  return {
    async query(sql) {
      if (sqliteModule === null) {
        try {
          sqliteModule = await import("node:sqlite");
        } catch {
          sqliteModule = false;
        }
      }

      if (sqliteModule && sqliteModule.DatabaseSync) {
        if (!database) database = new sqliteModule.DatabaseSync(dbPath, { readOnly: true });
        return database.prepare(sql).all();
      }

      // `immutable=1` reads without taking a lock, so a sync can run while
      // Cursor is open. A row mid-write may read stale; the next sync fixes it.
      const uri = "file:" + encodeURI(dbPath) + "?mode=ro&immutable=1";
      const { stdout } = await execFileAsync("sqlite3", ["-json", uri, sql], {
        encoding: "utf8",
        maxBuffer: 128 * 1024 * 1024,
      });
      const trimmed = stdout.trim();
      return trimmed ? JSON.parse(trimmed) : [];
    },
    close() {
      if (database) {
        database.close();
        database = null;
      }
    },
  };
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

function numeric(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : 0;
}

async function readConversations(reader) {
  try {
    const headers = await reader.query(HEADER_QUERY);
    let messagesByComposer = new Map();
    try {
      const counts = await reader.query(BUBBLE_COUNT_QUERY);
      messagesByComposer = new Map(counts.map((row) => [row.composerId, numeric(row.messages)]));
    } catch {
      // Message counts are optional; edits still work without them.
    }
    return {
      strategy: "composer-headers",
      rows: headers.map((row) => ({
        createdAt: row.createdAt,
        lastUpdatedAt: row.lastUpdatedAt,
        linesAdded: numeric(row.linesAdded),
        linesRemoved: numeric(row.linesRemoved),
        messages: messagesByComposer.get(row.composerId) ?? 0,
      })),
    };
  } catch {
    const rows = await reader.query(LEGACY_QUERY);
    return {
      strategy: "composer-data",
      rows: rows.map((row) => ({
        createdAt: row.createdAt,
        lastUpdatedAt: row.lastUpdatedAt,
        linesAdded: 0,
        linesRemoved: 0,
        messages: numeric(row.messages),
      })),
    };
  }
}

/**
 * Counts AI-written code events per day from Cursor's own tracking database.
 * Rows attributed to "human" are excluded — only AI output is counted, so the
 * number never overstates what the assistant actually contributed.
 */
async function scanCursorAiEdits({ homeDir, timeZone, dbPath, env }) {
  const resolvedPath =
    dbPath || (await firstExistingPath(defaultCursorTrackingDbPaths(homeDir)));
  if (!resolvedPath) return { days: new Map(), events: 0, dbPath: null, reason: "No Cursor ai-code-tracking.db found" };

  const reader = createReader(resolvedPath);
  let rows;
  try {
    rows = await reader.query(AI_TRACKING_QUERY);
  } catch (error) {
    return {
      days: new Map(),
      events: 0,
      dbPath: resolvedPath,
      reason: "Could not read Cursor tracking database: " + error.message,
    };
  } finally {
    reader.close();
  }

  const days = new Map();
  let events = 0;
  for (const row of rows) {
    if (String(row?.source || "").toLowerCase() === "human") continue;
    const timestamp = numeric(row?.timestamp);
    if (!timestamp) continue;
    const date = new Date(timestamp);
    if (Number.isNaN(date.getTime())) continue;

    const day = dateKeyInTimeZone(date, timeZone);
    days.set(day, (days.get(day) || 0) + 1);
    events += 1;
  }

  return { days, events, dbPath: resolvedPath, reason: null };
}

export async function scanCursorLogs({
  homeDir = os.homedir(),
  timeZone,
  metric = "aiEdits",
  dbPath = null,
  trackingDbPath = null,
  platform = process.platform,
  env = process.env,
} = {}) {
  const selectedMetric = CURSOR_METRICS.includes(metric) ? metric : "aiEdits";
  const empty = {
    provider: "cursor",
    metric: selectedMetric,
    source: "cursor-workspace-db",
    days: new Map(),
    conversations: 0,
    messages: 0,
    linesChanged: 0,
    aiEdits: 0,
    undatedConversations: 0,
    strategy: null,
    dbPath: null,
    available: false,
    reason: null,
  };

  if (selectedMetric === "aiEdits") {
    const tracking = await scanCursorAiEdits({
      homeDir,
      timeZone,
      dbPath: trackingDbPath,
      env,
    });
    return {
      ...empty,
      days: tracking.days,
      aiEdits: tracking.events,
      strategy: "ai-code-tracking",
      source: "cursor-ai-tracking",
      dbPath: tracking.dbPath,
      available: tracking.reason === null,
      reason: tracking.reason,
    };
  }

  const resolvedPath =
    dbPath || (await firstExistingPath(defaultCursorDbPaths(homeDir, platform, env)));
  if (!resolvedPath) return { ...empty, reason: "No Cursor state.vscdb found" };

  const reader = createReader(resolvedPath);
  let result;
  try {
    result = await readConversations(reader);
  } catch (error) {
    return {
      ...empty,
      dbPath: resolvedPath,
      reason: "Could not read Cursor database: " + error.message,
    };
  } finally {
    reader.close();
  }

  const days = new Map();
  let conversations = 0;
  let messages = 0;
  let linesChanged = 0;
  let undatedConversations = 0;

  for (const row of result.rows) {
    // lastUpdatedAt is the better anchor: it is when the work actually landed.
    const timestamp = numeric(row.lastUpdatedAt) || numeric(row.createdAt);
    const date = timestamp ? new Date(timestamp) : null;
    if (!date || Number.isNaN(date.getTime())) {
      undatedConversations += 1;
      continue;
    }

    conversations += 1;
    messages += row.messages;
    linesChanged += row.linesAdded + row.linesRemoved;

    const value =
      selectedMetric === "edits" ? row.linesAdded + row.linesRemoved : row.messages;
    if (value <= 0) continue;

    const day = dateKeyInTimeZone(date, timeZone);
    days.set(day, (days.get(day) || 0) + value);
  }

  return {
    ...empty,
    days,
    conversations,
    messages,
    linesChanged,
    undatedConversations,
    strategy: result.strategy,
    dbPath: resolvedPath,
    available: true,
  };
}

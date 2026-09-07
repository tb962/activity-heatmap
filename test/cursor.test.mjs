import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";

import { defaultCursorDbPaths, scanCursorLogs } from "../lib/cursor.mjs";

const execFileAsync = promisify(execFile);

/**
 * Cursor's database is SQLite, so the fixture has to be a real one. Build it
 * with whichever reader this runtime has; skip the suite when it has neither.
 */
async function createFixtureDb(dbPath) {
  const rows = [
    // composerId, createdAt, lastUpdatedAt, linesAdded, linesRemoved
    ["aaa", 1788782400000, 1788782400000, 40, 10],
    ["bbb", 1788696000000, 1788782400000, 5, 0],
    ["ccc", 1788696000000, null, 0, 0],
    ["ddd", null, null, 7, 7],
  ];
  const statements = [
    "create table composerHeaders (composerId TEXT PRIMARY KEY, createdAt INTEGER, lastUpdatedAt INTEGER, value TEXT);",
    "create table cursorDiskKV (key TEXT PRIMARY KEY, value BLOB);",
    ...rows.map(([id, created, updated, added, removed]) => {
      const value = JSON.stringify({ totalLinesAdded: added, totalLinesRemoved: removed });
      return (
        "insert into composerHeaders values (" +
        [
          "'" + id + "'",
          created === null ? "null" : created,
          updated === null ? "null" : updated,
          "'" + value + "'",
        ].join(",") +
        ");"
      );
    }),
    // aaa has 3 messages, bbb has 2, ccc has 1, ddd has none.
    "insert into cursorDiskKV values ('bubbleId:aaa:m1', '{}'), ('bubbleId:aaa:m2', '{}'), ('bubbleId:aaa:m3', '{}');",
    "insert into cursorDiskKV values ('bubbleId:bbb:m1', '{}'), ('bubbleId:bbb:m2', '{}');",
    "insert into cursorDiskKV values ('bubbleId:ccc:m1', '{}');",
  ].join("\n");

  try {
    const { DatabaseSync } = await import("node:sqlite");
    const database = new DatabaseSync(dbPath);
    database.exec(statements);
    database.close();
    return true;
  } catch {
    // Node < 22.5: fall back to the CLI, which is also the collector's fallback.
  }

  try {
    await execFileAsync("sqlite3", [dbPath, statements]);
    return true;
  } catch {
    return false;
  }
}

test("cursor collector reports messages and edited lines per day", async (t) => {
  const dir = await mkdtemp(path.join(tmpdir(), "activity-cursor-"));
  const dbPath = path.join(dir, "state.vscdb");

  if (!(await createFixtureDb(dbPath))) {
    await rm(dir, { recursive: true, force: true });
    return t.skip("no SQLite reader available (needs Node >= 22.5 or the sqlite3 CLI)");
  }

  const messages = await scanCursorLogs({ dbPath, timeZone: "UTC", metric: "messages" });
  assert.equal(messages.available, true);
  assert.equal(messages.metric, "messages");
  assert.equal(messages.strategy, "composer-headers");
  // aaa (3) and bbb (2) both land on lastUpdatedAt = 2026-09-07.
  assert.equal(messages.days.get("2026-09-07"), 5);
  // ccc has no lastUpdatedAt, so it falls back to createdAt.
  assert.equal(messages.days.get("2026-09-06"), 1);
  // ddd has neither timestamp and is counted as undated, not dropped silently.
  assert.equal(messages.undatedConversations, 1);
  assert.equal(messages.conversations, 3);

  const edits = await scanCursorLogs({ dbPath, timeZone: "UTC", metric: "edits" });
  assert.equal(edits.metric, "edits");
  // aaa contributes 40+10, bbb 5+0, both on the same day.
  assert.equal(edits.days.get("2026-09-07"), 55);
  // ccc changed no lines, so the day is absent rather than present-and-zero.
  assert.equal(edits.days.has("2026-09-06"), false);

  // An unknown metric must not silently chart the wrong unit.
  const fallback = await scanCursorLogs({ dbPath, timeZone: "UTC", metric: "bogus" });
  assert.equal(fallback.metric, "messages");

  await rm(dir, { recursive: true, force: true });
});

test("cursor collector reports a reason instead of throwing when absent", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "activity-cursor-missing-"));
  const result = await scanCursorLogs({ homeDir: dir, timeZone: "UTC" });
  assert.equal(result.available, false);
  assert.equal(result.days.size, 0);
  assert.match(result.reason, /No Cursor state\.vscdb/);
  await rm(dir, { recursive: true, force: true });
});

test("cursor database location is resolved per platform", () => {
  assert.match(defaultCursorDbPaths("/home/me", "darwin")[0], /Library\/Application Support\/Cursor/);
  assert.match(defaultCursorDbPaths("/home/me", "linux")[0], /\.config\/Cursor/);
  assert.match(
    defaultCursorDbPaths("/home/me", "win32", { APPDATA: "/appdata" })[0],
    /appdata.+Cursor/,
  );
});

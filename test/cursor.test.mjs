import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  defaultCursorDbPaths,
  defaultCursorTrackingDbPaths,
  scanCursorLogs,
} from "../lib/cursor.mjs";
import {
  writeCursorFixture,
  writeCursorTrackingFixture,
} from "../test-support/cursor-fixture.mjs";

test("cursor collector reports messages and edited lines per day", async (t) => {
  const dir = await mkdtemp(path.join(tmpdir(), "activity-cursor-"));
  const dbPath = path.join(dir, "state.vscdb");

  if (!(await writeCursorFixture(dbPath, [
    // [composerId, lastUpdatedAt, messages, linesAdded, linesRemoved]
    ["aaa", 1788782400000, 3, 40, 10],
    ["bbb", 1788782400000, 2, 5, 0],
    ["ccc", 1788696000000, 1, 0, 0],
  ]))) {
    await rm(dir, { recursive: true, force: true });
    return t.skip("no SQLite reader available (needs Node >= 22.5 or the sqlite3 CLI)");
  }

  const messages = await scanCursorLogs({ dbPath, timeZone: "UTC", metric: "messages" });
  assert.equal(messages.available, true);
  assert.equal(messages.metric, "messages");
  assert.equal(messages.strategy, "composer-headers");
  // aaa (3) and bbb (2) both land on lastUpdatedAt = 2026-09-07.
  assert.equal(messages.days.get("2026-09-07"), 5);
  assert.equal(messages.days.get("2026-09-06"), 1);
  assert.equal(messages.conversations, 3);

  const edits = await scanCursorLogs({ dbPath, timeZone: "UTC", metric: "edits" });
  assert.equal(edits.metric, "edits");
  // aaa contributes 40+10, bbb 5+0, both on the same day.
  assert.equal(edits.days.get("2026-09-07"), 55);
  // ccc changed no lines, so the day is absent rather than present-and-zero.
  assert.equal(edits.days.has("2026-09-06"), false);

  // An unknown metric must not silently chart the wrong unit.
  const fallback = await scanCursorLogs({ dbPath, timeZone: "UTC", metric: "bogus" });
  assert.equal(fallback.metric, "aiEdits");

  await rm(dir, { recursive: true, force: true });
});

test("cursor collector counts only AI-written code events", async (t) => {
  const dir = await mkdtemp(path.join(tmpdir(), "activity-cursor-tracking-"));
  const trackingDbPath = path.join(dir, "ai-code-tracking.db");

  const built = await writeCursorTrackingFixture(trackingDbPath, [
    [1788782400000, "composer", 7],
    [1788696000000, "composer", 3],
    // Hand-written code is tracked in the same table and must be excluded.
    [1788696000000, "human", 4],
  ]);
  if (!built) {
    await rm(dir, { recursive: true, force: true });
    return t.skip("no SQLite reader available");
  }

  const result = await scanCursorLogs({ trackingDbPath, timeZone: "UTC", metric: "aiEdits" });
  assert.equal(result.available, true);
  assert.equal(result.metric, "aiEdits");
  assert.equal(result.source, "cursor-ai-tracking");
  assert.equal(result.days.get("2026-09-07"), 7);
  assert.equal(result.days.get("2026-09-06"), 3, "human rows were counted as AI edits");
  assert.equal(result.aiEdits, 10);

  await rm(dir, { recursive: true, force: true });
});

test("cursor collector reports a reason instead of throwing when absent", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "activity-cursor-missing-"));

  const aiEdits = await scanCursorLogs({ homeDir: dir, timeZone: "UTC", metric: "aiEdits" });
  assert.equal(aiEdits.available, false);
  assert.equal(aiEdits.days.size, 0);
  assert.match(aiEdits.reason, /ai-code-tracking\.db/);

  const messages = await scanCursorLogs({ homeDir: dir, timeZone: "UTC", metric: "messages" });
  assert.equal(messages.available, false);
  assert.match(messages.reason, /No Cursor state\.vscdb/);

  await rm(dir, { recursive: true, force: true });
});

test("cursor database locations are resolved per platform", () => {
  assert.match(defaultCursorDbPaths("/home/me", "darwin")[0], /Library\/Application Support\/Cursor/);
  assert.match(defaultCursorDbPaths("/home/me", "linux")[0], /\.config\/Cursor/);
  assert.match(
    defaultCursorDbPaths("/home/me", "win32", { APPDATA: "/appdata" })[0],
    /appdata.+Cursor/,
  );
  // The tracking database sits in ~/.cursor on every platform.
  assert.match(defaultCursorTrackingDbPaths("/home/me")[0], /\.cursor\/ai-tracking\/ai-code-tracking\.db/);
});

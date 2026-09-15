import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { syncActivity } from "../lib/collector.mjs";
import { scanClaudeLogs, scanCodexLogs } from "../lib/local-ai.mjs";
import { defaultCursorDbPaths, defaultCursorTrackingDbPaths } from "../lib/cursor.mjs";
import {
  writeCursorFixture,
  writeCursorTrackingFixture,
} from "../test-support/cursor-fixture.mjs";

const fixtureHome = path.resolve("test/fixtures/home");

test("scans Claude Code and Codex token metadata without reading prompts", async () => {
  const claude = await scanClaudeLogs({ homeDir: fixtureHome, timeZone: "UTC" });
  const codex = await scanCodexLogs({ homeDir: fixtureHome, timeZone: "UTC" });

  assert.equal(claude.days.get("2026-09-06"), 135);
  assert.equal(codex.days.get("2026-09-07"), 1000);
  assert.equal(claude.source, "claude-code-logs");
  assert.equal(codex.source, "codex-session-logs");
});

test("sync combines local logs and GitHub into activity.v1", async () => {
  const cwd = await mkdtemp(path.join(tmpdir(), "activity-heatmap-test-"));
  const fetchImpl = async (url) => {
    if (url === "https://api.github.com/graphql") {
      return new Response(JSON.stringify({
        data: {
          user: {
            contributionsCollection: {
              contributionCalendar: {
                weeks: [{ contributionDays: [
                  { date: "2026-09-06", contributionCount: 3 },
                  { date: "2026-09-07", contributionCount: 4 },
                ] }],
              },
            },
          },
        },
      }), { status: 200 });
    }

    throw new Error("unexpected request to " + url);
  };

  await writeFile(path.join(cwd, "activity.config.json"), JSON.stringify({
    github: { username: "demo" },
    timezone: "UTC",
    rangeDays: 10,
    historyDays: 20,
    output: "data/activity.json",
    historyOutput: "data/history.json",
    sources: { github: true, claude: true, codex: true, cursor: false },
  }));

  const report = await syncActivity({
    cwd,
    homeDir: fixtureHome,
    env: { GITHUB_TOKEN: "test-token" },
    fetchImpl,
    now: new Date("2026-09-07T12:00:00.000Z"),
    logger: { warn() {} },
  });

  const data = JSON.parse(await readFile(path.join(cwd, "data/activity.json"), "utf8"));
  assert.equal(report.githubDays, 2);
  assert.equal(data.github.username, "demo");
  assert.equal(data.github.days.find((day) => day.date === "2026-09-07").contributions, 4);
  assert.equal(data.ai.days.find((day) => day.date === "2026-09-06").providers.claude, 135);
  assert.equal(data.ai.days.find((day) => day.date === "2026-09-07").providers.codex, 1000);
  assert.match(data.ai.coverage.claude.source, /claude-code-logs/);
  assert.match(data.ai.coverage.codex.source, /codex-session-logs/);

  await rm(cwd, { recursive: true, force: true });
});

test("cursor activity never leaks into a day's token total", async () => {
  const cwd = await mkdtemp(path.join(tmpdir(), "activity-heatmap-units-"));
  await writeFile(
    path.join(cwd, "activity.config.json"),
    JSON.stringify({
      timezone: "UTC",
      rangeDays: 10,
      historyDays: 20,
      output: "data/activity.json",
      historyOutput: "data/history.json",
      cursorFile: "cursor.json",
      sources: { github: false, claude: true, codex: true, cursor: true },
    }),
  );
  // A Cursor export standing in for the workspace database.
  await writeFile(
    path.join(cwd, "cursor.json"),
    JSON.stringify({ days: [{ date: "2026-09-07", tokens: 42 }] }),
  );

  await syncActivity({
    cwd,
    homeDir: fixtureHome,
    env: {},
    now: new Date("2026-09-07T12:00:00.000Z"),
    logger: { warn() {} },
  });

  const data = JSON.parse(await readFile(path.join(cwd, "data/activity.json"), "utf8"));
  const day = data.ai.days.find((entry) => entry.date === "2026-09-07");

  assert.equal(day.providers.cursor, 42);
  assert.equal(day.providers.codex, 1000);
  // totalTokens covers the token providers only, so Cursor's 42 is excluded.
  assert.equal(day.totalTokens, 1000);
  assert.equal(data.ai.metrics.cursor, "messages");
  assert.equal(data.ai.metrics.codex, "tokens");

  await rm(cwd, { recursive: true, force: true });
});

/**
 * Cursor's signals live in different units — AI edits, messages, edited lines
 * — and all of them land in providers.cursor. A series that mixes two of them
 * is meaningless, so switching metric must replace the stored values.
 */
test("a provider's series never mixes two units", async (t) => {
  const cwd = await mkdtemp(path.join(tmpdir(), "activity-heatmap-units-switch-"));
  const home = await mkdtemp(path.join(tmpdir(), "activity-heatmap-home-"));
  const conversationDb = defaultCursorDbPaths(home)[0];
  const trackingDb = defaultCursorTrackingDbPaths(home)[0];
  await mkdir(path.dirname(conversationDb), { recursive: true });
  await mkdir(path.dirname(trackingDb), { recursive: true });

  const built =
    (await writeCursorFixture(conversationDb, [["conv-1", 1788696000000, 4]])) &&
    (await writeCursorTrackingFixture(trackingDb, [
      [1788696000000, "composer", 9],
      // Human-written code must never be counted as AI activity.
      [1788696000000, "human", 5],
    ]));
  if (!built) {
    await rm(cwd, { recursive: true, force: true });
    await rm(home, { recursive: true, force: true });
    return t.skip("no SQLite reader available");
  }

  const writeConfig = (cursorMetric) =>
    writeFile(
      path.join(cwd, "activity.config.json"),
      JSON.stringify({
        timezone: "UTC",
        rangeDays: 10,
        historyDays: 20,
        output: "data/activity.json",
        historyOutput: "data/history.json",
        cursorMetric,
        sources: { github: false, claude: false, codex: false, cursor: true },
      }),
    );
  const options = {
    cwd,
    homeDir: home,
    env: {},
    now: new Date("2026-09-07T12:00:00.000Z"),
    logger: { warn() {} },
  };

  // Explicit aiEdits counts only the AI-written rows.
  await writeConfig("aiEdits");
  const aiEdits = await syncActivity(options);
  assert.equal(aiEdits.cursorMetric, "aiEdits");

  let data = JSON.parse(await readFile(path.join(cwd, "data/activity.json"), "utf8"));
  assert.equal(data.ai.metrics.cursor, "aiEdits");
  let day = data.ai.days.find((entry) => entry.date === "2026-09-06");
  assert.equal(day.providers.cursor, 9, "human-written rows leaked into the AI count");
  // Cursor is not a token provider, so it stays out of the total.
  assert.equal(day.totalTokens, 0);

  // Switching to messages must replace the AI-edit counts, not merge with them.
  await writeConfig("messages");
  const messages = await syncActivity(options);
  assert.equal(messages.cursorMetric, "messages");

  data = JSON.parse(await readFile(path.join(cwd, "data/activity.json"), "utf8"));
  assert.equal(data.ai.metrics.cursor, "messages");
  day = data.ai.days.find((entry) => entry.date === "2026-09-06");
  assert.equal(day.providers.cursor, 4, "stale AI-edit counts survived a unit change");

  // Going back to "auto" must keep the recorded metric rather than re-deciding
  // and wiping the series that has already been collected under it.
  await writeConfig("auto");
  const auto = await syncActivity(options);
  assert.equal(auto.cursorMetric, "messages");
  data = JSON.parse(await readFile(path.join(cwd, "data/activity.json"), "utf8"));
  assert.equal(data.ai.days.find((entry) => entry.date === "2026-09-06").providers.cursor, 4);

  await rm(cwd, { recursive: true, force: true });
  await rm(home, { recursive: true, force: true });
});

import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { syncActivity } from "../lib/collector.mjs";
import { scanClaudeLogs, scanCodexLogs } from "../lib/local-ai.mjs";
import { defaultCursorDbPaths } from "../lib/cursor.mjs";
import { writeCursorFixture } from "../test-support/cursor-fixture.mjs";

const fixtureHome = path.resolve("test/fixtures/home");

test("scans Claude Code and Codex token metadata without reading prompts", async () => {
  const claude = await scanClaudeLogs({ homeDir: fixtureHome, timeZone: "UTC" });
  const codex = await scanCodexLogs({ homeDir: fixtureHome, timeZone: "UTC" });

  assert.equal(claude.days.get("2026-09-06"), 135);
  assert.equal(codex.days.get("2026-09-07"), 1000);
  assert.equal(claude.source, "claude-code-logs");
  assert.equal(codex.source, "codex-session-logs");
});

test("sync combines local logs, OpenUsage, and GitHub into activity.v1", async () => {
  const cwd = await mkdtemp(path.join(tmpdir(), "activity-graph-test-"));
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

    return new Response(JSON.stringify({
      snapshots: [{
        providerId: "claude",
        fetchedAt: "2026-09-07T12:00:00.000Z",
        lines: [{ type: "barChart", points: [{ date: "2026-09-06", value: 135 }] }],
      }],
    }), { status: 200 });
  };

  await writeFile(path.join(cwd, "activity.config.json"), JSON.stringify({
    github: { username: "demo" },
    timezone: "UTC",
    rangeDays: 10,
    historyDays: 20,
    output: "data/activity.json",
    historyOutput: "data/history.json",
    sources: { github: true, claude: true, codex: true, cursor: false, openUsage: true },
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
  const cwd = await mkdtemp(path.join(tmpdir(), "activity-graph-units-"));
  await writeFile(
    path.join(cwd, "activity.config.json"),
    JSON.stringify({
      timezone: "UTC",
      rangeDays: 10,
      historyDays: 20,
      output: "data/activity.json",
      historyOutput: "data/history.json",
      cursorFile: "cursor.json",
      sources: { github: false, claude: true, codex: true, cursor: true, openUsage: false },
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
 * OpenUsage reads Cursor's cloud usage API and reports tokens; Cursor's local
 * database only has message counts. Both land in providers.cursor, so a sync
 * that mixes them produces a series carrying two units at once.
 */
test("a provider's series never mixes two units", async (t) => {
  const cwd = await mkdtemp(path.join(tmpdir(), "activity-graph-units-switch-"));
  const home = await mkdtemp(path.join(tmpdir(), "activity-graph-home-"));
  const dbPath = defaultCursorDbPaths(home)[0];
  await mkdir(path.dirname(dbPath), { recursive: true });

  if (!(await writeCursorFixture(dbPath, [["conv-1", 1788696000000, 4]]))) {
    await rm(cwd, { recursive: true, force: true });
    await rm(home, { recursive: true, force: true });
    return t.skip("no SQLite reader available");
  }

  await writeFile(
    path.join(cwd, "activity.config.json"),
    JSON.stringify({
      timezone: "UTC",
      rangeDays: 10,
      historyDays: 20,
      output: "data/activity.json",
      historyOutput: "data/history.json",
      cursorMetric: "auto",
      sources: { github: false, claude: false, codex: false, cursor: true, openUsage: true },
    }),
  );

  const options = {
    cwd,
    homeDir: home,
    env: {},
    now: new Date("2026-09-07T12:00:00.000Z"),
    logger: { warn() {} },
  };
  const openUsageUp = async () =>
    new Response(
      JSON.stringify({
        snapshots: [
          {
            providerId: "cursor",
            fetchedAt: "2026-09-07T12:00:00.000Z",
            lines: [{ type: "barChart", points: [{ date: "2026-09-06", value: 22_000_000 }] }],
          },
        ],
      }),
      { status: 200 },
    );

  // OpenUsage wins while it is up: tokens, and the local message count for the
  // very same day must not be merged in alongside it.
  const withTokens = await syncActivity({ ...options, fetchImpl: openUsageUp });
  assert.equal(withTokens.cursorMetric, "tokens");

  let data = JSON.parse(await readFile(path.join(cwd, "data/activity.json"), "utf8"));
  assert.equal(data.ai.metrics.cursor, "tokens");
  let day = data.ai.days.find((entry) => entry.date === "2026-09-06");
  assert.equal(day.providers.cursor, 22_000_000);
  // Cursor reports tokens here, so it counts toward the day's total.
  assert.equal(day.totalTokens, 22_000_000);

  // OpenUsage goes away and the local database takes over with messages. The
  // token values recorded under providers.cursor are in the wrong unit now and
  // must be replaced, not merged with.
  const openUsageDown = async () => {
    throw new Error("connection refused");
  };
  const withMessages = await syncActivity({ ...options, fetchImpl: openUsageDown });
  assert.equal(withMessages.cursorMetric, "messages");

  data = JSON.parse(await readFile(path.join(cwd, "data/activity.json"), "utf8"));
  assert.equal(data.ai.metrics.cursor, "messages");
  day = data.ai.days.find((entry) => entry.date === "2026-09-06");
  assert.equal(day.providers.cursor, 4, "stale Cursor tokens survived a unit change");
  // And Cursor drops back out of the token total.
  assert.equal(day.totalTokens, 0);

  await rm(cwd, { recursive: true, force: true });
  await rm(home, { recursive: true, force: true });
});

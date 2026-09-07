import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { syncActivity } from "../lib/collector.mjs";
import { scanClaudeLogs, scanCodexLogs } from "../lib/local-ai.mjs";

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

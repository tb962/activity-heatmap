#!/usr/bin/env node

import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  inspectEnvironment,
  syncActivity,
} from "../lib/collector.mjs";
import { installLaunchAgent, uninstallLaunchAgent } from "../lib/schedule.mjs";

const PACKAGE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function parseArgs(values) {
  const flags = {};
  const positional = [];
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (!value.startsWith("--")) {
      positional.push(value);
      continue;
    }
    const [rawKey, inlineValue] = value.slice(2).split("=", 2);
    if (inlineValue !== undefined) {
      flags[rawKey] = inlineValue;
    } else if (values[index + 1] && !values[index + 1].startsWith("--")) {
      flags[rawKey] = values[index + 1];
      index += 1;
    } else {
      flags[rawKey] = true;
    }
  }
  return { command: positional[0] || "help", flags };
}

async function exists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

function cwdFrom(flags) {
  return path.resolve(String(flags.cwd || process.cwd()));
}

function homeFrom(flags) {
  return flags.home ? path.resolve(String(flags.home)) : os.homedir();
}

async function initProject(flags) {
  const cwd = cwdFrom(flags);
  const configPath = path.join(cwd, "activity.config.json");
  if (await exists(configPath) && !flags.force) {
    throw new Error("activity.config.json already exists; pass --force to replace it");
  }

  const config = {
    github: { username: String(flags.username || "") },
    timezone: "auto",
    rangeDays: 365,
    historyDays: 730,
    output: "data/activity.json",
    historyOutput: "data/ai-activity-history.json",
    openUsageUrl: "http://127.0.0.1:6736/v1/usage",
    sources: {
      github: true,
      codex: true,
      claude: true,
      cursor: false,
      openUsage: true,
    },
  };
  await mkdir(path.join(cwd, "data"), { recursive: true });
  await writeFile(configPath, JSON.stringify(config, null, 2) + "\n", "utf8");
  console.log("Created " + configPath);
  console.log("Next: set github.username, then run activity-graph sync");
}

async function doctor(flags) {
  const report = await inspectEnvironment({ cwd: cwdFrom(flags), homeDir: homeFrom(flags) });
  if (flags.json) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }
  console.log("activity-graph doctor");
  console.log("  config: " + report.configPath);
  console.log("  GitHub username: " + (report.username || "not configured"));
  console.log("  GitHub auth: " + (report.githubToken || "not found"));
  console.log("  timezone: " + report.timezone);
  console.log("  Claude logs: " + (report.sources.claudeLogs ? "found" : "not found"));
  console.log("  Codex logs: " + (report.sources.codexLogs ? "found" : "not found"));
  console.log("  OpenUsage: " + report.sources.openUsageUrl);
  console.log("  Cursor export: " + (report.sources.cursorFile ? "found" : "not configured"));
  console.log("  output: " + report.outputPath);
}

async function sync(flags) {
  const report = await syncActivity({ cwd: cwdFrom(flags), homeDir: homeFrom(flags) });
  console.log(
    "Activity data ready: " +
      report.githubDays +
      " GitHub days, " +
      report.aiDays +
      " AI days, range " +
      report.range.from +
      " to " +
      report.range.to,
  );
  Object.entries(report.scans).forEach(([provider, scan]) => {
    console.log("  " + provider + ": " + scan.days.size + " active days from " + scan.files + " log files");
  });
  console.log("  wrote " + report.outputPath);
  if (report.warnings.length > 0) {
    console.log("  warnings: " + report.warnings.length + " (see messages above)");
  }
}

function printHelp() {
  console.log(`activity-graph — local activity data for a portfolio heatmap

Commands:
  activity-graph init [--username you] [--cwd path]
  activity-graph doctor [--cwd path] [--home path] [--json]
  activity-graph sync [--cwd path] [--home path]
  activity-graph schedule [--cwd path]
  activity-graph unschedule

Environment overrides:
  GITHUB_USERNAME, GITHUB_TOKEN, ACTIVITY_TIMEZONE,
  ACTIVITY_RANGE_DAYS, AI_HISTORY_RETENTION_DAYS, OPENUSAGE_URL

The sync reads aggregate token metadata only. It never writes prompts or raw logs.
`);
}

async function main() {
  const { command, flags } = parseArgs(process.argv.slice(2));
  if (command === "help" || flags.help) return printHelp();
  if (command === "init") return initProject(flags);
  if (command === "doctor") return doctor(flags);
  if (command === "sync") return sync(flags);
  if (command === "schedule") {
    const result = await installLaunchAgent({
      cwd: cwdFrom(flags),
      cliPath: path.resolve(process.argv[1] || path.join(PACKAGE_ROOT, "bin/activity-graph.mjs")),
    });
    console.log("Installed " + result.label + " at " + result.plistPath);
    return;
  }
  if (command === "unschedule") {
    const result = await uninstallLaunchAgent({ homeDir: os.homedir() });
    console.log("Removed " + result.label + " at " + result.plistPath);
    return;
  }
  throw new Error("Unknown command: " + command);
}

main().catch((error) => {
  console.error("activity-graph: " + error.message);
  process.exitCode = 1;
});

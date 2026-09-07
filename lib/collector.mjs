import { access, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { fetchGitHubActivity, resolveGitHubToken } from "./github.mjs";
import {
  addDays,
  createEmptyProviderMaps,
  dateKey,
  dateKeyInZone,
  parseDateKey,
  PROVIDERS,
  scanClaudeLogs,
  scanCodexLogs,
} from "./local-ai.mjs";
import { coverageFromProviderDays, fetchOpenUsage } from "./openusage.mjs";

const DEFAULT_CONFIG = {
  github: { username: "" },
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

function numericValue(value) {
  const normalized = typeof value === "string" ? value.replaceAll(",", "").trim() : value;
  const number = Number(normalized);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

function isDateKey(value) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function isInRange(value, range) {
  return value >= range.from && value <= range.to;
}

function mergeSources(...values) {
  return Array.from(
    new Set(
      values
        .flatMap((value) => (typeof value === "string" ? value.split(" + ") : []))
        .map((value) => value.trim())
        .filter(Boolean),
    ),
  ).join(" + ");
}

function normalizeCoverage(coverage) {
  const normalized = {};
  PROVIDERS.forEach((provider) => {
    const candidate = coverage?.[provider];
    if (!isDateKey(candidate?.from) || !isDateKey(candidate?.to) || candidate.from > candidate.to) return;
    normalized[provider] = {
      from: candidate.from,
      to: candidate.to,
      source: candidate.source || "local activity source",
      complete: candidate.complete === true,
    };
  });
  return normalized;
}

function inferCoverage(days, source = "activity dataset") {
  const bounds = Object.fromEntries(PROVIDERS.map((provider) => [provider, { from: null, to: null }]));
  (Array.isArray(days) ? days : []).forEach((day) => {
    if (!isDateKey(day?.date)) return;
    PROVIDERS.forEach((provider) => {
      if (!Object.prototype.hasOwnProperty.call(day?.providers || {}, provider)) return;
      const bound = bounds[provider];
      bound.from = bound.from ? (day.date < bound.from ? day.date : bound.from) : day.date;
      bound.to = bound.to ? (day.date > bound.to ? day.date : bound.to) : day.date;
    });
  });
  return Object.fromEntries(
    PROVIDERS.filter((provider) => bounds[provider].from && bounds[provider].to).map((provider) => [
      provider,
      { from: bounds[provider].from, to: bounds[provider].to, source, complete: false },
    ]),
  );
}

function mergeCoverage(existing, next) {
  if (!existing) return next;
  return {
    from: existing.from < next.from ? existing.from : next.from,
    to: existing.to > next.to ? existing.to : next.to,
    source: mergeSources(existing.source, next.source),
    complete: existing.complete === true && next.complete === true,
  };
}

function normalizeAiDay(day) {
  if (!isDateKey(day?.date)) return null;
  const providers = {};
  PROVIDERS.forEach((provider) => {
    const value = numericValue(day?.providers?.[provider]);
    if (value !== null) providers[provider] = value;
  });
  const storedTotal = numericValue(day?.totalTokens) || 0;
  const providerTotal = Object.values(providers).reduce((sum, value) => sum + value, 0);
  const totalTokens = Math.max(storedTotal, providerTotal);
  return totalTokens > 0 ? { date: day.date, totalTokens, providers } : null;
}

function mergeAiDay(target, source) {
  const providers = { ...(target?.providers || {}) };
  PROVIDERS.forEach((provider) => {
    const sourceValue = numericValue(source?.providers?.[provider]);
    if (sourceValue === null) return;
    const targetValue = numericValue(providers[provider]);
    providers[provider] = targetValue === null ? sourceValue : Math.max(targetValue, sourceValue);
  });
  const providerTotal = Object.values(providers).reduce((sum, value) => sum + value, 0);
  return {
    date: source?.date || target?.date,
    totalTokens: Math.max(numericValue(target?.totalTokens) || 0, numericValue(source?.totalTokens) || 0, providerTotal),
    providers,
  };
}

function normalizeAiDays(days) {
  const daysByDate = new Map();
  (Array.isArray(days) ? days : []).forEach((day) => {
    const normalized = normalizeAiDay(day);
    if (!normalized) return;
    const existing = daysByDate.get(normalized.date);
    daysByDate.set(normalized.date, existing ? mergeAiDay(existing, normalized) : normalized);
  });
  return Array.from(daysByDate.values()).sort((left, right) => left.date.localeCompare(right.date));
}

function resolveTimeZone(value) {
  if (value && value !== "auto") return value;
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
}

function resolveConfig(cwd, rawConfig = {}, env = process.env) {
  const merged = {
    ...DEFAULT_CONFIG,
    ...rawConfig,
    github: { ...DEFAULT_CONFIG.github, ...(rawConfig.github || {}) },
    sources: { ...DEFAULT_CONFIG.sources, ...(rawConfig.sources || {}) },
  };
  const timeZone = resolveTimeZone(env.ACTIVITY_TIMEZONE || merged.timezone);
  const rangeDays = Math.max(1, Number(env.ACTIVITY_RANGE_DAYS || merged.rangeDays) || 365);
  const historyDays = Math.max(1, Number(env.AI_HISTORY_RETENTION_DAYS || merged.historyDays) || 730);
  const username = env.GITHUB_USERNAME || merged.github.username || "";

  return {
    ...merged,
    github: { ...merged.github, username },
    timezone: timeZone,
    rangeDays,
    historyDays,
    openUsageUrl: env.OPENUSAGE_URL || merged.openUsageUrl,
    outputPath: path.resolve(cwd, merged.output || DEFAULT_CONFIG.output),
    historyOutputPath: path.resolve(cwd, merged.historyOutput || DEFAULT_CONFIG.historyOutput),
    cursorFilePath: merged.cursorFile ? path.resolve(cwd, merged.cursorFile) : null,
  };
}

export async function loadConfig(cwd) {
  const configPath = path.join(cwd, "activity.config.json");
  try {
    return JSON.parse(await readFile(configPath, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") return {};
    throw new Error("Could not parse activity.config.json: " + error.message);
  }
}

export function getRange(timeZone, rangeDays, now = new Date()) {
  const to = dateKeyInZone(now, timeZone);
  return {
    from: dateKey(addDays(parseDateKey(to), -(rangeDays - 1))),
    to,
  };
}

async function readJsonIfPresent(filePath) {
  try {
    return JSON.parse(await readFile(filePath, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw new Error("Could not parse " + filePath + ": " + error.message);
  }
}

async function writeJsonAtomically(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  const temporaryPath = filePath + ".tmp-" + process.pid;
  await writeFile(temporaryPath, JSON.stringify(value, null, 2) + "\n", "utf8");
  await rename(temporaryPath, filePath);
}

function createEmptyData(config, range) {
  return {
    schema: "activity.v1",
    generatedAt: "",
    timezone: config.timezone,
    range,
    github: {
      username: config.github.username,
      days: [],
      source: "pending",
      href: config.github.username ? "https://github.com/" + config.github.username : undefined,
    },
    ai: {
      metric: "tokens",
      available: false,
      days: [],
      sources: {},
      coverage: {},
    },
  };
}

function createEmptyHistory(config) {
  return {
    schema: "ai-activity-history.v1",
    metric: "tokens",
    timezone: config.timezone,
    retentionDays: config.historyDays,
    updatedAt: "",
    days: [],
    coverage: {},
  };
}

function addProviderDays(daysByDate, providerDays, provider) {
  providerDays.forEach((value, date) => {
    const existing = daysByDate.get(date) || { date, totalTokens: 0, providers: {} };
    daysByDate.set(date, mergeAiDay(existing, {
      date,
      totalTokens: value,
      providers: { [provider]: value },
    }));
  });
}

async function readCursorDays(filePath, range) {
  if (!filePath) return new Map();
  const body = await readJsonIfPresent(filePath);
  const days = new Map();
  (Array.isArray(body?.days) ? body.days : []).forEach((day) => {
    const date = day?.date;
    const value = numericValue(day?.tokens ?? day?.totalTokens ?? day?.providers?.cursor);
    if (isDateKey(date) && value !== null && value > 0 && isInRange(date, range)) {
      days.set(date, Math.max(days.get(date) || 0, value));
    }
  });
  return days;
}

export async function syncActivity({
  cwd = process.cwd(),
  homeDir = os.homedir(),
  env = process.env,
  fetchImpl = fetch,
  now = new Date(),
  logger = console,
} = {}) {
  const rawConfig = await loadConfig(cwd);
  const config = resolveConfig(cwd, rawConfig, env);
  const range = getRange(config.timezone, config.rangeDays, now);
  const existingData = (await readJsonIfPresent(config.outputPath)) || createEmptyData(config, range);
  const existingHistory = (await readJsonIfPresent(config.historyOutputPath)) || createEmptyHistory(config);

  let github = {
    username: config.github.username,
    days: Array.isArray(existingData?.github?.days) ? existingData.github.days : [],
    source: existingData?.github?.source || "pending",
    href: config.github.username ? "https://github.com/" + config.github.username : undefined,
  };
  const warnings = [];

  if (config.sources.github && config.github.username) {
    try {
      const auth = await resolveGitHubToken(env);
      if (!auth) throw new Error("No GitHub token; set GITHUB_TOKEN or run gh auth login");
      github = {
        username: config.github.username,
        days: await fetchGitHubActivity({
          username: config.github.username,
          range,
          token: auth.token,
          fetchImpl,
        }),
        source: "github-graphql (" + auth.source + ")",
        href: "https://github.com/" + config.github.username,
      };
    } catch (error) {
      const message = "GitHub skipped: " + error.message;
      warnings.push(message);
      logger.warn(message);
    }
  } else if (config.sources.github && !config.github.username) {
    const message = "GitHub skipped: add github.username to activity.config.json";
    warnings.push(message);
    logger.warn(message);
  }

  const historyDaysByDate = new Map();
  normalizeAiDays(existingHistory.days || existingData?.ai?.days).forEach((day) => {
    historyDaysByDate.set(day.date, day);
  });
  let coverage = {
    ...inferCoverage(existingData?.ai?.days),
    ...normalizeCoverage(existingHistory.coverage),
  };
  const sources = { ...(existingData?.ai?.sources || {}) };
  const scans = {};

  if (config.sources.claude) {
    scans.claude = await scanClaudeLogs({ homeDir, timeZone: config.timezone });
    addProviderDays(historyDaysByDate, scans.claude.days, "claude");
    const dates = Array.from(scans.claude.days.keys()).sort();
    if (dates.length > 0) {
      coverage.claude = mergeCoverage(coverage.claude, {
        from: dates[0], to: dates.at(-1), source: scans.claude.source, complete: true,
      });
      sources.claude = scans.claude.source;
    }
  }

  if (config.sources.codex) {
    scans.codex = await scanCodexLogs({ homeDir, timeZone: config.timezone });
    addProviderDays(historyDaysByDate, scans.codex.days, "codex");
    const dates = Array.from(scans.codex.days.keys()).sort();
    if (dates.length > 0) {
      coverage.codex = mergeCoverage(coverage.codex, {
        from: dates[0], to: dates.at(-1), source: scans.codex.source, complete: true,
      });
      sources.codex = scans.codex.source;
    }
  }

  if (config.sources.cursor && config.cursorFilePath) {
    const cursorDays = await readCursorDays(config.cursorFilePath, range);
    addProviderDays(historyDaysByDate, cursorDays, "cursor");
    const dates = Array.from(cursorDays.keys()).sort();
    if (dates.length > 0) {
      coverage.cursor = mergeCoverage(coverage.cursor, {
        from: dates[0], to: dates.at(-1), source: "cursor export", complete: false,
      });
      sources.cursor = "cursor export";
    }
  }

  if (config.sources.openUsage) {
    try {
      const providerDays = await fetchOpenUsage({
        url: config.openUsageUrl,
        timeZone: config.timezone,
        range,
        fetchImpl,
      });
      const openUsageCoverage = coverageFromProviderDays(providerDays, "openusage-local");
      PROVIDERS.forEach((provider) => {
        addProviderDays(historyDaysByDate, providerDays[provider], provider);
        if (openUsageCoverage[provider]) {
          coverage[provider] = mergeCoverage(coverage[provider], openUsageCoverage[provider]);
          sources[provider] = "openusage-local";
        }
      });
    } catch (error) {
      const message = "OpenUsage unavailable (continuing with local logs): " + error.message;
      warnings.push(message);
      logger.warn(message);
    }
  }

  const historyRange = {
    from: dateKey(addDays(parseDateKey(range.to), -(config.historyDays - 1))),
    to: range.to,
  };
  const nextHistoryDays = Array.from(historyDaysByDate.values())
    .filter((day) => day.totalTokens > 0 && isInRange(day.date, historyRange))
    .sort((left, right) => left.date.localeCompare(right.date));
  const nextHistory = {
    schema: "ai-activity-history.v1",
    metric: "tokens",
    timezone: config.timezone,
    retentionDays: config.historyDays,
    updatedAt: new Date().toISOString(),
    days: nextHistoryDays,
    coverage,
  };
  const publishedDays = nextHistoryDays.filter((day) => isInRange(day.date, range));
  const nextData = {
    schema: "activity.v1",
    generatedAt: new Date().toISOString(),
    timezone: config.timezone,
    range,
    github,
    ai: {
      metric: "tokens",
      available: publishedDays.length > 0,
      days: publishedDays,
      sources,
      coverage,
    },
  };

  await writeJsonAtomically(config.historyOutputPath, nextHistory);
  await writeJsonAtomically(config.outputPath, nextData);

  return {
    config,
    outputPath: config.outputPath,
    historyOutputPath: config.historyOutputPath,
    range,
    githubDays: github.days.length,
    aiDays: publishedDays.length,
    retainedAiDays: nextHistoryDays.length,
    scans,
    warnings,
  };
}

export async function inspectEnvironment({ cwd = process.cwd(), homeDir = os.homedir(), env = process.env } = {}) {
  const rawConfig = await loadConfig(cwd);
  const config = resolveConfig(cwd, rawConfig, env);
  const token = await resolveGitHubToken(env);
  const exists = async (target) => {
    try {
      await access(target);
      return true;
    } catch {
      return false;
    }
  };

  return {
    configPath: path.join(cwd, "activity.config.json"),
    username: config.github.username || null,
    timezone: config.timezone,
    githubToken: token?.source || null,
    sources: {
      claudeLogs: await exists(path.join(homeDir, ".claude", "projects")),
      codexLogs: await exists(path.join(homeDir, ".codex", "sessions")),
      openUsageUrl: config.openUsageUrl,
      cursorFile: config.cursorFilePath ? await exists(config.cursorFilePath) : false,
    },
    outputPath: config.outputPath,
  };
}

export { DEFAULT_CONFIG, resolveConfig };

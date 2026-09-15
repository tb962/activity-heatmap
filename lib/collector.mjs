import { access, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { fetchGitHubActivity, resolveGitHubToken } from "./github.mjs";
import {
  addDays,
  dateKey,
  dateKeyInZone,
  parseDateKey,
  PROVIDERS,
  scanClaudeLogs,
  scanCodexLogs,
} from "./local-ai.mjs";
import {
  CURSOR_METRICS,
  defaultCursorDbPaths,
  defaultCursorTrackingDbPaths,
  scanCursorLogs,
} from "./cursor.mjs";

const DEFAULT_CONFIG = {
  github: { username: "" },
  timezone: "auto",
  rangeDays: 365,
  historyDays: 730,
  output: "data/activity.json",
  historyOutput: "data/ai-activity-history.json",
  cursorMetric: "auto",
  sources: {
    github: true,
    codex: true,
    claude: true,
    cursor: true,
  },
};

/**
 * Claude and Codex record token usage; Cursor does not persist usable token
 * counts locally, so it reports messages or edited lines instead. Each
 * provider therefore declares its own unit.
 */
const TOKEN_METRIC = "tokens";

/**
 * How Cursor may be measured. Cursor does not record token counts on disk —
 * they exist only in its cloud account — so every option here is a local,
 * credential-free signal in its own unit. "auto" prefers the most accurate
 * one the machine actually has.
 */
const CURSOR_METRIC_SETTINGS = ["auto", ...CURSOR_METRICS];

/** Claude and Codex always report tokens; Cursor depends on its source. */
const DEFAULT_TOKEN_PROVIDERS = ["claude", "codex"];

function tokenProvidersFor(metrics) {
  return PROVIDERS.filter((provider) => (metrics?.[provider] ?? TOKEN_METRIC) === TOKEN_METRIC);
}

function sumTokenProviders(providers, tokenProviders = DEFAULT_TOKEN_PROVIDERS) {
  return tokenProviders.reduce((sum, provider) => sum + (numericValue(providers?.[provider]) || 0), 0);
}

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
  const providerTotal = sumTokenProviders(providers);
  const totalTokens = Math.max(storedTotal, providerTotal);
  const hasActivity = totalTokens > 0 || Object.values(providers).some((value) => value > 0);
  return hasActivity ? { date: day.date, totalTokens, providers } : null;
}

function mergeAiDay(target, source) {
  const providers = { ...(target?.providers || {}) };
  PROVIDERS.forEach((provider) => {
    const sourceValue = numericValue(source?.providers?.[provider]);
    if (sourceValue === null) return;
    const targetValue = numericValue(providers[provider]);
    providers[provider] = targetValue === null ? sourceValue : Math.max(targetValue, sourceValue);
  });
  const providerTotal = sumTokenProviders(providers);
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
    cursorMetric: CURSOR_METRIC_SETTINGS.includes(env.ACTIVITY_CURSOR_METRIC || merged.cursorMetric)
      ? env.ACTIVITY_CURSOR_METRIC || merged.cursorMetric
      : DEFAULT_CONFIG.cursorMetric,
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
      metric: TOKEN_METRIC,
      metrics: {},
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
    metric: TOKEN_METRIC,
    metrics: {},
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
      // Totals are recomputed once every provider's unit is known.
      totalTokens: 0,
      providers: { [provider]: value },
    }));
  });
}

/**
 * A provider's series must hold exactly one unit. When its unit changes — a
 * Cursor series switching from message counts to AI-edit counts, say — the
 * values already stored are in the old unit and cannot be merged with the new
 * ones, so they are dropped.
 */
/**
 * Records a provider's days under a declared unit, discarding anything already
 * stored in a different unit first.
 */
function setProviderDays(daysByDate, metrics, provider, providerDays, metric) {
  if (!providerDays || providerDays.size === 0) return;
  if (metrics[provider] && metrics[provider] !== metric) {
    dropProviderValues(daysByDate, provider);
  }
  metrics[provider] = metric;
  addProviderDays(daysByDate, providerDays, provider);
}

function dropProviderValues(daysByDate, provider) {
  daysByDate.forEach((day) => {
    if (day?.providers) delete day.providers[provider];
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

/**
 * Resolves what "auto" means for Cursor.
 *
 * Messages come first because the conversation database goes back months,
 * while Cursor prunes ai-code-tracking to a rolling window of about two
 * weeks. Both are day-accurate enough for a daily heatmap — exact per-edit
 * timestamps only change the picture for a thread spanning midnight — so
 * coverage is the deciding factor. Set cursorMetric to "aiEdits" to count
 * AI-written code instead of conversation volume.
 *
 * Once a metric has been recorded it is kept, even under "auto". Switching
 * unit discards the values stored in the old one, so an automatic flip would
 * silently destroy history; only an explicit config change may do that.
 */
async function resolveCursorScan({ homeDir, timeZone, metric, currentMetric }) {
  const requested =
    metric === "auto" && CURSOR_METRICS.includes(currentMetric) ? currentMetric : metric;

  if (requested !== "auto") {
    return scanCursorLogs({ homeDir, timeZone, metric: requested });
  }

  const messages = await scanCursorLogs({ homeDir, timeZone, metric: "messages" });
  if (messages.available && messages.days.size > 0) return messages;

  const aiEdits = await scanCursorLogs({ homeDir, timeZone, metric: "aiEdits" });
  if (aiEdits.available && aiEdits.days.size > 0) return aiEdits;

  // Nothing usable; report whichever failure is more informative.
  return messages.available ? aiEdits : messages;
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
  const metrics = { ...(existingHistory?.metrics || existingData?.ai?.metrics || {}) };
  const scans = {};

  if (config.sources.claude) {
    scans.claude = await scanClaudeLogs({ homeDir, timeZone: config.timezone });
    setProviderDays(historyDaysByDate, metrics, "claude", scans.claude.days, TOKEN_METRIC);
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
    setProviderDays(historyDaysByDate, metrics, "codex", scans.codex.days, TOKEN_METRIC);
    const dates = Array.from(scans.codex.days.keys()).sort();
    if (dates.length > 0) {
      coverage.codex = mergeCoverage(coverage.codex, {
        from: dates[0], to: dates.at(-1), source: scans.codex.source, complete: true,
      });
      sources.codex = scans.codex.source;
    }
  }

  if (config.sources.cursor) {
    if (config.cursorFilePath) {
      // An explicit export wins over the automatic sources.
      const cursorDays = await readCursorDays(config.cursorFilePath, range);
      const metric = config.cursorMetric === "auto" ? "messages" : config.cursorMetric;
      scans.cursor = { provider: "cursor", source: "cursor export", days: cursorDays, metric };
      setProviderDays(historyDaysByDate, metrics, "cursor", cursorDays, metric);
      const dates = Array.from(cursorDays.keys()).sort();
      if (dates.length > 0) {
        coverage.cursor = mergeCoverage(coverage.cursor, {
          from: dates[0], to: dates.at(-1), source: "cursor export", complete: false,
        });
        sources.cursor = "cursor export";
      }
    } else {
      const cursor = await resolveCursorScan({
        homeDir,
        timeZone: config.timezone,
        metric: config.cursorMetric,
        currentMetric: metrics.cursor,
      });
      scans.cursor = cursor;
      if (!cursor.available) {
        const message = "Cursor skipped: " + cursor.reason;
        warnings.push(message);
        logger.warn(message);
      } else {
        setProviderDays(historyDaysByDate, metrics, "cursor", cursor.days, cursor.metric);
        const dates = Array.from(cursor.days.keys()).sort();
        if (dates.length > 0) {
          coverage.cursor = mergeCoverage(coverage.cursor, {
            from: dates[0], to: dates.at(-1), source: cursor.source, complete: true,
          });
          sources.cursor = cursor.source;
        }
      }
    }
  }

  const historyRange = {
    from: dateKey(addDays(parseDateKey(range.to), -(config.historyDays - 1))),
    to: range.to,
  };
  // Every provider's unit is settled now, so totals can be recomputed from
  // scratch. Rebuilding beats patching: a provider that switched units leaves
  // a stale total behind, and Math.max merging would keep the larger wrong one.
  const tokenProviders = tokenProvidersFor(metrics);
  const nextHistoryDays = Array.from(historyDaysByDate.values())
    .map((day) => ({ ...day, totalTokens: sumTokenProviders(day.providers, tokenProviders) }))
    .filter(
      (day) =>
        (day.totalTokens > 0 || Object.values(day.providers || {}).some((value) => value > 0)) &&
        isInRange(day.date, historyRange),
    )
    .sort((left, right) => left.date.localeCompare(right.date));
  const nextHistory = {
    schema: "ai-activity-history.v1",
    metric: "tokens",
    timezone: config.timezone,
    retentionDays: config.historyDays,
    updatedAt: new Date().toISOString(),
    days: nextHistoryDays,
    metrics,
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
      metric: TOKEN_METRIC,
      metrics,
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
    // The metric actually used, which "auto" resolves at sync time.
    cursorMetric: metrics.cursor ?? null,
    githubDays: github.days.length,
    aiDays: publishedDays.length,
    retainedAiDays: nextHistoryDays.length,
    scans,
    warnings,
  };
}

async function firstExisting(candidates) {
  for (const candidate of candidates) {
    try {
      await access(candidate);
      return candidate;
    } catch {
      // Try the next platform location.
    }
  }
  return null;
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
    cursorMetric: config.cursorMetric,
    sources: {
      claudeLogs: await exists(path.join(homeDir, ".claude", "projects")),
      codexLogs: await exists(path.join(homeDir, ".codex", "sessions")),
      cursorDb: await firstExisting(defaultCursorDbPaths(homeDir)),
      cursorTrackingDb: await firstExisting(defaultCursorTrackingDbPaths(homeDir)),
      cursorFile: config.cursorFilePath ? await exists(config.cursorFilePath) : false,
    },
    outputPath: config.outputPath,
  };
}

export { DEFAULT_CONFIG, resolveConfig };

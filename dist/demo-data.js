import { addDays, dateKey, getCalendarRange, parseDateKey } from "./activity.js";
/** Stable sample content keeps SSR and hydration identical until real data is supplied. */
export function createDemoActivityData({ weeks = 20, to = "2026-09-07", username = "your-handle", } = {}) {
    const range = getCalendarRange(to, weeks);
    const start = parseDateKey(range.from);
    const end = parseDateKey(range.to);
    const githubDays = [];
    const aiDays = [];
    for (let current = start; current.getTime() <= end.getTime(); current = addDays(current, 1)) {
        const date = dateKey(current);
        const index = Math.round((current.getTime() - start.getTime()) / (24 * 60 * 60 * 1000));
        const weekday = current.getUTCDay();
        const githubActive = (index * 7 + weekday * 11) % 9 > 1;
        const contributions = githubActive ? ((index * 13 + weekday * 3) % 8) + 1 : 0;
        githubDays.push({ date, contributions });
        const providers = {};
        if ((index * 5 + 1) % 7 > 1)
            providers.claude = ((index * 17) % 18 + 3) * 1000000;
        if ((index * 3 + 2) % 8 > 2)
            providers.codex = ((index * 29) % 13 + 2) * 1000000;
        if ((index * 11 + 3) % 9 > 2)
            providers.cursor = ((index * 23) % 16 + 1) * 1000000;
        const totalTokens = Object.values(providers).reduce((sum, value) => sum + (value ?? 0), 0);
        aiDays.push({ date, totalTokens, providers });
    }
    return {
        schema: "activity.v1",
        timezone: "UTC",
        range,
        github: {
            username,
            days: githubDays,
            source: "demo data",
        },
        ai: {
            metric: "tokens",
            available: true,
            source: "demo data — replace with your own ledger",
            days: aiDays,
            coverage: {
                claude: { from: range.from, to: range.to, source: "demo data", complete: true },
                codex: { from: range.from, to: range.to, source: "demo data", complete: true },
                cursor: { from: range.from, to: range.to, source: "demo data", complete: true },
            },
        },
    };
}
export const DEFAULT_ACTIVITY_DATA = createDemoActivityData();
//# sourceMappingURL=demo-data.js.map
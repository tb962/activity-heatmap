# Activity Heatmap

An open-source, data-driven activity heatmap for portfolio sites. It puts your
GitHub contributions and your local AI coding activity — Claude Code, Codex,
and Cursor — on one card.

![The card in light mode](docs/preview-light.png)
![The card in dark mode](docs/preview-dark.png)

It ships as:

1. A React component that renders the GitHub + AI activity card.
2. A local CLI that turns aggregate usage metadata from your machine into the
   JSON the component needs.

The component works immediately with demo data. Real data is opt-in and stays
on your machine until you choose to publish the generated aggregate JSON.

## Quick start

Install it in the website where the graph should appear:

```bash
npm install github:tb962/activity-heatmap
```

Create a local config and put in your GitHub username:

```bash
npx activity-graph init --username your-github-username
```

Authenticate GitHub once. Either use the GitHub CLI:

```bash
gh auth login
```

or set a token for the sync command:

```bash
export GITHUB_TOKEN=github_pat_...
```

Generate the aggregate data:

```bash
npx activity-graph doctor
npx activity-graph sync
```

Then render it in React:

```tsx
import activity from "./data/activity.json";
import {
  ActivityGraph,
  type ActivityDataset,
} from "@tb962/activity-heatmap";
import "@tb962/activity-heatmap/styles.css";

export function WorkBehindTheWork() {
  return <ActivityGraph data={activity as ActivityDataset} />;
}
```

For Next App Router, import the stylesheet once from `app/layout.tsx`. The
component already declares its client boundary, so the page can remain a
Server Component and pass the JSON as serializable props.

Without a `data` prop, `<ActivityGraph />` renders the built-in deterministic
demo. For GitHub-only sites, use `showAi={false}` or pass a dataset without an
`ai` section.

## Theming

The card follows the visitor's OS setting by default. Force one palette with
the `theme` prop:

```tsx
<ActivityGraph theme="dark" />   // always dark
<ActivityGraph theme="light" />  // always light
<ActivityGraph />                // "system" — follows prefers-color-scheme
```

Every colour is a CSS custom property on `.activity-graph`, so you can restyle
the card without forking the stylesheet:

```css
.activity-graph {
  --activity-graph-card: #fffdf8;
  --activity-graph-ink: #1a1815;
  --activity-graph-github-4: #216e39;
}
```

## What `sync` reads

The CLI reads only aggregate usage metadata. It never copies prompts,
transcripts, or raw log files into the generated data.

| Source | What it reads | Metric |
| --- | --- | --- |
| GitHub | Contribution calendar via `GITHUB_TOKEN` or `gh auth token`. | contributions |
| Claude Code | `~/.claude/projects/**/*.jsonl` | tokens |
| Codex | `~/.codex/sessions/**/*.jsonl` and archived sessions | tokens |
| Cursor | OpenUsage if running, else Cursor's `state.vscdb` | tokens, or messages / edited lines |
| OpenUsage | `http://127.0.0.1:6736/v1/usage` when available | tokens |

Every source is optional. If one is missing the sync keeps going and reports a
warning; if you have none of them, the component still renders with demo data
or an explicit empty state.

### How Cursor is measured

Claude Code and Codex write token counts into their own session logs. Cursor
does not: its database has a `tokenCount` field on every message, but it is
filled in on roughly 1 message in 5,000, so it cannot be charted.

Cursor tokens do exist — in Cursor's cloud usage API, which is what the
[OpenUsage](https://github.com/nerdstudio-ai/openusage) menu-bar app reads.
When OpenUsage is running, this package uses it and Cursor becomes a full
token provider alongside Claude and Codex. When it is not, the collector falls
back to Cursor's local database, which reliably records two other things.

`cursorMetric` picks between them:

| Value | Source | Unit | History |
| --- | --- | --- | --- |
| `auto` (default) | OpenUsage if running, else the local database | tokens, else messages | ~30 days, else all |
| `tokens` | OpenUsage only | tokens | ~30 days |
| `messages` | local database | messages per day | as far back as Cursor keeps |
| `edits` | local database | lines added + removed | as far back as Cursor keeps |

The tradeoff is coverage against comparability. OpenUsage gives real tokens
that sit on the same axis as Claude and Codex, so Cursor joins the **All**
view and the donut — but its usage trend is a rolling ~30-day window. The
local database goes back much further but only in its own unit, so Cursor
appears as its own tab and stays out of the token totals.

A provider's series only ever holds one unit. If the unit changes between
syncs — OpenUsage starts or stops running — the values stored in the old unit
are discarded rather than merged, because 22,000,000 tokens and 4 messages
cannot share a scale.

Reading Cursor's database needs SQLite. Node 22.5+ has it built in; older
versions fall back to the `sqlite3` CLI. The read is read-only and takes no
lock, so it works while Cursor is open.

Cursor conversations carry no per-message timestamps, so a thread is
attributed to the day it was last updated.

### A note on token counts

Cache reads dominate token totals — typically well over 90% of the number. A
long conversation replays its cached context on every turn, so tokens track
conversation *length* more than work done. It is a legitimate activity signal,
but do not read it as a measure of output.

## Reading the heatmap

Shade bands are cut at quantiles of your active days rather than at fractions
of your busiest day. Token counts are heavy-tailed — one long day can be 20x
the median — so scaling against the maximum collapses most of the calendar
into the palest shade. Quantiles keep all four shades in use whatever the unit
is.

Days outside a provider's known coverage render at half opacity and are marked
`n/a` in the legend, so a gap in the data never reads as a day off.

## Daily updates

On macOS, install a user-level launchd job that runs once a day:

```bash
npx activity-graph schedule
```

Remove it with:

```bash
npx activity-graph unschedule
```

On Linux or Windows, run `npx activity-graph sync` from the operating system's
normal scheduler. The collector has no server requirement.

## Configuration

`activity.config.json` is created by `init`:

```json
{
  "github": { "username": "your-github-username" },
  "timezone": "auto",
  "rangeDays": 365,
  "historyDays": 730,
  "output": "data/activity.json",
  "historyOutput": "data/ai-activity-history.json",
  "openUsageUrl": "http://127.0.0.1:6736/v1/usage",
  "cursorMetric": "auto",
  "sources": {
    "github": true,
    "codex": true,
    "claude": true,
    "cursor": true,
    "openUsage": true
  }
}
```

All paths are relative to the project containing the config. Environment
variables override the matching values for CI or a one-off sync:

```text
GITHUB_USERNAME
GITHUB_TOKEN or GH_TOKEN
ACTIVITY_TIMEZONE
ACTIVITY_RANGE_DAYS
ACTIVITY_CURSOR_METRIC   auto | tokens | messages | edits
AI_HISTORY_RETENTION_DAYS
OPENUSAGE_URL
```

To feed Cursor data from somewhere else — a cloud export, another editor —
set `cursorFile` to a JSON file of `{ "days": [{ "date": "2026-09-07",
"tokens": 42 }] }`. It takes precedence over the database.

## Privacy boundary

The browser component is deliberately a renderer. It cannot safely read a
visitor's local filesystem, AI logs, or API keys. The local CLI is the only
part that touches those sources, and it emits only daily aggregates:

```json
{
  "date": "2026-09-07",
  "providers": { "claude": 1200000, "codex": 800000, "cursor": 24 },
  "totalTokens": 2000000
}
```

Review `data/activity.json` before committing it to a public portfolio. This
repository ignores generated personal data by default; the example contract is
at [data/activity.example.json](data/activity.example.json).

## Development

```bash
npm install
npm run typecheck
npm test
npm run build
```

The collector tests use fixture logs, a fixture SQLite database, and a mocked
GitHub/OpenUsage response. They never read your real home directory.

To regenerate the screenshots above and a browsable preview page:

```bash
npm run preview
```

## License

MIT. See [LICENSE](LICENSE).

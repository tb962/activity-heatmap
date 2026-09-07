# Activity Heatmap

An open-source, data-driven activity heatmap for portfolio sites.

It ships as:

1. A React component that renders the GitHub + AI activity card.
2. A local CLI that turns aggregate usage metadata from your machine into the
   JSON the component needs.

The component works immediately with demo data. Real data is opt-in and stays
on the user's machine until they choose to publish the generated aggregate
JSON.

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

## What `sync` reads

The CLI reads only token-count metadata. It never copies prompts, transcripts,
or raw log files into the generated data.

| Source | Default behavior |
| --- | --- |
| GitHub | Fetches the contribution calendar with `GITHUB_TOKEN` or `gh auth token`. |
| Claude Code | Scans `~/.claude/projects/**/*.jsonl`. |
| Codex | Scans `~/.codex/sessions/**/*.jsonl` and archived sessions. |
| OpenUsage | Uses `http://127.0.0.1:6736/v1/usage` when available. |
| Cursor | Optional exported JSON configured with `cursorFile`. |

OpenUsage is optional. If it is not installed or not running, the sync keeps
going and uses the Claude Code and Codex log collectors. If a user has none of
those sources, the component still renders with demo data or an explicit empty
state.

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
  "sources": {
    "github": true,
    "codex": true,
    "claude": true,
    "cursor": false,
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
AI_HISTORY_RETENTION_DAYS
OPENUSAGE_URL
```

## Privacy boundary

The browser component is deliberately a renderer. It cannot safely read a
visitor's local filesystem, Claude/Codex logs, or API keys. The local CLI is
the only part that touches those sources, and it emits only daily aggregates:

```json
{
  "date": "2026-09-07",
  "providers": { "claude": 1200000, "codex": 800000 },
  "totalTokens": 2000000
}
```

Review `data/activity.json` before committing it to a public portfolio. The
repository ignores generated personal data by default; the example contract is
at [data/activity.example.json](data/activity.example.json).

## Development

```bash
npm install
npm run typecheck
npm test
npm run build
```

The local collector tests use fixture logs and a mocked GitHub/OpenUsage
response. They do not read your real home directory.

## License

MIT. See [LICENSE](LICENSE).

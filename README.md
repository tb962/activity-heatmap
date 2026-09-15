# Activity Heatmap

Your GitHub contributions and your local AI coding activity — Claude Code,
Codex and Cursor — on one card, collected entirely from your own machine.

The heatmaps themselves come from
[heatmap-ui](https://github.com/tb962/heatmap-ui); this package adds the
collectors, the CLI and the two-column layout.

![The card in light mode](docs/preview-light.png)
![The card in dark mode](docs/preview-dark.png)

*The screenshots show the optional card container. Out of the box the
component renders just the heatmaps — see [Layout](#layout).*

It ships as:

1. A React component that renders the GitHub + AI activity card.
2. A local CLI that turns aggregate usage metadata from your machine into the
   JSON the component needs.

The component works immediately with demo data. Real data is opt-in and stays
on your machine until you choose to publish the generated aggregate JSON.

## Quick start

Install it in the website where the graph should appear:

```bash
npm install @tb962/activity-heatmap
```

Create a local config and put in your GitHub username:

```bash
npx activity-heatmap init --username your-github-username
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
npx activity-heatmap doctor
npx activity-heatmap sync
```

Then render it in React:

```tsx
import activity from "./data/activity.json";
import {
  ActivityHeatmap,
  type ActivityDataset,
} from "@tb962/activity-heatmap";

// Two stylesheets: the heatmap primitive, then this package's layout.
import "@thilakbhat/heatmap-ui/styles.css";
import "@tb962/activity-heatmap/styles.css";

export function WorkBehindTheWork() {
  return <ActivityHeatmap data={activity as ActivityDataset} />;
}
```

For Next App Router, import both stylesheets once from `app/layout.tsx`. The
component already declares its client boundary, so the page can remain a
Server Component and pass the JSON as serializable props.

Without a `data` prop, `<ActivityHeatmap />` renders the built-in deterministic
demo. For GitHub-only sites, use `showAi={false}` or pass a dataset without an
`ai` section.

## Layout

The package ships heatmaps, not a layout. There is no heading, no caption and
no border — write your own headings around the component and it drops into
your design with nothing to override:

```tsx
<ActivityHeatmap data={activity} />
```

Wrap it however you like:

```tsx
<section>
  <h2>Your own heading</h2>
  <ActivityHeatmap data={activity} card />
</section>
```

| Prop | Default | Adds |
| --- | --- | --- |
| `card` | `false` | Border, padding, background, shadow |
| `showColumnLabels` | `true` | "GITHUB" / "AI ACTIVITY" and source lines |
| `showStats` | `true` | Totals row above each calendar |
| `showLegend` | `true` | less/more colour key |
| `showProviderToggle` | `true` | All/Claude/Codex/Cursor switcher |
| `showAi` | `true` | The AI column |
| `showGithub` | `true` | The GitHub column |

Strip it back to a single bare heatmap:

```tsx
<ActivityHeatmap
  data={activity}
  showAi={false}
  showColumnLabels={false}
  showStats={false}
  showLegend={false}
/>
```

### One graph at a time

`showAi` and `showGithub` are mirrors of each other, so either column can be
the whole component. A single AI provider needs one more prop, because the
built-in switcher would otherwise let a visitor change what the graph shows:

```tsx
<ActivityHeatmap data={activity} showAi={false} />        {/* GitHub only */}

<ActivityHeatmap
  data={activity}
  showGithub={false}
  defaultAiProvider="claude"
  showProviderToggle={false}
/>
```

Both are one calendar at full width rather than a column of a two-up card.

## Appearance

```tsx
<ActivityHeatmap
  data={activity}
  cellShape="circle"
  cellSize={15}
  cellGap={4}
  colors={{ github: "#8b5cf6", claude: "#d97757" }}
/>
```

| Prop | Default | Notes |
| --- | --- | --- |
| `cellShape` | `"rounded"` | `rounded`, `square`, `circle`, `diamond`, `hexagon`, `plus`, `bar` or `ring` |
| `cellSize` | `13` | Pixels per day cell |
| `cellGap` | `3` | Pixels between cells |
| `cellRadius` | — | Corner rounding, overriding the shape's own |
| `encode` | `"color"` | `color`, `size` or `both`. Size survives greyscale and colour blindness. |
| `scale` | `"linear"` | `linear`, `quantile`, `log`, or your own function — see [Reading the heatmap](#reading-the-heatmap) |
| `levels` | `4` | Shade bands. The ramp is derived at whatever count you ask for. |
| `unknownOpacity` | `0.5` | Opacity of days outside a source's coverage |
| `colors` | — | Base colour per view: `github`, `all`, `claude`, `codex`, `cursor`. Each is a hex seed; the shades are derived from it. |
| `levelColors` | — | Replace the derived ramp outright, palest first |
| `emptyColor` | — | Colour of a day with no activity |
| `weekStart` | `0` | `0` starts weeks on Sunday, `1` on Monday |
| `showMonthLabels` | `true` | The Jan/Feb/Mar row above the calendar |
| `showWeekdayLabels` | `false` | Mon/Wed/Fri down the left edge |

Everything from `cellShape` down is a
[heatmap-ui](https://github.com/tb962/heatmap-ui) prop handed straight through
to both calendars, so the two columns can never drift apart. Anything not
covered by a prop is a CSS custom property — see [Theming](#theming). For
lower-level control, `Heatmap` and `CalendarHeatmap` are re-exported from the
same package, so you can drop this layout entirely and keep the grid.

### The isometric mode

`dimension="3d"` swaps both calendars for heatmap-ui's isometric scene. It is
plain SVG — no WebGL, no canvas, no second bundle — and takes the same data,
tooltips and legend:

```tsx
<ActivityHeatmap data={activity} dimension="3d" blockStyle="lego" />
```

Height comes from the value itself rather than from its colour band, so a
40-contribution day is twice the height of a 20.

| Prop | Default | Notes |
| --- | --- | --- |
| `dimension` | `"2d"` | `"3d"` turns everything below on |
| `cellShape3d` | `"rectangle"` | `rectangle`, `circle` (cylinder) or `bar` |
| `blockStyle` | `"solid"` | `solid`, `lego` (studs) or `building` (lit windows) |
| `blockTheme` | `"color"` | `color` uses your ramp; `night`, `seasonal` and `rainbow` pick their own |
| `material` | `"solid"` | `pattern` fills the faces with SVG bitmaps |
| `animation` | `"none"` | `grow` raises the blocks on mount |
| `maxHeight` | `100` | Tallest block, in grid units |
| `yaw` / `pitch` / `zoom` | `-35` / `38` / `1` | The camera |
| `interactive` | `true` | Drag to orbit, arrows to rotate, `+`/`-` to zoom |
| `onCameraChange` | — | Fires while the reader moves the camera |

The three themes that pick their own colours ignore `colors`, `levelColors`
and `emptyColor` — the component withholds them rather than letting a ramp
they never asked for fight the theme.

### Preview page

One graph at a time — GitHub, all AI, or a single provider — with every
control above wired to it and the matching props written out to copy:

```bash
npm run build
npx serve .        # or any static server
```

Then open `examples/playground.html`. It needs a network connection, because
it pulls React from a CDN rather than bundling one.

**Your own GitHub graph.** Put a username in the field above the chart and the
GitHub calendar redraws with that account's public contributions, so you can
judge a shape, a palette or the 3D mode against real data instead of the demo.

Two things that field is not: it is not how the package gets your data, and it
is not GitHub. The page is static and cannot hold a token, so it reads the
public [`github-contributions-api.jogruber.de`](https://github-contributions-api.jogruber.de)
proxy — public contribution counts only, for one year, for whatever username is
typed. Real data comes from `npx activity-heatmap sync`, which talks to
GitHub's own API with your token and never leaves your machine. The AI half of
the preview stays demo data for the same reason: nothing public knows what your
local Claude, Codex or Cursor logs contain.

## Theming

The graph follows the visitor's OS setting by default. Force one palette with
the `theme` prop:

```tsx
<ActivityHeatmap theme="dark" />   // always dark
<ActivityHeatmap theme="light" />  // always light
<ActivityHeatmap />                // "system" — follows prefers-color-scheme
```

Every colour is a CSS custom property on `.activity-heatmap`, so you can restyle
it without forking the stylesheet:

```css
.activity-heatmap {
  --activity-heatmap-card: #fffdf8;
  --activity-heatmap-ink: #1a1815;
  --activity-heatmap-github-4: #216e39;
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
| Cursor | Cursor's own local databases | messages, AI edits, or edited lines |

Every source is optional. If one is missing the sync keeps going and reports a
warning; if you have none of them, the component still renders with demo data
or an explicit empty state.

### How Cursor is measured

Claude Code and Codex write token counts into their own session logs. Cursor
does not: token counts live only in your Cursor cloud account, and the
`tokenCount` field in its local database is filled in on roughly 1 message in
5,000, so it cannot be charted.

Rather than reach for your Cursor credentials, this package reads what Cursor
already stores on disk. Two databases matter:

```
~/Library/Application Support/Cursor/.../state.vscdb   conversations
~/.cursor/ai-tracking/ai-code-tracking.db              AI-written code events
```

`cursorMetric` picks what to chart:

| Value | Counts | Accuracy | History |
| --- | --- | --- | --- |
| `auto` (default) | `messages`, else `aiEdits` | — | — |
| `messages` | messages per day | day, per conversation | months |
| `aiEdits` | blocks of AI-written code | exact timestamp | ~2-week window |
| `edits` | lines added + removed | day, per conversation | months |

`auto` picks `messages` because Cursor's conversation database goes back
months while it prunes AI-edit tracking to a rolling window. Both are accurate
enough for a daily grid — exact per-edit timestamps only change the picture
for a thread spanning midnight — so coverage decides.

Choose `aiEdits` if you would rather count AI-written code than conversation
volume. It is the more precise signal and it excludes anything you typed
yourself, but it starts near-empty and fills in from your first sync onward.
That is fine: the collector keeps its own history file, so once a day is
recorded it stays, whatever Cursor later prunes.

Once a metric has been recorded, `auto` keeps it. Switching unit discards the
values stored under the old one — 4 messages and 22,000,000 tokens cannot
share a scale — so only an explicit config change may do that.

Because Cursor's unit is not tokens, it never joins a day's token total. The
**All** view aggregates the token providers; Cursor gets its own tab with its
own label.

Reading these databases needs SQLite. Node 22.5+ has it built in; older
versions fall back to the `sqlite3` CLI. Both reads are read-only and take no
lock, so they work while Cursor is open.

### No account access, ever

The collector reads local files and calls exactly one network endpoint:
GitHub's GraphQL API, with a token you supply. It never reads credentials for
Claude, Codex, or Cursor, never touches your Keychain, and never calls a
vendor's private API. Anything it cannot learn from a file on disk, it does
not report.

## Reading the heatmap

Shade bands are cut at even fractions of your busiest day, which is what
GitHub does and what readers already know how to read. That is `scale="linear"`,
the default.

Token counts are heavy-tailed, though — one long day can be 20x the median — so
scaling against the maximum collapses most of the calendar into the palest
shade. `scale="quantile"` ranks your active days instead and keeps every band
in use whatever the unit is:

```tsx
<ActivityHeatmap data={activity} scale="quantile" />
```

Try both in the preview page against your own numbers; which one reads better
depends on how spiky your year was.

Days outside a provider's known coverage render at half opacity and are marked
`n/a` in the legend, so a gap in the data never reads as a day off.

## Daily updates

On macOS, install a user-level launchd job that runs once a day:

```bash
npx activity-heatmap schedule
```

Remove it with:

```bash
npx activity-heatmap unschedule
```

On Linux or Windows, run `npx activity-heatmap sync` from the operating system's
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
  "cursorMetric": "auto",
  "sources": {
    "github": true,
    "codex": true,
    "claude": true,
    "cursor": true
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
ACTIVITY_CURSOR_METRIC   auto | messages | aiEdits | edits
AI_HISTORY_RETENTION_DAYS
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

The collector tests use fixture logs, fixture SQLite databases, and a mocked
GitHub response. They never read your real home directory.

To regenerate the screenshots above and a browsable preview page:

```bash
npm run preview
```

`examples/playground.html` is the interactive version; it reads `dist/`
directly, so run `npm run build` first and serve the folder over HTTP.

## License

MIT. See [LICENSE](LICENSE).

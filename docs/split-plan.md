# Splitting the heatmap out

Two repositories. The UI component becomes a standalone library; this repo
keeps the collectors and the two-column view and consumes it from npm.

```
github.com/tb962/heatmap          @tb962/heatmap          the primitive
github.com/tb962/activity-graph   @tb962/activity-graph   the product
```

The dependency runs one way. `activity-graph` imports `@tb962/heatmap`;
`heatmap` never learns what GitHub, Claude, Codex or Cursor are.

---

## 1. The core API

The core must not know about dates. Bake them in and "plug anything" quietly
becomes impossible later, because every future layout has to pretend to be a
calendar.

```tsx
<Heatmap
  rows={7}
  columns={20}
  values={cells}
/>
```

### Values

Two accepted shapes, normalised to one internally:

```ts
// Dense — the natural form for a punchcard or a matrix.
type HeatmapMatrix = Array<Array<number | null>>;   // null = no data

// Sparse — the natural form for anything with gaps.
type HeatmapCell = {
  row: number;
  column: number;
  value: number;
  /** false = no data for this slot, which is not the same as zero. */
  known?: boolean;
  /** Anything the consumer wants back in the tooltip callback. */
  meta?: unknown;
};

values: HeatmapMatrix | HeatmapCell[];
```

`known` is the part other libraries get wrong. A missing day and a day with
zero activity are different facts and must be drawn differently.

### Scale

```ts
scale?: "quantile" | "linear" | "log" | ((value: number, all: number[]) => number);
levels?: number;        // default 4
thresholds?: number[];  // explicit, skips scale entirely
```

`quantile` is the default, which is the opposite of every other library. It is
the right default: real activity data is heavy-tailed, and scaling against the
maximum put 58% of days in the palest shade when measured against this repo's
own data.

### Appearance

```ts
shape?: HeatmapShape;
cellSize?: number;      // default 13
gap?: number;           // default 3
radius?: number | string;  // overrides the shape's own rounding
colors?: string[];      // the ramp, palest first
emptyColor?: string;
unknownOpacity?: number;   // default 0.5
```

### Shapes

Beyond the obvious three, these are worth building because they are genuinely
uncommon and each earns its place:

| Shape | Why |
| --- | --- |
| `rounded` / `square` / `circle` | Table stakes. |
| `diamond` | A 45° square. Reads denser; good for long ranges. |
| `hexagon` | Offset rows, honeycomb. The standard form for hex-binned data and unavailable anywhere in React. |
| `plus` | High-contrast at small sizes where circles turn to mush. |
| `bar` | Height scales with value, colour stays flat. A calendar/bar-chart hybrid. |
| `ring` | Stroke thickness scales with value. Works on dark and light grounds without a fill. |

`hexagon` needs the grid to support row offsetting, so decide it before
freezing the layout code rather than bolting it on.

### Encoding — the accessibility argument

```ts
encode?: "color" | "size" | "both";   // default "color"
```

Colour alone fails roughly 1 in 12 men. `size` scales the cell within its slot
so intensity survives in greyscale and for colour-blind readers; `both` gives
redundant encoding. No React heatmap library offers this, and it is a
principled feature rather than a novelty.

### Labels, interaction, a11y

```ts
rowLabels?: ReactNode[];
columnLabels?: Array<{ column: number; text: ReactNode }>;
tooltip?: (cell: ResolvedCell) => ReactNode;
cellLabel?: (cell: ResolvedCell) => string;   // aria-label per cell
onCellClick?: (cell: ResolvedCell) => void;
ariaLabel?: string;
showLegend?: boolean;
legendLabels?: { less?: ReactNode; more?: ReactNode; unknown?: ReactNode };
```

Keep the current behaviour: cells are keyboard focusable, the container is
`role="group"` (not `role="img"`, which hides focusable descendants), and the
tooltip has a 300ms open delay.

---

## 2. The calendar adapter

Ships in the same package, layered on top. Around 60 lines.

```tsx
<CalendarHeatmap
  values={[{ date: "2026-09-07", value: 12, known: true }]}
  to="2026-09-07"
  weeks={20}
  weekStart={0}
  showMonthLabels
  showWeekdayLabels
  {...heatmapProps}
/>
```

It owns everything date-shaped and nothing else: mapping dates onto
`(row, column)`, month label positions, weekday labels, and the default
`cellLabel` that reads "Monday, 7 September 2026. 12 contributions".

---

## 3. What moves

| File today | Destination | Work |
| --- | --- | --- |
| `src/activity-grid.ts` | **split** | `quantileThresholds`, `activityLevel`, `gridMeasures` → core. `buildActivityGrid`, `dayKey`, `columnsToCover`, `columnsWithin`, month labels → calendar adapter. |
| `src/activity-calendar.tsx` | **split** | Cell rendering, palette derivation, tooltip, legend → core `<Heatmap>`. Date formatting and month row → `<CalendarHeatmap>`. |
| `src/styles.css` | **split** | `__calendar*`, `__cell*`, `__week*`, `__month-row`, `__legend*`, `__tooltip*` → core. `__surface`, `__columns`, `__column*`, `__stats`, `__stat`, `__provider-*`, `__source`, `__empty-note` → product. Theme tokens are duplicated in both, scoped to each root class. |
| `src/activity-graph.tsx` | stays | Becomes a consumer of `<CalendarHeatmap>`. |
| `src/activity.ts`, `demo-data.ts`, `types.ts` | stays | Product-specific. |
| `lib/`, `bin/`, `test/`, `test-support/` | stays | Collectors and CLI. |
| `examples/playground.html` | **both** | Core gets a shape/scale/encoding playground. Product keeps a slimmer one. |

The seam is clean because the grid math is already pure. The one genuine
untangling is `activity-calendar.tsx`, which currently mixes cell rendering
with date formatting.

---

## 4. Two-repo coordination

The cost of two repos is version coordination. Handle it deliberately:

**Local development.** In `activity-graph`, link the working copy instead of
publishing to test:

```bash
cd ../heatmap && npm link
cd ../activity-graph && npm link @tb962/heatmap
```

Never commit a `file:../heatmap` dependency — it breaks every other clone.

**Version range.** Depend on `^0.x` / `^1.0.0` so patches and minors flow
without a bump in the product.

**Catching breaks early.** Add a scheduled CI job in `activity-graph` that
installs `@tb962/heatmap@main` from git and runs the test suite. Without it
you find out the interface drifted when a user does.

**Publish order.** Always `heatmap` first, then `activity-graph`. The product
can never reference an unpublished version.

---

## 5. Order of work

1. **Create `tb962/heatmap`.** Move the grid math and the renderer. Port the
   existing tests for `quantileThresholds` and `activityLevel`; add tests for
   matrix/sparse normalisation and the `known` distinction.
2. **Build `<Heatmap>` to the API above** — new shapes and the `encode` prop
   included, since they affect the layout code and are painful to retrofit.
3. **Add `<CalendarHeatmap>`** and verify it reproduces the current output
   exactly. The existing screenshots are the regression test.
4. **Publish `@tb962/heatmap@0.1.0`.**
5. **Point this repo at it.** Delete the moved files, add the dependency,
   rewrite `activity-graph.tsx` against `<CalendarHeatmap>`. Screenshots
   should be pixel-identical; if they are not, the API is wrong.
6. **Rename** this package to `@tb962/activity-graph`, keeping the
   `activity-graph` CLI binary name it already uses.
7. **Publish both.**

Steps 1–4 are the bulk. Step 5 should be small if the API is right — that is
the test of whether the split was drawn correctly.

---

## 6. Positioning

Not "a heatmap with more shapes" — that is a crowded and losing pitch. The
defensible claim is correctness:

- **Quantile shading by default.** Others scale linearly against the maximum
  and flatten real data.
- **Unknown is not zero.** Gaps are drawn as gaps, not as inactivity.
- **Any grid, not just calendars.** Hours × weekdays, months × years,
  arbitrary matrices. Most libraries are GitHub-calendar clones.
- **Encodes intensity without relying on colour.**

Shapes and colours are what the README shows. Correctness is what the README
argues.

# WTFPS v2 #2 — Interactive uPlot Timelines + Brush-to-Select Windowing

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the static SVG session timeline with an interactive uPlot chart (FPS line + one selectable sensor overlay, limiter/throttle rail and event markers painted into the same canvas) and let the user brush a time range — or type a From/To range — to get whole-pipeline statistics for just that slice in a new selection panel.

**Architecture:** Two new seams. (1) A pure, node-tested engine module `src/engine/selection.ts` — `computeSelection(log, windows, startRow, endRow): SelectionAnalysis` — that slices row-aligned series with `computeStats` and reuses the existing per-window classifications via `buildTimeSplit`. (2) A new UI package `src/ui/timeline/` (chart container, uPlot lifecycle hook, token→canvas theme reader, canvas rail/marker plugin, decimation + time→row mapping) that replaces `src/ui/WindowTimeline.tsx` outright. `NerdView` owns the `{startRow, endRow}` selection state and renders `SelectionPanel` from a `useMemo`'d `computeSelection`. The analyze pipeline, verdict, and digest are untouched — selection stats are a main-thread view over data the worker already produced.

**Tech Stack:** TypeScript 5 strict, React 18, Vitest. Chart: **uplot** `^1.6.31` — already in `package.json` dependencies and currently unused anywhere in `src/` (verified; `node_modules/uplot` is 1.6.32 and ships `dist/uPlot.min.css`). No new dependencies.

**Baseline:** This plan assumes WTFPS v2 plan #1 (before/after compare + history, `docs/superpowers/plans/2026-06-11-wtfps-v2-compare-history.md`) is already merged. Nothing here touches or depends on compare code; the only shared surface is `NerdView`, where this plan swaps the timeline component and adds selection state.

**Spec:** none — the **Design decisions** section below locks scope and is part of the contract.

**Out of scope:** Easy mode (no chart there, not even a mini-spark — see Future); verdict/digest changes (they stay whole-log by user decision); event-marker *annotations/tooltips* (v2 plan #3 builds on the marker contract locked below); zoom/pan; multi-sensor overlays; touching `theme.css`, `cx.ts`, `primitives/`, or `Mascot.tsx` (forbidden by `src/ui/DESIGN.md`).

---

## Design decisions (locked)

1. **Nerd-only.** The interactive timeline lives in Nerd mode. A new `src/ui/timeline/` package replaces `src/ui/WindowTimeline.tsx`; once parity is reached (limiter/throttle rail + worst-moment markers + caption + a11y label), `WindowTimeline.tsx`, `WindowTimeline.test.tsx`, and its CSS blocks in `NerdView.css` are **deleted**. Rationale: Easy mode is short/reassuring by contract; a dense brushable chart is instrument-bench territory, and keeping two timelines means double maintenance.

2. **Package layout.** `Timeline.tsx` (container: sensor chips, brush wiring, From/To time inputs, legend, caption), `useUPlot.ts` (mount/destroy/resize via ResizeObserver), `chartTheme.ts` (`readChartTheme(el: HTMLElement)` reads `--accent`, `--text`, `--text-dim`, `--warn`, `--bad`, `--good`, `--inset`, `--border`, `--font-mono` via `getComputedStyle` at mount — the DESIGN.md-compliant pattern: JS *reads* tokens, never restates hex, because CSS variables don't resolve inside a canvas), `plugins.ts` (a uPlot draw-hook plugin painting the limiter/throttle rail band and worst/event markers into the **same canvas** — one paint surface, no SVG/canvas scroll-sync bugs), `decimate.ts` (min/max bucket decimation + `timeToRow`). Rationale: each file has one testable responsibility; everything except `Timeline.tsx` is pure or near-pure.

3. **Series.** x = `log.timesMs` converted to seconds. y1 = `log.fps.series` (omitted entirely when `fps.source === 'none'` — never invent numbers). y2 = exactly **one** sensor picked via chips from a curated list, filtered to keys present in the log: `gpu.temp` (default), `cpu.tempPackage`, `gpu.usage`, `cpu.usageTotal`, `pm.frameTimeMs`, `gpu.clockEff`, `fan.gpuRpm`. Each chip declares a **named uPlot scale per unit** (`fps`, `c`, `pct`, `ms`, `mhz`, `rpm`) so a 1800 RPM fan never shares an axis with an 80 °C temp. Rationale: one overlay keeps the chart legible and the scale problem trivial; the curated list covers every bottleneck family the engine can diagnose.

4. **Brush.** uPlot's `setSelect` hook → `u.posToVal(left/right, 'x')` → `timeToRow(timesMs, tMs)` binary search → `{startRow, endRow}` state **owned by `NerdView`**. `timeToRow` must return the **FIRST index of a forward-filled duplicate run** — `timesMs` contains duplicates whenever logging paused, and a selection edge landing mid-run must not split it arbitrarily. A brush narrower than 4 px clears the selection. Rationale: rows are the engine's native coordinate; converting at the chart boundary keeps everything downstream pure.

5. **Selection analysis is engine code.** New `src/engine/selection.ts` (pure, node-tested): `computeSelection(log: NormalizedLog, windows: WindowAnalysis, startRow: number, endRow: number): SelectionAnalysis` with `SelectionAnalysis = { startRow: number; endRow: number; startMs: number; endMs: number; fps: Stats | null; sensors: Partial<Record<CanonicalKey, Stats>>; timeSplit: TimeSplit | null; windowCount: number }` (declared in `src/types.ts` like every cross-module shape). Implementation: `computeStats(sensor.values.slice(startRow, endRow + 1))` per present key; FPS stats from the `fps.series` slice (`computeStats` already skips nulls); `buildTimeSplit(...)` over the windows **fully inside** the row range, reusing the EXISTING classifications — no re-classification, because windows are ≤5 s so the partial window lost at each edge costs at most a few seconds of gameplay time. Runs in a main-thread `useMemo` in `NerdView` (slicing + percentiles over a few thousand rows is sub-millisecond; no worker round-trip needed). **Verdict and digest stay whole-log** (user decision).

6. **`SelectionPanel.tsx`.** A solid `<Card className="nerd-card">` (dense data never goes translucent), mono/tabular figures: FPS avg + 1% low, per-sensor avg/min/max rows, the selection's time-split shares, duration + row range, and a clear-selection button. This panel doubles as the **text alternative** for everything the brush selects on the chart.

7. **A11y / reduced motion.** The chart container gets `role="img"` with a generated text-summary `aria-label` (FPS avg/range + dominant limiter). The From/To mm:ss inputs drive the *identical* selection state — that is the keyboard path; no separate canvas keyboard handling. There are **no chart animations to neutralize**: uPlot draws statically, and the global `prefers-reduced-motion` rules in `theme.css` are not fought.

8. **Event-marker contract (v2 plan #3 depends on this — do not rename).** The timeline paints a marker for **every `DiagEvent` with non-empty `windowIndexes` and `severity !== 'info'`**, positioned at the **first listed window's center**, colored by the severity token (`--warn`/`--bad`). Worst moments keep their own distinct marker shape (downward triangle, as in the old timeline; event markers are diamonds). `buildEventMarkers(events, windows)` in `plugins.ts` is the named seam plan #3 will extend with tooltips/annotations.

9. **Testing strategy.** jsdom has no canvas, so **every test that renders the chart mocks the `uplot` module** (`vi.mock('uplot', …)` backed by a shared `_uplotMock.ts`) and asserts on the *options object* (series count, theme strokes from a stubbed `getComputedStyle`, registered `setSelect` hook) and on callbacks fired by hand. Geometry, decimation, theming, and selection math are pure functions tested directly. Real canvas rendering is verified **manually** via `npm run dev` — the Verification section says exactly what to look at. Decimation: no downsampling at ≤20,000 rows; above that, min/max bucket decimation to ≤4,000 points that preserves single-row spikes and null gaps. The `uplot/dist/uPlot.min.css` import is a **vendor structural reset** (cursor/select overlay positioning), not our styling — DESIGN.md-compatible; all WTFPS-authored styles live in `Timeline.css`/`SelectionPanel.css` and reference only `var(--…)` tokens.

---

## File map

| File | Action | Responsibility |
|---|---|---|
| `src/types.ts` | modify | Add `SelectionAnalysis` |
| `src/engine/selection.ts` | create | Pure `computeSelection` over a row range |
| `src/engine/selection.test.ts` | create | Node tests on testkit logs |
| `src/ui/timeline/decimate.ts` | create | `decimateRows` (min/max buckets) + `timeToRow` (binary search) |
| `src/ui/timeline/decimate.test.ts` | create | Spike/null-gap preservation, duplicate-run mapping |
| `src/ui/timeline/chartTheme.ts` | create | `readChartTheme`: CSS tokens → canvas colors |
| `src/ui/timeline/chartTheme.test.ts` | create | Stubbed `getComputedStyle` mapping + fallbacks |
| `src/ui/timeline/plugins.ts` | create | Rail kinds/coalescing (ported from `WindowTimeline`), event/worst markers, draw-hook plugin |
| `src/ui/timeline/plugins.test.ts` | create | Pure geometry + recording-ctx draw test |
| `src/ui/timeline/useUPlot.ts` | create | uPlot mount/destroy/resize lifecycle hook |
| `src/ui/timeline/_uplotMock.ts` | create | Shared test stand-in for the `uplot` module |
| `src/ui/timeline/Timeline.tsx` | create | Chart container: chips, brush, From/To inputs, caption, a11y |
| `src/ui/timeline/Timeline.css` | create | Token-only component styles (chips, range form, legend, caption) |
| `src/ui/timeline/Timeline.test.tsx` | create | RTL with uplot mocked; migrates caption/empty-render assertions |
| `src/ui/timeline/SelectionPanel.tsx` | create | Selection stats card + clear button |
| `src/ui/timeline/SelectionPanel.css` | create | Token-only styles |
| `src/ui/timeline/SelectionPanel.test.tsx` | create | RTL: FPS/sensor rows, shares, clear |
| `src/ui/NerdView.tsx` | modify | Swap in `Timeline`, own selection state, render `SelectionPanel` |
| `src/ui/NerdView.test.tsx` | modify | Mock uplot; brush/keyboard → panel flow |
| `src/ui/NerdView.css` | modify | Delete the orphaned `.nerd-spark*`/`.wt-*`/`.nerd-legend*` blocks |
| `src/ui/WindowTimeline.tsx` | **delete** | Replaced by `src/ui/timeline/` |
| `src/ui/WindowTimeline.test.tsx` | **delete** | Assertions migrated (rail → `plugins.test.ts`, caption/empty → `Timeline.test.tsx`) |

Run all tests with `npm run test`; single file with `npx vitest src/ui/timeline/Timeline.test.tsx`. Typecheck via `npm run build`. Vitest env note: `src/engine/**` runs under node, `src/ui/**` (including `src/ui/timeline/**`) runs under jsdom (`vitest.config.ts` `environmentMatchGlobs`).

---

### Task 1: `SelectionAnalysis` type + `src/engine/selection.ts`

**Files:**
- Modify: `src/types.ts`
- Create: `src/engine/selection.ts`
- Test: `src/engine/selection.test.ts`

- [ ] **Step 1: Add `SelectionAnalysis` to `src/types.ts`**

Insert after the `WindowAnalysis` interface (before `export type Health`):

```ts
// A user-brushed row range of the log, analyzed with the same stats machinery
// as the whole-log view. timeSplit reuses existing window classifications and
// covers only windows fully inside the range.
export interface SelectionAnalysis {
  startRow: number;
  endRow: number;
  startMs: number;
  endMs: number;
  fps: Stats | null;
  sensors: Partial<Record<CanonicalKey, Stats>>;
  timeSplit: TimeSplit | null;
  windowCount: number;
}
```

- [ ] **Step 2: Write failing tests — `src/engine/selection.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { computeSelection } from './selection';
import { computeStats } from '../stats/percentiles';
import { makeLog, makeWindow, makeWindowAnalysis } from '../causes/testkit';

function logWithTimes() {
  const log = makeLog({
    sensors: {
      'gpu.temp': [70, 72, 80, 85, 84, 71],
      'cpu.usageTotal': [40, 45, 90, 95, 92, 41],
    },
    fps: { source: 'displayed', sourceLabel: 'Framerate Displayed (avg)', series: [100, 98, 45, 40, 44, 99] },
  });
  log.timesMs = [0, 2000, 4000, 6000, 8000, 10000];
  return log;
}

describe('computeSelection', () => {
  it('sub-range stats match computeStats of the same slice', () => {
    const sel = computeSelection(logWithTimes(), makeWindowAnalysis([]), 2, 4);
    expect(sel.fps).toEqual(computeStats([45, 40, 44]));
    expect(sel.sensors['gpu.temp']).toEqual(computeStats([80, 85, 84]));
    expect(sel.sensors['cpu.usageTotal']).toEqual(computeStats([90, 95, 92]));
    expect(sel.startRow).toBe(2);
    expect(sel.endRow).toBe(4);
    expect(sel.startMs).toBe(4000);
    expect(sel.endMs).toBe(8000);
  });

  it('time-split counts only windows fully inside the row range, reusing their classification', () => {
    // makeWindow(i) spans rows i*4 .. i*4+3; selection 0..9 contains windows 0 and 1
    // fully, window 2 only partially.
    const wa = makeWindowAnalysis([
      makeWindow(0, { activity: 'idle' }),
      makeWindow(1, { limiter: 'gpu', metrics: { fpsAvg: 100 } }),
      makeWindow(2, { limiter: 'gpu', metrics: { fpsAvg: 100 } }),
    ]);
    const log = makeLog({ sensors: { 'gpu.temp': Array(12).fill(70) } });
    log.timesMs = Array.from({ length: 12 }, (_, i) => i * 2000);

    const sel = computeSelection(log, wa, 0, 9);
    expect(sel.windowCount).toBe(2);
    expect(sel.timeSplit).not.toBeNull();
    // only window 1 is gameplay; the idle window contributes no gameplay time
    expect(sel.timeSplit!.shares.gpu).toBeCloseTo(1);
    expect(sel.timeSplit!.gameplayMs).toBe(6000);
  });

  it('returns null timeSplit when no window fits fully inside', () => {
    const wa = makeWindowAnalysis([makeWindow(0, { limiter: 'gpu', metrics: { fpsAvg: 100 } })]);
    const sel = computeSelection(logWithTimes(), wa, 1, 2); // window 0 spans rows 0..3
    expect(sel.timeSplit).toBeNull();
    expect(sel.windowCount).toBe(0);
  });

  it('fps is null when the source is none or the slice is all-null', () => {
    const noFps = makeLog({ sensors: { 'gpu.temp': [70, 71, 72] } });
    noFps.timesMs = [0, 2000, 4000];
    expect(computeSelection(noFps, makeWindowAnalysis([]), 0, 2).fps).toBeNull();

    const gappy = logWithTimes();
    gappy.fps.series = [100, null, null, null, null, 99];
    expect(computeSelection(gappy, makeWindowAnalysis([]), 1, 4).fps).toBeNull();
  });

  it('degenerate ranges return safe nulls', () => {
    const empty = computeSelection(makeLog({}), makeWindowAnalysis([]), 0, 5);
    expect(empty).toMatchObject({ fps: null, sensors: {}, timeSplit: null, windowCount: 0 });

    const inverted = computeSelection(logWithTimes(), makeWindowAnalysis([]), 4, 2);
    expect(inverted).toMatchObject({ fps: null, sensors: {}, timeSplit: null, windowCount: 0 });
  });

  it('clamps rows that fall outside the log', () => {
    const sel = computeSelection(logWithTimes(), makeWindowAnalysis([]), 4, 999);
    expect(sel.endRow).toBe(5);
    expect(sel.fps).toEqual(computeStats([44, 99]));
  });
});
```

- [ ] **Step 3: Run to verify failure**

Run: `npx vitest src/engine/selection.test.ts` → FAIL (module not found).

- [ ] **Step 4: Implement `src/engine/selection.ts`**

```ts
import type { NormalizedLog, SelectionAnalysis, Stats, WindowAnalysis } from '../types';
import { computeStats } from '../stats/percentiles';
import { buildTimeSplit } from '../windows/aggregate';

function statsOrNull(values: (number | null)[]): Stats | null {
  const s = computeStats(values);
  return s.count > 0 ? s : null;
}

const EMPTY: Omit<SelectionAnalysis, 'startRow' | 'endRow'> = {
  startMs: 0, endMs: 0, fps: null, sensors: {}, timeSplit: null, windowCount: 0,
};

// Pure selection analysis over an inclusive row range. Cheap enough for a
// main-thread useMemo: slices + percentiles over a few thousand rows.
export function computeSelection(
  log: NormalizedLog,
  windows: WindowAnalysis,
  startRow: number,
  endRow: number,
): SelectionAnalysis {
  if (log.rowCount === 0 || endRow < startRow) {
    return { startRow: 0, endRow: 0, ...EMPTY };
  }
  const lastRow = log.rowCount - 1;
  const start = Math.min(Math.max(startRow, 0), lastRow);
  const end = Math.min(Math.max(endRow, start), lastRow);

  const sensors: SelectionAnalysis['sensors'] = {};
  for (const sensor of Object.values(log.sensors)) {
    if (!sensor) continue;
    const s = statsOrNull(sensor.values.slice(start, end + 1));
    if (s) sensors[sensor.key] = s;
  }

  const fps = log.fps.source === 'none'
    ? null
    : statsOrNull(log.fps.series.slice(start, end + 1));

  // Reuse the per-window classifications instead of re-classifying the slice:
  // windows are ≤5 s, so the partial window dropped at each edge loses a few
  // seconds of gameplay time at most.
  const contained = windows.windows.filter(
    (w) => w.window.startRow >= start && w.window.endRow <= end,
  );

  return {
    startRow: start,
    endRow: end,
    startMs: log.timesMs[start] ?? 0,
    endMs: log.timesMs[end] ?? log.timesMs[start] ?? 0,
    fps,
    sensors,
    timeSplit: contained.length > 0 ? buildTimeSplit(contained) : null,
    windowCount: contained.length,
  };
}
```

- [ ] **Step 5: Run tests**

Run: `npx vitest src/engine/selection.test.ts` → PASS. Run `npm run build` → typecheck green (the new type is additive).

- [ ] **Step 6: Commit**

```bash
git add src/types.ts src/engine/selection.ts src/engine/selection.test.ts
git commit -m "feat(engine): pure selection analysis over a brushed row range"
```

---
### Task 2: `decimate.ts` — min/max bucket decimation + `timeToRow`

**Files:**
- Create: `src/ui/timeline/decimate.ts`
- Test: `src/ui/timeline/decimate.test.ts`

- [ ] **Step 1: Write failing tests — `src/ui/timeline/decimate.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { decimateRows, timeToRow, DECIMATE_THRESHOLD, DECIMATE_TARGET } from './decimate';

describe('timeToRow', () => {
  // duplicate run at rows 2..4: HWiNFO forward-fills timestamps when logging pauses
  const times = [0, 2000, 4000, 4000, 4000, 6000];

  it('maps an exact time to the FIRST index of its duplicate run', () => {
    expect(timeToRow(times, 4000)).toBe(2);
    expect(timeToRow(times, 0)).toBe(0);
    expect(timeToRow(times, 6000)).toBe(5);
  });

  it('maps a between-samples time to the nearest row', () => {
    expect(timeToRow(times, 2900)).toBe(1);  // 2000 is closer
    expect(timeToRow(times, 3100)).toBe(2);  // 4000 is closer → first of run
    expect(timeToRow(times, 5000)).toBe(2);  // exact tie resolves low → first of run
  });

  it('clamps out-of-range times', () => {
    expect(timeToRow(times, -500)).toBe(0);
    expect(timeToRow(times, 99999)).toBe(5);
    expect(timeToRow([], 1000)).toBe(0);
  });

  it('a trailing duplicate run resolves to its first index', () => {
    expect(timeToRow([0, 2000, 2000, 2000], 9000)).toBe(1);
  });
});

describe('decimateRows', () => {
  it('passes small logs through untouched', () => {
    const rows = decimateRows(DECIMATE_THRESHOLD, [Array(DECIMATE_THRESHOLD).fill(60)]);
    expect(rows).toHaveLength(DECIMATE_THRESHOLD);
    expect(rows[0]).toBe(0);
    expect(rows[rows.length - 1]).toBe(DECIMATE_THRESHOLD - 1);
  });

  it('keeps a single 1-row dip when decimating', () => {
    const n = 30000;
    const series: (number | null)[] = Array(n).fill(100);
    series[12345] = 5;
    const rows = decimateRows(n, [series]);
    expect(rows.length).toBeLessThanOrEqual(DECIMATE_TARGET);
    expect(rows).toContain(12345);
  });

  it('preserves null gaps so the line still breaks', () => {
    const n = 30000;
    const series: (number | null)[] = Array(n).fill(100);
    for (let i = 9000; i < 9100; i++) series[i] = null;
    const rows = decimateRows(n, [series]);
    expect(rows.some((r) => r >= 9000 && r < 9100 && series[r] === null)).toBe(true);
  });

  it('stays under the target with two series and preserves both their spikes', () => {
    const n = 50000;
    const a: (number | null)[] = Array(n).fill(100);
    const b: (number | null)[] = Array(n).fill(70);
    a[1111] = 3;
    b[44444] = 99;
    const rows = decimateRows(n, [a, b]);
    expect(rows.length).toBeLessThanOrEqual(DECIMATE_TARGET);
    expect(rows).toContain(1111);
    expect(rows).toContain(44444);
    // strictly ascending — uPlot requires sorted x
    for (let i = 1; i < rows.length; i++) expect(rows[i]).toBeGreaterThan(rows[i - 1]);
  });

  it('falls back to stride sampling when no series is present', () => {
    const rows = decimateRows(30000, [undefined, undefined]);
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.length).toBeLessThanOrEqual(DECIMATE_TARGET);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest src/ui/timeline/decimate.test.ts` → FAIL (module not found).

- [ ] **Step 3: Implement `src/ui/timeline/decimate.ts`**

```ts
export const DECIMATE_THRESHOLD = 20_000;
export const DECIMATE_TARGET = 4_000;

function firstOfRun(timesMs: number[], row: number): number {
  while (row > 0 && timesMs[row - 1] === timesMs[row]) row--;
  return row;
}

// Nearest row for a time, by binary search over the (non-decreasing) timesMs.
// Forward-filled duplicate runs — HWiNFO repeats the timestamp when logging
// pauses — always resolve to the FIRST index of the run, so a selection edge
// can't land arbitrarily inside one. Ties between neighbors resolve low.
export function timeToRow(timesMs: number[], tMs: number): number {
  const n = timesMs.length;
  if (n === 0) return 0;
  if (tMs <= timesMs[0]) return 0;
  if (tMs >= timesMs[n - 1]) return firstOfRun(timesMs, n - 1);

  let lo = 0;
  let hi = n - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (timesMs[mid] <= tMs) lo = mid;
    else hi = mid;
  }
  const row = tMs - timesMs[lo] <= timesMs[hi] - tMs ? lo : hi;
  return firstOfRun(timesMs, row);
}

// Min/max bucket decimation over row indexes, shared by every plotted series
// (uPlot aligned data needs one common x). Each bucket keeps, per series, the
// rows holding its min and max (spikes survive) plus one null row if the
// bucket has a gap (line breaks survive). Logs at or under the threshold pass
// through untouched — at HWiNFO's usual 2 s poll that is ~11 hours.
export function decimateRows(
  rowCount: number,
  series: ((number | null)[] | undefined)[],
  threshold = DECIMATE_THRESHOLD,
  target = DECIMATE_TARGET,
): number[] {
  if (rowCount <= threshold) return Array.from({ length: rowCount }, (_, i) => i);

  const present = series.filter((s): s is (number | null)[] => !!s && s.length > 0);
  // ≤3 kept rows per series per bucket (min, max, one null) bounds the output
  const perBucket = 3 * Math.max(present.length, 1);
  const buckets = Math.max(1, Math.floor(target / perBucket));
  const size = rowCount / buckets;
  const keep = new Set<number>();

  for (let b = 0; b < buckets; b++) {
    const from = Math.floor(b * size);
    const to = Math.min(Math.floor((b + 1) * size), rowCount);
    if (present.length === 0) {
      keep.add(from);
      continue;
    }
    for (const s of present) {
      let minI = -1;
      let maxI = -1;
      let nullI = -1;
      for (let i = from; i < to; i++) {
        const v = s[i];
        if (v === null || !Number.isFinite(v)) {
          if (nullI === -1) nullI = i;
          continue;
        }
        if (minI === -1 || v < (s[minI] as number)) minI = i;
        if (maxI === -1 || v > (s[maxI] as number)) maxI = i;
      }
      if (minI !== -1) keep.add(minI);
      if (maxI !== -1) keep.add(maxI);
      if (nullI !== -1) keep.add(nullI);
    }
  }
  return [...keep].sort((a, b) => a - b);
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest src/ui/timeline/decimate.test.ts` → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/ui/timeline/decimate.ts src/ui/timeline/decimate.test.ts
git commit -m "feat(ui): timeline decimation and time-to-row mapping helpers"
```

---

### Task 3: `chartTheme.ts` — CSS tokens → canvas colors

**Files:**
- Create: `src/ui/timeline/chartTheme.ts`
- Test: `src/ui/timeline/chartTheme.test.ts`

- [ ] **Step 1: Write failing tests — `src/ui/timeline/chartTheme.test.ts`**

```ts
import { describe, it, expect, vi, afterEach } from 'vitest';
import { readChartTheme } from './chartTheme';

function stubTokens(map: Record<string, string>) {
  vi.spyOn(window, 'getComputedStyle').mockReturnValue({
    getPropertyValue: (name: string) => map[name] ?? '',
  } as unknown as CSSStyleDeclaration);
}

afterEach(() => vi.restoreAllMocks());

describe('readChartTheme', () => {
  it('reads every chart token off the element', () => {
    stubTokens({
      '--accent': '#3b9eff', '--text': '#e8eef6', '--text-dim': '#9aa7b8',
      '--warn': '#f5b941', '--bad': '#ff5d5d', '--good': '#4ade80',
      '--inset': '#0b0f15', '--border': '#222a35', '--font-mono': "'JetBrains Mono', monospace",
    });
    const t = readChartTheme(document.body);
    expect(t.accent).toBe('#3b9eff');
    expect(t.text).toBe('#e8eef6');
    expect(t.textDim).toBe('#9aa7b8');
    expect(t.warn).toBe('#f5b941');
    expect(t.bad).toBe('#ff5d5d');
    expect(t.good).toBe('#4ade80');
    expect(t.inset).toBe('#0b0f15');
    expect(t.border).toBe('#222a35');
    expect(t.fontMono).toBe("'JetBrains Mono', monospace");
  });

  it('falls back to the --text value when a color token is empty', () => {
    stubTokens({ '--text': '#e8eef6' });
    const t = readChartTheme(document.body);
    expect(t.accent).toBe('#e8eef6');
    expect(t.inset).toBe('#e8eef6');
  });

  it('survives a fully empty style (jsdom default) without empty strings', () => {
    stubTokens({});
    const t = readChartTheme(document.body);
    expect(t.text).toBe('currentColor');
    expect(t.warn).toBe('currentColor');
    expect(t.fontMono).toBe('monospace');
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest src/ui/timeline/chartTheme.test.ts` → FAIL (module not found).

- [ ] **Step 3: Implement `src/ui/timeline/chartTheme.ts`**

```ts
export interface ChartTheme {
  accent: string;
  text: string;
  textDim: string;
  warn: string;
  bad: string;
  good: string;
  inset: string;
  border: string;
  fontMono: string;
}

// DESIGN.md forbids restating colors outside theme.css, but uPlot paints into
// a canvas where CSS variables don't resolve. So we READ the tokens off the
// mounted element at runtime — theme.css stays the single source of truth and
// this file never hardcodes a hex. Empty reads (jsdom, or a missing token)
// fall back to the --text value so the chart degrades to monochrome rather
// than invisible.
export function readChartTheme(el: HTMLElement): ChartTheme {
  const style = getComputedStyle(el);
  const raw = (token: string) => style.getPropertyValue(token).trim();
  const text = raw('--text') || 'currentColor';
  const color = (token: string) => raw(token) || text;
  return {
    accent: color('--accent'),
    text,
    textDim: color('--text-dim'),
    warn: color('--warn'),
    bad: color('--bad'),
    good: color('--good'),
    inset: color('--inset'),
    border: color('--border'),
    fontMono: raw('--font-mono') || 'monospace',
  };
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest src/ui/timeline/chartTheme.test.ts` → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/ui/timeline/chartTheme.ts src/ui/timeline/chartTheme.test.ts
git commit -m "feat(ui): chart theme reader mapping CSS tokens to canvas colors"
```

---

### Task 4: `plugins.ts` — limiter rail + marker geometry and draw plugin

**Files:**
- Create: `src/ui/timeline/plugins.ts`
- Test: `src/ui/timeline/plugins.test.ts`

The geometry is exported as pure functions and tested directly; the run-coalescing and
`railKind` logic is ported behavior-for-behavior from `src/ui/WindowTimeline.tsx` (read it
before implementing — Task 7 deletes it, and these functions become the only copy). The
marker contract restated (v2 plan #3 depends on this wording): **a marker for every event
with non-empty windowIndexes and `severity !== 'info'`, placed at its first window's
center.** Worst moments get their own distinct marker shape. The uPlot plugin wraps the
geometry in a `draw` hook painting into the chart canvas — one paint surface, no SVG
overlay. The draw function is exercised here with a recording-ctx fake; the hook
registration itself is asserted via the mocked-uPlot options in Task 5.

- [ ] **Step 1: Write failing tests — `src/ui/timeline/plugins.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { buildEventMarkers, buildRailSegments, buildWorstMarkers, drawRail, RAIL_H } from './plugins';
import type { RailDrawTarget, RailPaint, TimelineMarker } from './plugins';
import type { ChartTheme } from './chartTheme';
import type { DiagEvent } from '../../types';
import { makeWindow, makeWindowAnalysis } from '../../causes/testkit';

const theme: ChartTheme = {
  accent: '#acc', text: '#txt', textDim: '#dim', warn: '#wrn', bad: '#bad',
  good: '#good', inset: '#ins', border: '#brd', fontMono: 'monospace',
};

function makeEvent(over: Partial<DiagEvent> = {}): DiagEvent {
  return { id: 'cpu-bound', type: 'cpuBottleneck', severity: 'warn', sentence: 'CPU held the GPU back.', sampleCount: 10, ...over };
}

// makeWindow(i, { durMs: 8000 }) default: window i spans i*8000 .. i*8000+6000 ms

describe('buildRailSegments', () => {
  it('emits nothing when every gameplay window is healthy (GPU-bound / capped)', () => {
    const segs = buildRailSegments([
      makeWindow(0, { limiter: 'gpu' }),
      makeWindow(1, { limiter: 'capped' }),
      makeWindow(2, { limiter: 'gpu' }),
    ]);
    expect(segs).toEqual([]);
  });

  it('coalesces a consecutive CPU-bound run into one segment', () => {
    const segs = buildRailSegments([
      makeWindow(0, { limiter: 'gpu' }),
      makeWindow(1, { limiter: 'cpu' }),
      makeWindow(2, { limiter: 'cpu' }),
      makeWindow(3, { limiter: 'gpu' }),
    ]);
    expect(segs).toEqual([{ kind: 'cpu', startMs: 8000, endMs: 22000 }]);
  });

  it('a healthy window between two CPU runs splits them', () => {
    const segs = buildRailSegments([
      makeWindow(0, { limiter: 'cpu' }),
      makeWindow(1, { limiter: 'gpu' }),
      makeWindow(2, { limiter: 'cpu' }),
    ]);
    expect(segs.map((s) => s.kind)).toEqual(['cpu', 'cpu']);
  });

  it('a throttle flag overrides the limiter, even when GPU-bound', () => {
    const segs = buildRailSegments([
      makeWindow(0, { limiter: 'gpu', metrics: { flagsFired: ['flag.cpu.thermalThrottle'] } }),
    ]);
    expect(segs).toEqual([{ kind: 'throttle', startMs: 0, endMs: 6000 }]);
  });

  it('maps underutilized to its own kind and never paints non-gameplay windows', () => {
    const segs = buildRailSegments([
      makeWindow(0, { limiter: 'underutilized' }),
      makeWindow(1, { activity: 'idle', limiter: 'cpu' }),
    ]);
    expect(segs).toEqual([{ kind: 'under', startMs: 0, endMs: 6000 }]);
  });

  it('handles empty input', () => {
    expect(buildRailSegments([])).toEqual([]);
  });
});

describe('buildEventMarkers', () => {
  const windows = [makeWindow(0), makeWindow(1), makeWindow(2)];

  it('places a marker at the FIRST listed window center, colored by severity', () => {
    const markers = buildEventMarkers([makeEvent({ severity: 'bad', windowIndexes: [1, 2] })], windows);
    // window 1 spans 8000–14000 ms → center 11000
    expect(markers).toEqual([{ ms: 11000, severity: 'bad', shape: 'event', label: 'CPU held the GPU back.' }]);
  });

  it('skips info events and events without window indexes', () => {
    const markers = buildEventMarkers([
      makeEvent({ severity: 'info', windowIndexes: [0] }),
      makeEvent({ windowIndexes: [] }),
      makeEvent({ windowIndexes: undefined }),
    ], windows);
    expect(markers).toEqual([]);
  });

  it('skips events pointing at a window the analysis does not have', () => {
    expect(buildEventMarkers([makeEvent({ windowIndexes: [99] })], windows)).toEqual([]);
  });

  it('handles empty inputs', () => {
    expect(buildEventMarkers([], [])).toEqual([]);
    expect(buildEventMarkers([makeEvent({ windowIndexes: [0] })], [])).toEqual([]);
  });
});

describe('buildWorstMarkers', () => {
  it('emits a distinct worst-shaped, bad-severity marker per worst moment', () => {
    const wa = makeWindowAnalysis([
      makeWindow(0, { limiter: 'gpu', metrics: { fpsAvg: 100 } }),
      makeWindow(1, { limiter: 'gpu', metrics: { fpsAvg: 100 } }),
      makeWindow(2, { limiter: 'cpu', metrics: { fpsAvg: 38 } }),
      makeWindow(3, { limiter: 'gpu', metrics: { fpsAvg: 100 } }),
    ]);
    const markers = buildWorstMarkers(wa.worst);
    expect(markers.length).toBe(wa.worst.length);
    expect(markers.length).toBeGreaterThan(0);
    for (const m of markers) {
      expect(m.shape).toBe('worst');
      expect(m.severity).toBe('bad');
      expect(m.label).toMatch(/worst moment: −\d+% FPS/);
    }
  });
});

describe('drawRail', () => {
  function recorder(width = 600) {
    const rects: { x: number; y: number; w: number; h: number; fill: string }[] = [];
    const paths: string[] = [];
    let fillStyle = '';
    const ctx = {
      save() {}, restore() {}, beginPath() {}, closePath() {}, moveTo() {}, lineTo() {},
      fill() { paths.push(fillStyle); },
      fillRect(x: number, y: number, w: number, h: number) { rects.push({ x, y, w, h, fill: fillStyle }); },
      set fillStyle(v: string) { fillStyle = v; },
      get fillStyle() { return fillStyle; },
    };
    const target: RailDrawTarget = {
      ctx: ctx as unknown as CanvasRenderingContext2D,
      bbox: { left: 0, top: 0, width, height: 200 },
      // 600 canvas px over 0–10 s
      valToPos: (sec: number) => sec * 60,
    };
    return { target, rects, paths };
  }

  it('paints the track, the segments, and the markers with theme colors', () => {
    const { target, rects, paths } = recorder();
    const markers: TimelineMarker[] = [
      { ms: 5000, severity: 'warn', shape: 'event', label: 'x' },
      { ms: 7000, severity: 'bad', shape: 'worst', label: 'y' },
    ];
    const paint: RailPaint = {
      segments: [{ kind: 'cpu', startMs: 2000, endMs: 6000 }, { kind: 'throttle', startMs: 8000, endMs: 9000 }],
      markers,
      theme,
    };
    drawRail(target, paint);

    const railY = 200 - RAIL_H;
    expect(rects[0]).toEqual({ x: 0, y: railY, w: 600, h: RAIL_H, fill: theme.inset }); // track
    expect(rects[1]).toEqual({ x: 120, y: railY, w: 240, h: RAIL_H, fill: theme.warn }); // cpu run
    expect(rects[2].fill).toBe(theme.bad); // throttle run
    expect(paths).toEqual([theme.warn, theme.bad]); // one fill per marker, severity-colored
  });

  it('paints only the track when there are no segments or markers', () => {
    const { target, rects, paths } = recorder();
    drawRail(target, { segments: [], markers: [], theme });
    expect(rects).toHaveLength(1);
    expect(paths).toHaveLength(0);
  });

  it('paints nothing on a degenerate bbox', () => {
    const { target, rects } = recorder(0);
    drawRail(target, { segments: [{ kind: 'cpu', startMs: 0, endMs: 1000 }], markers: [], theme });
    expect(rects).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest src/ui/timeline/plugins.test.ts` → FAIL (module not found).

- [ ] **Step 3: Implement `src/ui/timeline/plugins.ts`**

```ts
import type uPlot from 'uplot';
import type { DiagEvent, FlagKey, WindowClassification, WorstMoment } from '../../types';
import type { ChartTheme } from './chartTheme';

// Throttle/limit flags that mean the hardware was actually being held back (heat,
// power, current) — as opposed to GPU perf-limit "power/util" which is normal at load.
const THROTTLE_FLAGS = new Set<FlagKey>([
  'flag.cpu.thermalThrottle', 'flag.cpu.prochot', 'flag.cpu.ratl', 'flag.cpu.powerLimit',
  'flag.gpu.perfLimitThermal', 'flag.gpu.perfLimitCurrent',
]);

export type RailKind = 'throttle' | 'cpu' | 'under' | 'none';

export function railKind(w: WindowClassification): RailKind {
  if (w.activity !== 'gameplay') return 'none';
  if (w.metrics.flagsFired.some((f) => THROTTLE_FLAGS.has(f))) return 'throttle';
  if (w.limiter === 'cpu') return 'cpu';
  if (w.limiter === 'underutilized') return 'under';
  return 'none';
}

export interface RailSegment { kind: Exclude<RailKind, 'none'>; startMs: number; endMs: number; }

// Coalesce consecutive windows of the same rail kind; only non-'none' runs get
// drawn. Ported behavior-for-behavior from the old SVG WindowTimeline.
export function buildRailSegments(windows: WindowClassification[]): RailSegment[] {
  const segs: RailSegment[] = [];
  let run: { kind: RailKind; startMs: number; endMs: number } | null = null;
  for (const w of windows) {
    const kind = railKind(w);
    if (run && run.kind === kind) {
      run.endMs = w.window.endMs;
    } else {
      if (run && run.kind !== 'none') segs.push(run as RailSegment);
      run = { kind, startMs: w.window.startMs, endMs: w.window.endMs };
    }
  }
  if (run && run.kind !== 'none') segs.push(run as RailSegment);
  return segs;
}

export interface TimelineMarker {
  ms: number;                 // marker time = its window's center
  severity: 'warn' | 'bad';
  shape: 'event' | 'worst';   // diamonds for events, downward triangles for worst moments
  label: string;              // v2 plan #3 turns this into tooltip/annotation copy
}

// The marker contract (v2 plan #3 extends this seam — do not rename): a marker
// for every event with non-empty windowIndexes and severity !== 'info', placed
// at its first window's center.
export function buildEventMarkers(events: DiagEvent[], windows: WindowClassification[]): TimelineMarker[] {
  const byIndex = new Map(windows.map((w) => [w.window.index, w.window]));
  const out: TimelineMarker[] = [];
  for (const e of events) {
    if (e.severity === 'info') continue;
    if (!e.windowIndexes || e.windowIndexes.length === 0) continue;
    const w = byIndex.get(e.windowIndexes[0]);
    if (!w) continue;
    out.push({ ms: (w.startMs + w.endMs) / 2, severity: e.severity, shape: 'event', label: e.sentence });
  }
  return out;
}

export function buildWorstMarkers(worst: WorstMoment[]): TimelineMarker[] {
  return worst.map((wm) => {
    const w = wm.classification.window;
    return {
      ms: (w.startMs + w.endMs) / 2,
      severity: 'bad' as const,
      shape: 'worst' as const,
      label: `worst moment: −${Math.round(wm.fpsDropPct)}% FPS`,
    };
  });
}

export const RAIL_H = 8;
const MARK = 5;

export interface RailPaint { segments: RailSegment[]; markers: TimelineMarker[]; theme: ChartTheme; }

// The structural subset of a uPlot instance drawRail needs, so tests can pass
// a recording fake instead of a real canvas.
export interface RailDrawTarget {
  ctx: CanvasRenderingContext2D;
  bbox: { left: number; top: number; width: number; height: number };
  valToPos: (val: number, scale: string, canvasPx?: boolean) => number;
}

export function drawRail(u: RailDrawTarget, paint: RailPaint): void {
  const { ctx, bbox } = u;
  if (bbox.width <= 0 || bbox.height <= 0) return;
  // bbox and valToPos(…, true) are in canvas pixels, so CSS-pixel sizes scale by dpr
  const dpr = typeof devicePixelRatio === 'number' ? devicePixelRatio : 1;
  const railH = RAIL_H * dpr;
  const railY = bbox.top + bbox.height - railH;

  ctx.save();
  ctx.fillStyle = paint.theme.inset;
  ctx.fillRect(bbox.left, railY, bbox.width, railH);

  for (const seg of paint.segments) {
    const x0 = u.valToPos(seg.startMs / 1000, 'x', true);
    const x1 = u.valToPos(seg.endMs / 1000, 'x', true);
    ctx.fillStyle = seg.kind === 'throttle' ? paint.theme.bad : paint.theme.warn;
    ctx.fillRect(x0, railY, Math.max(x1 - x0, 1), railH);
  }

  for (const m of paint.markers) {
    const x = u.valToPos(m.ms / 1000, 'x', true);
    const s = MARK * dpr;
    ctx.fillStyle = m.severity === 'bad' ? paint.theme.bad : paint.theme.warn;
    ctx.beginPath();
    if (m.shape === 'worst') {
      // downward triangle sitting on the rail, as in the old SVG timeline
      ctx.moveTo(x - s, railY - s * 1.4);
      ctx.lineTo(x + s, railY - s * 1.4);
      ctx.lineTo(x, railY);
    } else {
      // diamond floating above the worst-moment ticks
      const cy = railY - s * 2.8;
      ctx.moveTo(x, cy - s);
      ctx.lineTo(x + s, cy);
      ctx.lineTo(x, cy + s);
      ctx.lineTo(x - s, cy);
    }
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

// One paint surface: the rail and markers go into the chart's own canvas via a
// draw hook, so there is no SVG overlay to keep scroll/zoom-synced.
export function railPlugin(paint: RailPaint): uPlot.Plugin {
  return { hooks: { draw: (u) => drawRail(u, paint) } };
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest src/ui/timeline/plugins.test.ts` → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/ui/timeline/plugins.ts src/ui/timeline/plugins.test.ts
git commit -m "feat(ui): timeline rail segments, event markers, and canvas draw plugin"
```

---

### Task 5: `Timeline.tsx` + `useUPlot.ts` — the interactive chart

**Files:**
- Create: `src/ui/timeline/_uplotMock.ts`
- Create: `src/ui/timeline/useUPlot.ts`
- Create: `src/ui/timeline/Timeline.tsx`
- Create: `src/ui/timeline/Timeline.css`
- Test: `src/ui/timeline/Timeline.test.tsx`

- [ ] **Step 1: Create the shared test stand-in — `src/ui/timeline/_uplotMock.ts`**

jsdom has no canvas, so every chart-rendering test replaces the `uplot` module with this
fake and asserts on the captured options object, firing hooks by hand (Design decision 9).

```ts
import { vi } from 'vitest';
import type uPlot from 'uplot';

// Usage in a test file:
//   vi.mock('uplot', async () => ({ default: (await import('./_uplotMock')).FakeUPlot }));
export const instances: FakeUPlot[] = [];

export function resetUplotMock(): void {
  instances.length = 0;
}

export class FakeUPlot {
  opts: uPlot.Options;
  data: uPlot.AlignedData;
  root = document.createElement('div');
  width: number;
  height: number;
  select = { left: 0, top: 0, width: 0, height: 0 };
  destroy = vi.fn();
  setSize = vi.fn();

  constructor(opts: uPlot.Options, data: uPlot.AlignedData, el: HTMLElement) {
    this.opts = opts;
    this.data = data;
    this.width = opts.width;
    this.height = opts.height;
    this.root.className = 'uplot';
    el.appendChild(this.root);
    instances.push(this);
  }

  // Linear pixel→value map over the x extent — all a setSelect hook needs.
  posToVal(pos: number, _scale: string): number {
    const xs = this.data[0] as number[];
    if (xs.length === 0) return 0;
    const x0 = xs[0];
    const x1 = xs[xs.length - 1];
    if (xs.length === 1 || this.width === 0) return x0;
    return x0 + (pos / this.width) * (x1 - x0);
  }

  fireSelect(left: number, width: number): void {
    this.select = { left, top: 0, width, height: this.height };
    for (const h of this.opts.hooks?.setSelect ?? []) h(this as unknown as uPlot);
  }
}
```

- [ ] **Step 2: Write failing tests — `src/ui/timeline/Timeline.test.tsx`**

```tsx
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Timeline } from './Timeline';
import { DECIMATE_TARGET } from './decimate';
import { instances, resetUplotMock } from './_uplotMock';
import { fixtureResult } from '../_fixtures';
import { makeLog, makeWindow, makeWindowAnalysis } from '../../causes/testkit';
import { computeStats } from '../../stats/percentiles';

vi.mock('uplot', async () => {
  const mock = await import('./_uplotMock');
  return { default: mock.FakeUPlot };
});

function stubTokens(map: Record<string, string>) {
  vi.spyOn(window, 'getComputedStyle').mockReturnValue({
    getPropertyValue: (name: string) => map[name] ?? '',
  } as unknown as CSSStyleDeclaration);
}

// 6 rows, one sample every 2 s, with FPS plus two chip sensors present.
function timedResult() {
  const series = [100, 98, 45, 40, 44, 99];
  const log = makeLog({
    sensors: {
      'gpu.temp': [70, 72, 80, 85, 84, 71],
      'cpu.usageTotal': [40, 45, 90, 95, 92, 41],
    },
    fps: { source: 'displayed', sourceLabel: 'Framerate Displayed (avg)', series, stats: computeStats(series) },
  });
  log.timesMs = [0, 2000, 4000, 6000, 8000, 10000];
  return fixtureResult({ log });
}

const noop = () => {};

beforeEach(() => resetUplotMock());
afterEach(() => vi.restoreAllMocks());

describe('Timeline', () => {
  it('builds x + FPS + the default sensor overlay as named-scale series', () => {
    render(<Timeline result={timedResult()} selection={null} onSelect={noop} onClear={noop} />);
    const u = instances[0];
    expect(u.opts.series).toHaveLength(3);
    expect(u.opts.series[1]).toMatchObject({ label: 'FPS', scale: 'fps' });
    expect(u.opts.series[2]).toMatchObject({ label: 'GPU temp', scale: 'c' });
    expect(u.data[0]).toEqual([0, 2, 4, 6, 8, 10]); // seconds
    expect(u.data[1]).toEqual([100, 98, 45, 40, 44, 99]);
  });

  it('omits the FPS series entirely when no framerate was logged', () => {
    const result = timedResult();
    result.log.fps = { ...result.log.fps, source: 'none', series: [], stats: null };
    render(<Timeline result={result} selection={null} onSelect={noop} onClear={noop} />);
    const u = instances[0];
    expect(u.opts.series).toHaveLength(2); // x + sensor only
    expect(u.opts.series[1].scale).toBe('c');
  });

  it('series strokes come from the CSS tokens', () => {
    stubTokens({ '--accent': 'rgb(59, 158, 255)', '--text': '#e8eef6', '--text-dim': '#9aa7b8' });
    render(<Timeline result={timedResult()} selection={null} onSelect={noop} onClear={noop} />);
    const u = instances[0];
    expect(u.opts.series[1].stroke).toBe('rgb(59, 158, 255)');
    expect(u.opts.series[2].stroke).toBe('#9aa7b8');
  });

  it('registers a setSelect hook that maps a brush to rows', () => {
    const onSelect = vi.fn();
    render(<Timeline result={timedResult()} selection={null} onSelect={onSelect} onClear={noop} />);
    const u = instances[0];
    expect(u.opts.hooks?.setSelect?.length).toBe(1);
    // 600 px chart over 0–10 s: px 120–480 = 2 s–8 s → rows 1–4
    u.fireSelect(120, 360);
    expect(onSelect).toHaveBeenCalledWith(1, 4);
  });

  it('a brush narrower than 4 px clears instead of selecting', () => {
    const onSelect = vi.fn();
    const onClear = vi.fn();
    render(<Timeline result={timedResult()} selection={null} onSelect={onSelect} onClear={onClear} />);
    instances[0].fireSelect(300, 3);
    expect(onClear).toHaveBeenCalled();
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('the From/To inputs drive the identical selection (keyboard path)', () => {
    const onSelect = vi.fn();
    render(<Timeline result={timedResult()} selection={null} onSelect={onSelect} onClear={noop} />);
    fireEvent.change(screen.getByLabelText(/^from/i), { target: { value: '0:02' } });
    fireEvent.change(screen.getByLabelText(/^to/i), { target: { value: '0:08' } });
    fireEvent.click(screen.getByRole('button', { name: /select range/i }));
    expect(onSelect).toHaveBeenCalledWith(1, 4);
  });

  it('rejects a malformed time without selecting', () => {
    const onSelect = vi.fn();
    render(<Timeline result={timedResult()} selection={null} onSelect={onSelect} onClear={noop} />);
    fireEvent.change(screen.getByLabelText(/^from/i), { target: { value: 'banana' } });
    fireEvent.change(screen.getByLabelText(/^to/i), { target: { value: '0:08' } });
    fireEvent.click(screen.getByRole('button', { name: /select range/i }));
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('switching the sensor chip rebuilds the chart on the new named scale', () => {
    render(<Timeline result={timedResult()} selection={null} onSelect={noop} onClear={noop} />);
    fireEvent.click(screen.getByRole('button', { name: 'CPU usage' }));
    expect(instances.length).toBeGreaterThan(1);
    const u = instances[instances.length - 1];
    expect(u.opts.series[2]).toMatchObject({ label: 'CPU usage', scale: 'pct' });
  });

  it('decimates logs above 20,000 rows', () => {
    const n = 30000;
    const log = makeLog({
      sensors: { 'gpu.temp': Array(n).fill(70) },
      fps: { source: 'displayed', sourceLabel: 'x', series: Array(n).fill(100) },
    });
    log.timesMs = Array.from({ length: n }, (_, i) => i * 100);
    render(<Timeline result={fixtureResult({ log })} selection={null} onSelect={noop} onClear={noop} />);
    expect(instances[0].data[0].length).toBeLessThanOrEqual(DECIMATE_TARGET);
  });

  it('exposes a text-summary aria-label on the chart container', () => {
    render(<Timeline result={timedResult()} selection={null} onSelect={noop} onClear={noop} />);
    expect(screen.getByRole('img').getAttribute('aria-label')).toMatch(/FPS avg \d+/);
  });

  it('says "no framerate logged" in the summary when FPS is absent', () => {
    const result = timedResult();
    result.log.fps = { ...result.log.fps, source: 'none', series: [], stats: null };
    render(<Timeline result={result} selection={null} onSelect={noop} onClear={noop} />);
    expect(screen.getByRole('img').getAttribute('aria-label')).toMatch(/no framerate logged/);
  });

  it('keeps the smooth-sailing caption when every window is healthy', () => {
    const windows = makeWindowAnalysis([
      makeWindow(0, { limiter: 'gpu', metrics: { fpsAvg: 100 } }),
      makeWindow(1, { limiter: 'capped', metrics: { fpsAvg: 100 } }),
    ]);
    render(<Timeline result={{ ...timedResult(), windows }} selection={null} onSelect={noop} onClear={noop} />);
    expect(screen.getByText(/smooth sailing/i)).toBeInTheDocument();
  });

  it('renders nothing without windows', () => {
    const { container } = render(
      <Timeline result={{ ...timedResult(), windows: makeWindowAnalysis([]) }} selection={null} onSelect={noop} onClear={noop} />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
```

- [ ] **Step 3: Run to verify failure**

Run: `npx vitest src/ui/timeline/Timeline.test.tsx` → FAIL (`./Timeline` not found).

- [ ] **Step 4: Implement `src/ui/timeline/useUPlot.ts`**

```ts
import { useEffect } from 'react';
import type { RefObject } from 'react';
import uPlot from 'uplot';

export interface ChartSpec { opts: uPlot.Options; data: uPlot.AlignedData }

// Owns the uPlot lifecycle. A `build` identity change (new log, new sensor
// chip) recreates the chart outright — construction is ~1 ms, far cheaper than
// diffing live options. Container width changes go through setSize.
export function useUPlot(
  ref: RefObject<HTMLDivElement>,
  build: (el: HTMLElement, width: number) => ChartSpec,
): void {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const { opts, data } = build(el, el.clientWidth || 600);
    const chart = new uPlot(opts, data, el);

    // jsdom has no ResizeObserver; in tests the chart keeps its mount width.
    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver((entries) => {
        const w = Math.round(entries[0].contentRect.width);
        if (w > 0 && w !== chart.width) chart.setSize({ width: w, height: opts.height });
      });
      ro.observe(el);
    }
    return () => {
      ro?.disconnect();
      chart.destroy();
    };
  }, [ref, build]);
}
```

- [ ] **Step 5: Implement `src/ui/timeline/Timeline.tsx`**

```tsx
import { useCallback, useMemo, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import type uPlot from 'uplot';
import type { AnalysisResult, CanonicalKey } from '../../types';
import { Button, Card } from '../primitives';
import { cx } from '../cx';
import { readChartTheme } from './chartTheme';
import { decimateRows, timeToRow } from './decimate';
import { buildEventMarkers, buildRailSegments, buildWorstMarkers, railPlugin } from './plugins';
import { useUPlot } from './useUPlot';
// vendor structural reset (cursor/select layer positioning), not our styling —
// DESIGN.md-compatible; all WTFPS styles live in Timeline.css as tokens.
import 'uplot/dist/uPlot.min.css';
import './Timeline.css';

interface SensorChip { key: CanonicalKey; label: string; scale: string }

// One overlay at a time keeps the chart legible; each chip declares a named
// uPlot scale per unit so a fan RPM never shares an axis with a temperature.
const SENSOR_CHIPS: SensorChip[] = [
  { key: 'gpu.temp', label: 'GPU temp', scale: 'c' },
  { key: 'cpu.tempPackage', label: 'CPU temp', scale: 'c' },
  { key: 'gpu.usage', label: 'GPU usage', scale: 'pct' },
  { key: 'cpu.usageTotal', label: 'CPU usage', scale: 'pct' },
  { key: 'pm.frameTimeMs', label: 'Frame time', scale: 'ms' },
  { key: 'gpu.clockEff', label: 'GPU clock', scale: 'mhz' },
  { key: 'fan.gpuRpm', label: 'GPU fan', scale: 'rpm' },
];

const CHART_H = 220;
const MIN_BRUSH_PX = 4;

const LIMITER_LABEL: Record<string, string> = {
  gpu: 'GPU-bound', cpu: 'CPU-bound', capped: 'at the FPS cap',
  underutilized: 'GPU underutilized', ambiguous: 'unclear', mixed: 'mixed',
};

export function fmtMmSs(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export function parseMmSs(text: string): number | null {
  const m = /^(\d+):([0-5]\d)$/.exec(text.trim());
  return m ? (Number(m[1]) * 60 + Number(m[2])) * 1000 : null;
}

interface TimelineProps {
  result: AnalysisResult;
  selection: { startRow: number; endRow: number } | null;
  onSelect: (startRow: number, endRow: number) => void;
  onClear: () => void;
}

export function Timeline({ result, selection, onSelect, onClear }: TimelineProps): JSX.Element | null {
  const { log, windows, events } = result;
  const containerRef = useRef<HTMLDivElement>(null);

  // Latest callbacks behind refs, so the brush handler baked into the uPlot
  // options never forces a chart rebuild.
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  const onClearRef = useRef(onClear);
  onClearRef.current = onClear;

  const chips = useMemo(
    () => SENSOR_CHIPS.filter((c) => (log.sensors[c.key]?.values.length ?? 0) > 0),
    [log],
  );
  const [chipKey, setChipKey] = useState<CanonicalKey | null>(null);
  const chip = chips.find((c) => c.key === chipKey) ?? chips[0] ?? null;

  const segments = useMemo(() => buildRailSegments(windows.windows), [windows]);

  const [fromText, setFromText] = useState('');
  const [toText, setToText] = useState('');

  const build = useCallback((el: HTMLElement, width: number) => {
    const theme = readChartTheme(el);
    const fpsSeries = log.fps.source === 'none' ? undefined : log.fps.series;
    const sensor = chip ? log.sensors[chip.key] : undefined;
    const rows = decimateRows(log.rowCount, [fpsSeries, sensor?.values]);

    const xs = rows.map((r) => (log.timesMs[r] ?? 0) / 1000);
    const ys: (number | null)[][] = [];
    const series: uPlot.Series[] = [{}];
    const axisFont = `11px ${theme.fontMono}`;
    const axes: uPlot.Axis[] = [{
      stroke: theme.textDim,
      font: axisFont,
      grid: { stroke: theme.border, width: 1 },
      ticks: { stroke: theme.border, width: 1 },
      values: (_u, ticks) => ticks.map((t) => fmtMmSs(t * 1000)),
    }];

    if (fpsSeries) {
      ys.push(rows.map((r) => fpsSeries[r] ?? null));
      series.push({ label: 'FPS', scale: 'fps', stroke: theme.accent, width: 1.5, spanGaps: false });
      axes.push({ scale: 'fps', stroke: theme.textDim, font: axisFont, grid: { show: false }, ticks: { stroke: theme.border, width: 1 } });
    }
    if (chip && sensor) {
      ys.push(rows.map((r) => sensor.values[r] ?? null));
      series.push({ label: chip.label, scale: chip.scale, stroke: theme.textDim, width: 1, spanGaps: false });
      axes.push({ scale: chip.scale, side: 1, stroke: theme.textDim, font: axisFont, grid: { show: false }, ticks: { stroke: theme.border, width: 1 } });
    }

    const paint = {
      segments,
      markers: [...buildEventMarkers(events, windows.windows), ...buildWorstMarkers(windows.worst)],
      theme,
    };

    const opts: uPlot.Options = {
      width,
      height: CHART_H,
      scales: { x: { time: false } },
      series,
      axes,
      legend: { show: false },
      // the brush selects a range; it must never zoom (zoom is out of scope)
      cursor: { drag: { x: true, y: false, setScale: false }, points: { show: false } },
      plugins: [railPlugin(paint)],
      hooks: {
        setSelect: [(u: uPlot) => {
          if (u.select.width < MIN_BRUSH_PX) {
            onClearRef.current();
            return;
          }
          const tA = u.posToVal(u.select.left, 'x') * 1000;
          const tB = u.posToVal(u.select.left + u.select.width, 'x') * 1000;
          const a = timeToRow(log.timesMs, tA);
          const b = timeToRow(log.timesMs, tB);
          onSelectRef.current(Math.min(a, b), Math.max(a, b));
        }],
      },
    };
    return { opts, data: [xs, ...ys] as uPlot.AlignedData };
  }, [log, chip, segments, events, windows]);

  useUPlot(containerRef, build);

  const ariaLabel = useMemo(() => {
    const fpsPart = log.fps.source !== 'none' && log.fps.stats
      ? `FPS avg ${Math.round(log.fps.stats.avg)}, range ${Math.round(log.fps.stats.min)} to ${Math.round(log.fps.stats.max)}`
      : 'no framerate logged';
    const dom = windows.timeSplit.dominant;
    const domPart = dom ? `; mostly ${LIMITER_LABEL[dom] ?? dom}` : '';
    const chipPart = chip ? `. Overlay: ${chip.label}` : '';
    return `Session timeline chart. ${fpsPart}${domPart}${chipPart}. Brush the chart or use the From/To fields to analyze a range.`;
  }, [log, windows, chip]);

  if (windows.windows.length === 0) return null;

  const submitRange = (e: FormEvent) => {
    e.preventDefault();
    const from = parseMmSs(fromText);
    const to = parseMmSs(toText);
    if (from === null || to === null) return;
    const t0 = log.timesMs[0] ?? 0;
    const a = timeToRow(log.timesMs, t0 + Math.min(from, to));
    const b = timeToRow(log.timesMs, t0 + Math.max(from, to));
    onSelect(Math.min(a, b), Math.max(a, b));
  };

  const caption = segments.length === 0
    ? 'No CPU-bound or throttling stretches — smooth sailing.'
    : 'Quiet stretches were GPU-bound or at your FPS cap — the healthy case.';

  return (
    <Card className="nerd-card">
      <h3 className="nerd-h">Session timeline</h3>
      {chips.length > 1 && (
        <div className="tl-chips" role="group" aria-label="Sensor overlay">
          {chips.map((c) => (
            <button
              key={c.key}
              type="button"
              className={cx('tl-chip', chip?.key === c.key && 'is-active')}
              aria-pressed={chip?.key === c.key}
              onClick={() => setChipKey(c.key)}
            >
              {c.label}
            </button>
          ))}
        </div>
      )}
      <div ref={containerRef} className="tl-chart" role="img" aria-label={ariaLabel} />
      <form className="tl-range" onSubmit={submitRange}>
        <label className="mono">
          From
          <input value={fromText} onChange={(e) => setFromText(e.target.value)} placeholder="0:00" size={5} />
        </label>
        <label className="mono">
          To
          <input value={toText} onChange={(e) => setToText(e.target.value)} placeholder="1:30" size={5} />
        </label>
        <Button type="submit" variant="subtle">Select range</Button>
        {selection && <Button variant="ghost" onClick={onClear}>Clear</Button>}
      </form>
      <div className="tl-legend">
        <span><i className="tl-legend__cpu" />CPU-bound</span>
        <span><i className="tl-legend__throttle" />Throttling</span>
        <span><i className="tl-legend__event" />Event</span>
        <span><i className="tl-legend__worst" />Worst moment</span>
      </div>
      <p className="tl-caption u-dim">{caption}</p>
    </Card>
  );
}
```

- [ ] **Step 6: Create `src/ui/timeline/Timeline.css`** (tokens only, per DESIGN.md)

```css
.tl-chart {
  width: 100%;
  background: var(--inset);
  border: 1px solid var(--border);
  border-radius: var(--r-md);
}

/* uPlot's select box is a bare div; tint it with the accent wash token */
.tl-chart .u-select {
  background: var(--accent-wash);
}

.tl-chips {
  display: flex;
  flex-wrap: wrap;
  gap: var(--s2);
  margin-bottom: var(--s3);
}
.tl-chip {
  font: inherit;
  font-size: var(--text-xs);
  color: var(--text-dim);
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: var(--r-pill);
  padding: var(--s1) var(--s3);
  cursor: pointer;
}
.tl-chip:hover {
  background: var(--surface-hover);
}
.tl-chip.is-active {
  color: var(--text);
  border-color: var(--accent);
}

.tl-range {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--s3);
  margin-top: var(--s3);
  font-size: var(--text-xs);
  color: var(--text-dim);
}
.tl-range label {
  display: inline-flex;
  align-items: center;
  gap: var(--s2);
}
.tl-range input {
  font: inherit;
  font-family: var(--font-mono);
  color: var(--text);
  background: var(--inset);
  border: 1px solid var(--border);
  border-radius: var(--r-sm);
  padding: var(--s1) var(--s2);
}

.tl-legend {
  display: flex;
  flex-wrap: wrap;
  gap: var(--s5);
  margin-top: var(--s3);
  font-size: var(--text-xs);
  color: var(--text-dim);
}
.tl-legend span {
  display: inline-flex;
  align-items: center;
  gap: var(--s2);
}
.tl-legend i {
  width: 14px;
  height: 3px;
  border-radius: var(--r-pill);
}
.tl-legend__cpu { background: var(--warn); }
.tl-legend__throttle { background: var(--bad); }
/* diamond, matching the in-canvas event markers */
.tl-legend__event {
  width: 8px;
  height: 8px;
  border-radius: 0;
  background: var(--warn);
  transform: rotate(45deg);
}
/* downward triangle, matching the in-canvas worst-moment ticks */
.tl-legend__worst {
  width: 0;
  height: 0;
  border-radius: 0;
  background: transparent;
  border-left: 5px solid transparent;
  border-right: 5px solid transparent;
  border-top: 7px solid var(--bad);
}

.tl-caption {
  margin-top: var(--s2);
  font-size: var(--text-xs);
}
```

- [ ] **Step 7: Run tests**

Run: `npx vitest src/ui/timeline/Timeline.test.tsx` → PASS. Also run `npm run build` — the `tsc -b` pass catches any uPlot typing friction now rather than in Task 7.

- [ ] **Step 8: Commit**

```bash
git add src/ui/timeline/_uplotMock.ts src/ui/timeline/useUPlot.ts src/ui/timeline/Timeline.tsx src/ui/timeline/Timeline.css src/ui/timeline/Timeline.test.tsx
git commit -m "feat(ui): interactive uPlot timeline with brush and keyboard range selection"
```

---

### Task 6: `SelectionPanel.tsx` — selection stats card

**Files:**
- Create: `src/ui/timeline/SelectionPanel.tsx`
- Create: `src/ui/timeline/SelectionPanel.css`
- Test: `src/ui/timeline/SelectionPanel.test.tsx`

This panel is the chart's **text alternative** (Design decisions 6–7): every number a
sighted user reads off the brushed region must exist here as real text. Solid `<Card>`,
mono/tabular figures, never translucent.

- [ ] **Step 1: Write failing tests — `src/ui/timeline/SelectionPanel.test.tsx`**

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SelectionPanel } from './SelectionPanel';
import { fixtureResult } from '../_fixtures';
import type { SelectionAnalysis, Stats } from '../../types';

function stats(over: Partial<Stats> = {}): Stats {
  return { count: 10, avg: 80, min: 60, max: 95, p5: 65, p95: 92, p99: 94, p1Low: 62, p5Low: 66, ...over };
}

function fixtureSelection(over: Partial<SelectionAnalysis> = {}): SelectionAnalysis {
  return {
    startRow: 1, endRow: 3, startMs: 2000, endMs: 6000,
    fps: stats({ avg: 71.5, p1Low: 44 }),
    sensors: { 'gpu.usage': stats({ avg: 99 }), 'cpu.usageTotal': stats({ avg: 52.5 }) },
    timeSplit: { gameplayMs: 4000, totalMs: 4000, shares: { gpu: 0.75, cpu: 0.25 }, dominant: 'gpu' },
    windowCount: 2,
    ...over,
  };
}

const noop = () => {};

describe('SelectionPanel', () => {
  it('renders duration, FPS stats, per-sensor rows, and time-split shares', () => {
    render(<SelectionPanel result={fixtureResult()} selection={fixtureSelection()} onClear={noop} />);
    expect(screen.getByText('0:02–0:06 (0:04)')).toBeInTheDocument();
    expect(screen.getByText('71.5')).toBeInTheDocument();   // FPS avg
    expect(screen.getByText('44')).toBeInTheDocument();     // FPS 1% low
    // sensor rows use the log's labels (the fixture log labels sensors by key)
    expect(screen.getByText('gpu.usage')).toBeInTheDocument();
    expect(screen.getByText('cpu.usageTotal')).toBeInTheDocument();
    expect(screen.getByText('99')).toBeInTheDocument();     // gpu.usage avg
    expect(screen.getByText('75%')).toBeInTheDocument();    // gpu share
    expect(screen.getByText('25%')).toBeInTheDocument();    // cpu share
  });

  it('fires onClear from the clear-selection button', () => {
    const onClear = vi.fn();
    render(<SelectionPanel result={fixtureResult()} selection={fixtureSelection()} onClear={onClear} />);
    fireEvent.click(screen.getByRole('button', { name: /clear selection/i }));
    expect(onClear).toHaveBeenCalledTimes(1);
  });

  it('shows "no framerate logged" when the selection has no FPS', () => {
    render(<SelectionPanel result={fixtureResult()} selection={fixtureSelection({ fps: null })} onClear={noop} />);
    expect(screen.getByText(/no framerate logged/i)).toBeInTheDocument();
  });

  it('explains a missing time split instead of inventing one', () => {
    render(
      <SelectionPanel
        result={fixtureResult()}
        selection={fixtureSelection({ timeSplit: null, windowCount: 0 })}
        onClear={noop}
      />,
    );
    expect(screen.getByText(/no analysis window fits fully inside/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest src/ui/timeline/SelectionPanel.test.tsx` → FAIL (module not found).

- [ ] **Step 3: Implement `src/ui/timeline/SelectionPanel.tsx`**

```tsx
import type { AnalysisResult, Limiter, SelectionAnalysis } from '../../types';
import { Button, Card } from '../primitives';
import { fmtMmSs } from './Timeline';
import './SelectionPanel.css';

const LIMITER_LABEL: Record<Limiter, string> = {
  gpu: 'GPU-bound', cpu: 'CPU-bound', capped: 'capped', underutilized: 'GPU underutilized',
  ambiguous: 'unclear', unknown: 'unclassified',
};

function n(x: number): string {
  return Number.isInteger(x) ? String(x) : x.toFixed(1);
}

interface SelectionPanelProps {
  result: AnalysisResult;
  selection: SelectionAnalysis;
  onClear: () => void;
}

// The text alternative for whatever the brush selected on the chart: every
// number a sighted user reads off the selection exists here as real text.
export function SelectionPanel({ result, selection, onClear }: SelectionPanelProps): JSX.Element {
  const baseMs = result.log.timesMs[0] ?? 0;

  // log.sensors insertion order keeps the rows stable across selections
  const sensorRows = Object.values(result.log.sensors).flatMap((sensor) => {
    const stats = sensor ? selection.sensors[sensor.key] : undefined;
    return sensor && stats ? [{ sensor, stats }] : [];
  });

  return (
    <Card className="nerd-card sel-panel">
      <div className="sel-panel__head">
        <h3 className="nerd-h">Selection</h3>
        <Button variant="subtle" onClick={onClear}>Clear selection</Button>
      </div>

      <dl className="nerd-dl mono">
        <div>
          <dt>Range</dt>
          <dd>{fmtMmSs(selection.startMs - baseMs)}–{fmtMmSs(selection.endMs - baseMs)} ({fmtMmSs(selection.endMs - selection.startMs)})</dd>
        </div>
        <div><dt>Rows</dt><dd>{selection.startRow}–{selection.endRow}</dd></div>
        {selection.fps ? (
          <>
            <div><dt>FPS avg</dt><dd>{n(selection.fps.avg)}</dd></div>
            <div><dt>FPS 1% low</dt><dd>{n(selection.fps.p1Low)}</dd></div>
          </>
        ) : (
          <div><dt>FPS</dt><dd className="u-dim">no framerate logged</dd></div>
        )}
      </dl>

      {sensorRows.length > 0 && (
        <table className="nerd-table mono">
          <thead>
            <tr>
              <th className="nerd-table__name">Sensor</th>
              <th>avg</th><th>min</th><th>max</th>
            </tr>
          </thead>
          <tbody>
            {sensorRows.map(({ sensor, stats }) => {
              const u = sensor.unit ? (sensor.unit === '%' ? '%' : ` ${sensor.unit}`) : '';
              return (
                <tr key={sensor.key}>
                  <th className="nerd-table__name" scope="row">{sensor.label}</th>
                  <td>{n(stats.avg)}{u}</td>
                  <td>{n(stats.min)}{u}</td>
                  <td>{n(stats.max)}{u}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      {selection.timeSplit ? (
        <>
          <ul className="sel-panel__split mono">
            {(Object.entries(selection.timeSplit.shares) as [Limiter, number][])
              .filter(([, share]) => share > 0)
              .map(([limiter, share]) => (
                <li key={limiter}>
                  <span>{LIMITER_LABEL[limiter]}</span>
                  <span>{Math.round(share * 100)}%</span>
                </li>
              ))}
          </ul>
          <p className="u-dim sel-panel__note">
            Across {selection.windowCount} analysis windows fully inside the selection.
          </p>
        </>
      ) : (
        <p className="u-dim sel-panel__note">
          Selection too short to attribute time — no analysis window fits fully inside.
        </p>
      )}
    </Card>
  );
}
```

- [ ] **Step 4: Create `src/ui/timeline/SelectionPanel.css`**

```css
.sel-panel__head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: var(--s4);
}
.sel-panel__head .nerd-h {
  margin-bottom: 0;
}

.sel-panel .nerd-dl {
  margin-top: var(--s4);
}
.sel-panel .nerd-table {
  margin-top: var(--s4);
}

.sel-panel__split {
  list-style: none;
  margin: var(--s4) 0 0;
  padding: 0;
  display: flex;
  flex-wrap: wrap;
  gap: var(--s4);
  font-size: var(--text-xs);
}
.sel-panel__split li {
  display: inline-flex;
  gap: var(--s2);
  color: var(--text-dim);
}
.sel-panel__split li span:last-child {
  color: var(--text);
}

.sel-panel__note {
  margin-top: var(--s2);
  font-size: var(--text-xs);
}
```

- [ ] **Step 5: Run tests**

Run: `npx vitest src/ui/timeline/SelectionPanel.test.tsx` → PASS.

- [ ] **Step 6: Commit**

```bash
git add src/ui/timeline/SelectionPanel.tsx src/ui/timeline/SelectionPanel.css src/ui/timeline/SelectionPanel.test.tsx
git commit -m "feat(ui): selection stats panel as the chart's text alternative"
```

---

### Task 7: NerdView integration + WindowTimeline removal

**Files:**
- Modify: `src/ui/NerdView.tsx`
- Modify: `src/ui/NerdView.test.tsx`
- Modify: `src/ui/NerdView.css`
- Delete: `src/ui/WindowTimeline.tsx`
- Delete: `src/ui/WindowTimeline.test.tsx`

Assertion migration ledger for `WindowTimeline.test.tsx` (verify each landed before
deleting): rail coalescing / throttle-overrides-limiter / healthy-windows-draw-nothing →
`plugins.test.ts` (Task 4); worst-moment markers → `plugins.test.ts` (Task 4); caption +
renders-nothing-without-windows → `Timeline.test.tsx` (Task 5).

- [ ] **Step 1: Write failing tests — replace `src/ui/NerdView.test.tsx` with:**

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { NerdView } from './NerdView';
import { analyze } from '../engine/analyze';
import { fixtureResult } from './_fixtures';
import { instances, resetUplotMock } from './timeline/_uplotMock';

vi.mock('uplot', async () => {
  const mock = await import('./timeline/_uplotMock');
  return { default: mock.FakeUPlot };
});

// A small but representative log: cpu/gpu temps + clocks + usage, both FPS columns,
// and two flag columns (one throttle, one perf-limit) with some "Yes" samples.
const csv = [
  'Date,Time,"Total CPU Usage [%]","CPU Package [°C]","Core Clocks (avg) [MHz]","GPU Temperature [°C]","GPU Hot Spot Temperature [°C]","GPU Core Load [%]","GPU Clock [MHz]","Framerate Displayed (avg) [FPS]","Framerate Presented (avg) [FPS]","Core Thermal Throttling (avg) [Yes/No]","Performance Limit - Utilization [Yes/No]",',
  '9.6.2026,12:00:00.000,45.0,70.0,4500.0,75.0,82.0,99.0,2400.0,120.0,122.0,No,Yes,',
  '9.6.2026,12:00:02.000,55.0,72.0,4600.0,77.0,85.0,98.0,2460.0,118.0,121.0,Yes,Yes,',
  '9.6.2026,12:00:04.000,50.0,71.0,4550.0,76.0,84.0,97.0,2430.0,119.0,120.0,Yes,Yes,',
].join('\n');

function build() {
  return analyze(new TextEncoder().encode(csv));
}

function timedFixture() {
  const result = fixtureResult();
  result.log.timesMs = [0, 2000, 4000, 6000, 8000];
  return result;
}

beforeEach(() => resetUplotMock());

describe('NerdView', () => {
  it('renders the per-sensor stats table with sensor labels', () => {
    render(<NerdView result={build()} />);
    expect(screen.getByText('Per-sensor statistics')).toBeInTheDocument();
    expect(screen.getByText('GPU Temperature')).toBeInTheDocument();
    expect(screen.getByText('CPU Package')).toBeInTheDocument();
  });

  it('shows the presented-vs-displayed framerate split', () => {
    render(<NerdView result={build()} />);
    expect(screen.getByText('Framerate detail')).toBeInTheDocument();
    expect(screen.getByText('Displayed avg')).toBeInTheDocument();
    expect(screen.getByText('Presented avg')).toBeInTheDocument();
  });

  it('counts throttle and performance-limit flags', () => {
    render(<NerdView result={build()} />);
    expect(screen.getByText('CPU Thermal Throttling')).toBeInTheDocument();
    expect(screen.getByText('GPU Perf Limit Utilization')).toBeInTheDocument();
    // thermal throttle fired on 2 of 3 samples
    expect(screen.getByText('2 of 3')).toBeInTheDocument();
  });

  it('nerd view shows timeline, worst moments, core grid and badges', () => {
    const result = timedFixture();
    result.log.cores = { usage: [{ label: 'Core 0 T0', coreType: 'std', coreIndex: 0, thread: 0, values: [50, 60] }], effectiveClock: [] };
    render(<NerdView result={result} />);
    expect(screen.getByText('Session timeline')).toBeInTheDocument();
    expect(screen.getByText('Worst moments')).toBeInTheDocument();
    expect(screen.getByText('Per-thread CPU usage')).toBeInTheDocument();
    expect(screen.getByText('Per-sensor statistics')).toBeInTheDocument();
  });

  it('brushing the timeline shows the selection panel; clearing hides it', () => {
    render(<NerdView result={timedFixture()} />);
    expect(screen.queryByText('Selection')).not.toBeInTheDocument();

    // 600 px chart over 0–8 s: px 150–450 = 2 s–6 s → rows 1–3
    act(() => instances[0].fireSelect(150, 300));
    expect(screen.getByText('Selection')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /clear selection/i }));
    expect(screen.queryByText('Selection')).not.toBeInTheDocument();
  });

  it('the From/To inputs reach the same selection panel (keyboard path)', () => {
    render(<NerdView result={timedFixture()} />);
    fireEvent.change(screen.getByLabelText(/^from/i), { target: { value: '0:02' } });
    fireEvent.change(screen.getByLabelText(/^to/i), { target: { value: '0:06' } });
    fireEvent.click(screen.getByRole('button', { name: /select range/i }));
    expect(screen.getByText('Selection')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest src/ui/NerdView.test.tsx` → FAIL (NerdView still renders `WindowTimeline`,
which creates no uPlot instance and no selection state, so the new flow tests fail).

- [ ] **Step 3: Modify `src/ui/NerdView.tsx`**

Replace the import block:

```tsx
import type { AnalysisResult, CanonicalKey, Stats } from '../types';
import { Card } from './primitives';
import { WindowTimeline } from './WindowTimeline';
```

with:

```tsx
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { AnalysisResult, CanonicalKey, Stats } from '../types';
import { computeSelection } from '../engine/selection';
import { Card } from './primitives';
import { Timeline } from './timeline/Timeline';
import { SelectionPanel } from './timeline/SelectionPanel';
```

Replace the `NerdView` function:

```tsx
export function NerdView({ result }: { result: AnalysisResult }): JSX.Element {
  return (
    <div className="nerd-view stack">
      <WindowTimeline result={result} />
      <WorstMoments worst={result.windows.worst} baseMs={result.windows.windows[0]?.window.startMs ?? 0} />
      <CoreGrid cores={result.log.cores} />
      <SensorTable result={result} />
      <div className="nerd-cols">
        <FpsDetail result={result} />
        <FlagTable result={result} />
      </div>
    </div>
  );
}
```

with:

```tsx
export function NerdView({ result }: { result: AnalysisResult }): JSX.Element {
  const [range, setRange] = useState<{ startRow: number; endRow: number } | null>(null);

  // a brushed range from one log is meaningless on the next
  useEffect(() => setRange(null), [result]);

  const onSelect = useCallback((startRow: number, endRow: number) => setRange({ startRow, endRow }), []);
  const onClear = useCallback(() => setRange(null), []);

  const selection = useMemo(
    () => (range ? computeSelection(result.log, result.windows, range.startRow, range.endRow) : null),
    [result, range],
  );

  return (
    <div className="nerd-view stack">
      <Timeline result={result} selection={range} onSelect={onSelect} onClear={onClear} />
      {selection && <SelectionPanel result={result} selection={selection} onClear={onClear} />}
      <WorstMoments worst={result.windows.worst} baseMs={result.windows.windows[0]?.window.startMs ?? 0} />
      <CoreGrid cores={result.log.cores} />
      <SensorTable result={result} />
      <div className="nerd-cols">
        <FpsDetail result={result} />
        <FlagTable result={result} />
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Delete the orphaned blocks from `src/ui/NerdView.css`**

Delete this entire run of rules (everything from `.nerd-spark` through `.nerd-legend i`;
nothing else in `src/` references these classes once `WindowTimeline.tsx` is gone):

```css
.nerd-spark {
  display: block;
  width: 100%;
  height: 120px;
  background: var(--inset);
  border: 1px solid var(--border);
  border-radius: var(--r-md);
}
.nerd-spark--timeline {
  height: 140px;
}
.wt-caption {
  margin-top: var(--s2);
  font-size: var(--text-xs);
}
/* downward triangle marker matching the in-chart worst-moment ticks */
.nerd-legend .wt-legend-mark {
  width: 0;
  height: 0;
  background: transparent;
  border-radius: 0;
  border-left: 5px solid transparent;
  border-right: 5px solid transparent;
  border-top: 7px solid var(--bad);
}
.nerd-legend {
  display: flex;
  gap: var(--s5);
  margin-top: var(--s3);
  font-size: 12px;
  color: var(--text-dim);
}
.nerd-legend span {
  display: inline-flex;
  align-items: center;
  gap: var(--s2);
}
.nerd-legend i {
  width: 14px;
  height: 3px;
  border-radius: var(--r-pill);
}
```

- [ ] **Step 5: Verify nothing else references the old component, then delete it**

```bash
grep -rn "WindowTimeline" src
# expect: hits only inside src/ui/WindowTimeline.tsx and src/ui/WindowTimeline.test.tsx
grep -rn "nerd-spark\|nerd-legend\|wt-" src
# expect: hits only inside the two files above (NerdView.css was cleaned in Step 4)
git rm src/ui/WindowTimeline.tsx src/ui/WindowTimeline.test.tsx
```

If either grep shows another consumer, stop and migrate it first — do not delete blind.

- [ ] **Step 6: Run the full suite and the build**

Run: `npx vitest src/ui/NerdView.test.tsx` → PASS. Then `npm run test` → full suite green
(including the `src/engine/` golden tests over `HWINFO samples/`). Then `npm run build` →
`tsc -b` strict typecheck + vite build clean.

- [ ] **Step 7: Commit**

```bash
git add src/ui/NerdView.tsx src/ui/NerdView.test.tsx src/ui/NerdView.css
git commit -m "feat(ui): brush-to-select selection flow in NerdView, retire SVG WindowTimeline"
```

---

## Verification

- [ ] `npm run test` — full suite green (engine tests under node, UI tests under jsdom).
- [ ] `npm run build` — `tsc -b` strict typecheck and vite production build pass.
- [ ] **Manual pass via `npm run dev` — this is the acceptance gate for rendering.** The
  jsdom tests mock the `uplot` module, so **real canvas rendering is NOT covered by the
  test suite at all**; nobody has seen the chart until this pass is done:
  - Drop a real log from `HWINFO samples/` and switch to Nerd mode.
  - The chart draws: FPS line in the accent blue, sensor overlay in the dim text color,
    the limiter/throttle rail along the bottom, diamond event markers and triangle
    worst-moment markers above it. **Confirm the chart colors match the theme** (if it
    renders in black/default colors, `readChartTheme` is not being applied).
  - Brush a range over a visibly rough stretch → the Selection panel appears.
    **Sanity-check the selection stats against the whole-log stats** (the Per-sensor
    statistics card): a calm slice should show better 1% lows than the whole log, a rough
    slice worse; sliced avg must sit between the slice's min and max.
  - Exercise the **From/To keyboard path**: type a `m:ss` range, hit "Select range",
    confirm the panel shows the identical result as brushing the same span.
  - A tiny brush (a few px) clears the selection; "Clear selection" does too.
  - Switch sensor chips; the right-hand axis and overlay swap, the FPS line is unchanged.
  - Resize the window — the chart follows its container width.
  - Enable OS reduced-motion and re-check: the chart is statically drawn (nothing to
    neutralize), and the global reduced-motion rules in `theme.css` are unaffected.
  - If a very long log is available (>20,000 rows), confirm it stays responsive and the
    line still shows isolated dips (decimation preserves spikes).

## Future / stretch

Explicitly out of scope now, mapped so v3 work has a seam to land on:

- **Multi-sensor overlay** — the per-unit named scales (`c`, `pct`, `ms`, `mhz`, `rpm`)
  already make a second simultaneous overlay possible; the chips would become toggles
  with a cap of 2–3 active series before legibility collapses.
- **Zoom persistence** — uPlot supports `setScale` zoom natively (we disabled it via
  `drag.setScale: false`); a zoom mode plus remembering the zoom window per session would
  reuse the existing `timeToRow` mapping unchanged.
- **Easy-mode mini-spark** — a tiny, static, non-interactive FPS sparkline on the hero
  card, fed by the same `decimateRows` output; deliberately excluded from Easy mode now
  to keep it short and reassuring.
- **Marker tooltips/annotations** — v2 plan #3, building directly on the
  `buildEventMarkers(events, windows)` seam and the `TimelineMarker.label` field locked
  in Task 4.

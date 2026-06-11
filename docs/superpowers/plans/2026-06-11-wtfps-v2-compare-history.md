# WTFPS v2 #1 — Before/After Compare + Session History Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Auto-save every analyzed run to `localStorage` as a slimmed summary, let the user rename/delete/reopen them, pick any two and get a plain-language before/after verdict: Easy side-by-side hero deltas with a headline, Nerd full per-stat delta table + event diff, and a stacked BEFORE/AFTER LLM digest with a generated delta summary.

**Architecture:** A pure additive layer on top of the existing engine — `analyze()` and the worker are untouched. A new `src/compare/` module owns the persisted form (`slimResult`: strips every row-aligned array from an `AnalysisResult`) and the pure diff (`compareRuns`: sensor/hero deltas with polarity, event diff keyed on `type:subtype`, mismatch detection, headline). `src/storage/runsStore.ts` persists `SavedRun[]` under `wtfps.runs.v1` with a 20-run FIFO cap, mirroring `specsStore`'s swallow-on-quota posture. `src/digest/compareDigest.ts` stacks the two **stored** digests under a generated delta-summary block. The UI gains a runs modal (`RunsPanel`), a read-only saved-run view, two compare components, and a three-state view machine in `src/App.tsx`.

```
analyze() ─► AnalysisResult ─► slimResult() ─► SlimResult ─► runsStore (wtfps.runs.v1, 20-run FIFO)
                                                                  │
                 RunsPanel (pick two) ◄── useRuns ◄── loadRuns ──┘
                        │
                        ▼
        compareRuns(before.result, after.result) ─► Comparison
                        │
        ┌───────────────┼──────────────────────────────┐
        ▼               ▼                              ▼
   CompareView     CompareTable (Nerd)      buildCompareDigest(before, after, comparison)
  (Easy hero Δ)   (per-stat Δ + event diff)   (Δ summary + stacked stored digests)
```

**Tech Stack:** TypeScript 5 strict, React 18, Vitest (node for `src/compare/`, jsdom for `src/storage/**` and `src/ui/**` per `vitest.config.ts`). No new dependencies.

**Spec:** `docs/superpowers/specs/2026-06-10-wtfps-before-after-compare-design.md` — read it first, then read the deviations below: the spec predates the v1.5 evidence engine and several of its assumptions no longer hold.

**Out of scope:** interactive timelines (#2 — needs raw samples, explicitly does NOT read saved runs); search/tags/pinning/bulk ops on the runs list; a `profile` option on `buildCompareDigest` (plan #5 adds it); a `useModal` focus-trap retrofit of `RunsPanel` (plan #6 adds it); an in-memory runs fallback when `localStorage` is unavailable (the list simply doesn't grow); any change to the analysis pipeline, `analyze()` signature, or the worker.

**Commit style:** single-line conventional commits, NO Co-Authored-By or any other trailer.

---

## Deviations from spec

The spec is implemented as written **except** for the following, all approved 2026-06-11:

1. **The spec's "~15 KB per run" claim is false post-v1.5.** Since the evidence engine landed, `AnalysisResult.log` carries row-aligned `values` arrays for ~40 sensor keys, `timesMs`, `fps.series` + `fps.clean`, boolean `flags` arrays, a per-thread `cores` matrix, and ~one `WindowClassification` per 5 s of log. Real runs serialize to **megabytes**, so 20 full runs cannot fit the ~5 MB `localStorage` quota. Runs are therefore slimmed before save. Task 1 includes a one-off measurement step (temporary test, deleted after recording the numbers) to pin the real size, plus a permanent size-bound test on the slim form.
2. **New persisted form `SlimResult`** via `slimResult(r: AnalysisResult): SlimResult` in new `src/compare/slim.ts`. It mirrors `AnalysisResult` but: discriminant `slim: true`; every `log.sensors[*].values → []` (key/label/unit kept); `log.flags` replaced by `flagCounts: Partial<Record<FlagKey, { fired, total }>>`; `log.timesMs → []`; `log.cores → null`; `fps.series`/`fps.clean → []` (all scalar `FpsData` fields + `stats` kept); `windows.windows → []` — kept: `timeSplit`, `worst`, `windowMs`, `lowConfidence`, `activityKind`; added: `durationMs` (from `timeSplit.totalMs`). Everything diffable survives: `stats`, `events`, `verdict`, `digest` strings, time split, worst moments. A test pins the slim form of a synthetic 2,000-row log at ≤ ~40 KB.
3. **Reopening a saved run is a read-only summary view** (`src/ui/SavedRunView.tsx`): hero/verdict/findings/time-split/worst/digest render from stored data; Nerd extras that need raw arrays (timeline, CoreGrid, per-flag sample lists, full sensor table) are replaced by a "re-drop the CSV for full detail" notice. `DigestPanel` in saved mode shows the **stored** digest verbatim with goal editing disabled.
4. **Diff model additions:** `Comparison` gains `timeSplitDelta: { before: TimeSplit; after: TimeSplit; dominantChanged: boolean }`; `Mismatch['kind']` is `'cpu' | 'gpu' | 'fpsSource' | 'duration' | 'activityKind'` (the 5th kind is new); duration mismatch compares `windows.timeSplit.totalMs` (NOT `rowCount × pollMs` — logging gaps make that wrong); the FPS-source comparison handles the `'legacy'` source value the spec didn't know about.
5. **`DiagEvent` gains optional `subtype?: string`.** `causeThermalCollapse` sets `'cpu-thermal'` / `'gpu-thermal'` so the event diff can tell "CPU throttling resolved" from "GPU throttling introduced". The event diff keys on `` `${type}:${subtype ?? ''}` `` → `resolved` / `introduced` / `persisted`.
6. **Polarity table** (in `src/compare/diff.ts`): *lower-better* = all temps (`cpu.tempPackage`, `cpu.tempCoreMax`, `cpu.tempCoreAvg`, `gpu.temp`, `gpu.hotspot`, `gpu.memJunction`, `igpu.temp`), `cpu.power`/`gpu.power`, `ram.loadPct`, `pagefile.usagePct`, `pm.frameTimeMs`, `rtss.frameTimeMs`, and flag fired-counts; *higher-better* = FPS avg + 1%/5% lows; *neutral* (Δ shown, no color) = usages, clocks, voltages, fans, VRAM MB, PresentMon busy/wait, `gpu.powerLimit`. Hero deltas are computed from `stats` / `fps.stats` following the same fallback chains `buildVerdict`'s hero tiles use (`src/verdict/buildVerdict.ts`) — **never** parsed back out of `verdict.hero` display strings.
7. **Fixed caveat always present:** HWiNFO logs carry no game/scene identity, so every comparison carries "confirm both runs were the same workload". Because the `Mismatch['kind']` union is locked by the cross-plan contract (no slot for a sixth kind), the caveat is a dedicated always-set `Comparison.caveat` field; the UI banner and both digests render it alongside the mismatches.

Minor refinements forced by the above (not in the spec):

- `compareRuns(before: SlimResult, after: SlimResult)` is pure over results, so `Comparison.before/after` are the `SlimResult`s, not `SavedRun`s. Run identity (names, dates) travels separately: the compare view state in `App.tsx` is `{ kind: 'compare'; before: SavedRun; after: SavedRun; comparison: Comparison }`, which is also exactly what `buildCompareDigest(before: SavedRun, after: SavedRun, comparison, opts?)` needs.
- `SensorDelta` gains `unit: string | null` and `stat: DeltaStat` fields (the Nerd table is per-*stat*, and formatting needs units); its `key` is `string` because FPS rows and flag rows are not `CanonicalKey`s.
- `SlimWindows` keeps one extra scalar, `logStartMs` (first window's `startMs`), because rendering stored worst-moments offsets needs the log's time origin once `windows.windows` is emptied.
- The spec says wiring goes in `src/ui/App.tsx` — that path is stale; the component lives at **`src/App.tsx`**.
- The landing screen gets a "Saved runs (N)" button when history exists — without it, history would only be reachable after analyzing a new log.

## Cross-plan contract (sibling v2 plans reference these names — match EXACTLY)

`SlimResult`, `SavedRun`, `slimResult`, `compareRuns`, `buildCompareDigest(before, after, comparison, opts?: { goal?: string })`, `DiagEvent.subtype`, `RunsPanel`. Plan #5 later adds a `profile` option to `buildCompareDigest`; plan #6 retrofits `RunsPanel` with a `useModal` hook — do **not** implement those here.

---

## File map

| File | Action | Responsibility |
|---|---|---|
| `src/types.ts` | modify | `SlimResult` family, `SavedRun`, delta/diff/comparison contracts, `DiagEvent.subtype` |
| `src/compare/slim.ts` | create | `slimResult(r: AnalysisResult): SlimResult` |
| `src/compare/slim.test.ts` | create | structure, size bound, JSON round-trip |
| `src/storage/runsStore.ts` | create | `wtfps.runs.v1` CRUD, auto-name, 20-run FIFO, quota-swallow |
| `src/storage/runsStore.test.ts` | create | jsdom: CRUD, eviction, malformed JSON, quota throw |
| `src/compare/testkit.ts` | create | `makeSlim` / `makeSavedRun` / `stat` builders for tests |
| `src/compare/diff.ts` | create | deltas + polarity, event diff, mismatches, headline, `compareRuns` |
| `src/compare/diff.test.ts` | create | polarity/fallback/null/event/mismatch/headline tests |
| `src/causes/events.ts` | modify | `makeEvent` forwards `subtype` |
| `src/causes/events.test.ts` | modify | subtype passthrough test |
| `src/causes/thermalCollapse.ts` | modify | `'cpu-thermal'` / `'gpu-thermal'` subtypes |
| `src/causes/thermalCollapse.test.ts` | modify | subtype assertions |
| `src/digest/compareDigest.ts` | create | `buildCompareDigest` — Δ summary + stacked stored digests |
| `src/digest/compareDigest.test.ts` | create | block structure, goal handling, token estimate |
| `src/ui/useRuns.ts` | create | runs list state hook over `runsStore` |
| `src/ui/useRuns.test.ts` | create | hook behavior (jsdom, `renderHook`) |
| `src/ui/compareFormat.ts` | create | shared value/delta/timestamp formatting + row class helper |
| `src/ui/RunsPanel.tsx` / `.css` / `.test.tsx` | create | runs modal: select-two→Compare, rename, delete, clear, reopen |
| `src/ui/CompareView.tsx` / `.css` / `.test.tsx` | create | Easy `BEFORE\|AFTER\|Δ` hero rows + headline + warn banner + swap/exit |
| `src/ui/CompareTable.tsx` / `.css` / `.test.tsx` | create | Nerd per-stat delta table + event-diff breakdown |
| `src/ui/DigestPanel.tsx` | modify | discriminated `source` prop: live / saved / compare |
| `src/ui/DigestPanel.test.tsx` | modify | source prop + saved/compare mode tests |
| `src/ui/SavedRunView.tsx` / `.css` / `.test.tsx` | create | read-only saved-run summary view |
| `src/App.tsx` | modify | view state machine, auto-save effect, RunsPanel trigger |
| `src/engine/compare.golden.test.ts` | create | real same-machine A16 Superposition pair, end to end |

Run all tests with `npm run test`; a single file with `npx vitest src/compare/diff.test.ts`. Typecheck happens inside `npm run build` (`tsc -b`).

---

### Task 1: Types + `slimResult` (+ size measurement)

**Files:**
- Modify: `src/types.ts`
- Create: `src/compare/slim.ts`
- Test: `src/compare/slim.test.ts`

- [ ] **Step 1: Add the new contracts to `src/types.ts`**

Change `DiagEvent` in place (only the `subtype` line is new):

```ts
export type Severity = 'info' | 'warn' | 'bad';
export interface DiagEvent {
  id: string; type: string; severity: Severity; sentence: string; fix?: string; sampleCount: number;
  subtype?: string;                 // analyzer-specific variant (e.g. 'gpu-thermal'); the compare event diff keys on it
  evidence?: Evidence;
  windowIndexes?: number[];
}
```

Append after `AnalysisResult` at the end of the file:

```ts
// ---- saved runs & before/after compare (v2 #1) ----

export interface FlagCount { fired: number; total: number; }

// What a saved run keeps of NormalizedLog: every row-aligned array emptied.
// Sensor entries survive as metadata (label/unit) with empty values; flags shrink
// to fired/total counts; timesMs/cores keep their slots but carry nothing.
export interface SlimLog {
  rowCount: number;
  pollMs: number;
  specs: InferredSpecs;
  sensors: Partial<Record<CanonicalKey, NumericSensor>>;   // values always []
  flagCounts: Partial<Record<FlagKey, FlagCount>>;
  fps: FpsData;                                            // series/clean always []
  unknownColumns: string[];
  timesMs: number[];                                       // always []
  cores: null;                                             // always null
}

export interface SlimWindows {
  windows: WindowClassification[];  // always [] — the per-window array is the big payload
  timeSplit: TimeSplit;
  worst: WorstMoment[];
  windowMs: number;
  lowConfidence: boolean;
  activityKind: 'gameplay' | 'workload';
  logStartMs: number;               // first window's startMs — worst-moment offsets count from it
}

export interface SlimResult {
  slim: true;                       // discriminant vs AnalysisResult
  log: SlimLog;
  stats: Partial<Record<CanonicalKey, Stats>>;
  events: DiagEvent[];
  verdict: Verdict;
  digest: Digest;                   // stored verbatim; saved/compare views re-show it
  windows: SlimWindows;
  durationMs: number;               // timeSplit.totalMs at save time
}

export interface SavedRun { id: string; name: string; createdAt: number; result: SlimResult; }

export type DeltaDirection = 'up' | 'down' | 'flat';
export type DeltaPolarity = 'improved' | 'worse' | 'neutral' | 'unknown';
export type DeltaStat = 'avg' | 'max' | 'p1Low' | 'p5Low' | 'fired';

export interface SensorDelta {
  key: string;                      // CanonicalKey, FlagKey, or 'fps'
  label: string;
  unit: string | null;
  stat: DeltaStat;
  before: number | null;
  after: number | null;
  delta: number | null;             // after − before; null when either side is missing
  direction: DeltaDirection;        // 'flat' when the change sits below the significance floor
  polarity: DeltaPolarity;
}

export interface EventDiff { resolved: DiagEvent[]; introduced: DiagEvent[]; persisted: DiagEvent[]; }

export type MismatchKind = 'cpu' | 'gpu' | 'fpsSource' | 'duration' | 'activityKind';
export interface Mismatch { kind: MismatchKind; message: string; }

export interface TimeSplitDelta { before: TimeSplit; after: TimeSplit; dominantChanged: boolean; }

export interface Comparison {
  before: SlimResult;
  after: SlimResult;
  heroDeltas: SensorDelta[];        // the 5 hero rows (Easy view)
  sensorDeltas: SensorDelta[];      // full table: fps rows + per-sensor avg/max + flag counts
  eventDiff: EventDiff;
  mismatches: Mismatch[];
  timeSplitDelta: TimeSplitDelta;
  headline: string;
  caveat: string;                   // fixed same-workload caveat, always present
}
```

- [ ] **Step 2: Write the failing tests** — create `src/compare/slim.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { slimResult } from './slim';
import { makeLog } from '../causes/testkit';
import { buildWindowAnalysis } from '../windows';
import { computeStats } from '../stats/percentiles';
import { buildVerdict } from '../verdict/buildVerdict';
import { buildDigest } from '../digest/digest';
import type { AnalysisResult, CanonicalKey, Stats } from '../types';

const ROWS = 2000;
const ramp = (base: number, amp: number) =>
  Array.from({ length: ROWS }, (_, i) => base + amp * Math.sin(i / 50));

// A deliberately fat result: ~13 sensors, a 32-series core matrix, fps series,
// a flag column and 2000 rows — the shape that blew the spec's 15 KB estimate.
function fatResult(): AnalysisResult {
  const sensors: Partial<Record<CanonicalKey, number[]>> = {
    'cpu.tempPackage': ramp(70, 10), 'cpu.tempCoreMax': ramp(75, 12), 'cpu.usageTotal': ramp(40, 20),
    'cpu.clock': ramp(4200, 300), 'cpu.power': ramp(80, 30),
    'gpu.temp': ramp(72, 8), 'gpu.hotspot': ramp(85, 10), 'gpu.usage': ramp(95, 4),
    'gpu.clock': ramp(2500, 100), 'gpu.power': ramp(120, 20),
    'ram.loadPct': ramp(60, 5), 'pm.frameTimeMs': ramp(8.3, 1), 'vram.d3dDedicatedMb': ramp(6000, 200),
  };
  const fpsSeries = ramp(120, 15);
  const log = makeLog({
    sensors,
    flags: { 'flag.gpu.perfLimitPower': Array.from({ length: ROWS }, (_, i) => i % 7 === 0) },
    fps: {
      source: 'displayed', sourceLabel: 'Framerate Displayed (avg)',
      series: fpsSeries, clean: fpsSeries, stats: computeStats(fpsSeries),
    },
  });
  log.timesMs = Array.from({ length: ROWS }, (_, i) => i * 2000);
  log.cores = {
    usage: Array.from({ length: 16 }, (_, t) => ({
      label: `Core ${t} T0`, coreType: 'std' as const, coreIndex: t, thread: 0, values: ramp(50, 30),
    })),
    effectiveClock: Array.from({ length: 16 }, (_, t) => ({
      label: `Core ${t} T0`, coreType: 'std' as const, coreIndex: t, thread: 0, values: ramp(4000, 500),
    })),
  };
  const stats: Partial<Record<CanonicalKey, Stats>> = {};
  for (const key of Object.keys(log.sensors) as CanonicalKey[]) {
    stats[key] = computeStats(log.sensors[key]!.values);
  }
  const windows = buildWindowAnalysis(log);
  const verdict = buildVerdict(log, stats, [], windows);
  const digest = buildDigest({ log, stats, events: [], windows, guidance: verdict.guidance });
  return { log, stats, events: [], verdict, digest, windows };
}

describe('slimResult', () => {
  const full = fatResult();
  const slim = slimResult(full);

  it('strips every row-aligned array but keeps sensor metadata', () => {
    expect(slim.slim).toBe(true);
    for (const s of Object.values(slim.log.sensors)) {
      expect(s!.values).toEqual([]);
      expect(s!.key.length).toBeGreaterThan(0);
    }
    expect(slim.log.sensors['gpu.temp']?.label).toBe(full.log.sensors['gpu.temp']!.label);
    expect(slim.log.fps.series).toEqual([]);
    expect(slim.log.fps.clean).toEqual([]);
    expect(slim.log.fps.stats).toEqual(full.log.fps.stats);   // scalars survive
    expect(slim.log.fps.source).toBe('displayed');
  });

  it('replaces flags with fired/total counts', () => {
    // i % 7 === 0 over 2000 rows fires 286 times
    expect(slim.log.flagCounts['flag.gpu.perfLimitPower']).toEqual({ fired: 286, total: 2000 });
  });

  it('keeps the diffable window summary and adds durationMs + logStartMs', () => {
    expect(slim.windows.timeSplit).toEqual(full.windows.timeSplit);
    expect(slim.windows.worst).toEqual(full.windows.worst);
    expect(slim.windows.activityKind).toBe(full.windows.activityKind);
    expect(slim.windows.logStartMs).toBe(full.windows.windows[0]!.window.startMs);
    expect(slim.durationMs).toBe(full.windows.timeSplit.totalMs);
    // the big per-row/per-window payloads keep their slots but carry nothing
    expect(slim.windows.windows).toEqual([]);
    expect(slim.log.timesMs).toEqual([]);
    expect(slim.log.cores).toBeNull();
  });

  it('keeps stats, events, verdict and digest verbatim', () => {
    expect(slim.stats).toEqual(full.stats);
    expect(slim.verdict).toEqual(full.verdict);
    expect(slim.digest).toEqual(full.digest);
  });

  it('fits the storage budget: ≤ 40 KB for a 2000-row log, ≥ 20× smaller than full', () => {
    const fullLen = JSON.stringify(full).length;
    const slimLen = JSON.stringify(slim).length;
    expect(slimLen).toBeLessThan(40_000);
    expect(slimLen * 20).toBeLessThan(fullLen);
  });

  it('survives a JSON round-trip unchanged', () => {
    expect(JSON.parse(JSON.stringify(slim))).toEqual(slim);
  });
});
```

- [ ] **Step 3: Run to verify failure**

Run: `npx vitest src/compare/slim.test.ts` → FAIL (`./slim` not found).

- [ ] **Step 4: Implement `src/compare/slim.ts`**

```ts
import type { AnalysisResult, CanonicalKey, FlagKey, SlimLog, SlimResult } from '../types';

// The persisted form of an AnalysisResult. Everything row-aligned is dropped so 20
// runs fit localStorage; everything the verdict/digest/compare surfaces read survives.
export function slimResult(r: AnalysisResult): SlimResult {
  const sensors: SlimLog['sensors'] = {};
  for (const key of Object.keys(r.log.sensors) as CanonicalKey[]) {
    const s = r.log.sensors[key];
    if (s) sensors[key] = { key: s.key, label: s.label, unit: s.unit, values: [] };
  }

  const flagCounts: SlimLog['flagCounts'] = {};
  for (const key of Object.keys(r.log.flags) as FlagKey[]) {
    const f = r.log.flags[key];
    if (f) flagCounts[key] = { fired: f.values.filter(Boolean).length, total: f.values.length };
  }

  return {
    slim: true,
    log: {
      rowCount: r.log.rowCount,
      pollMs: r.log.pollMs,
      specs: r.log.specs,
      sensors,
      flagCounts,
      fps: { ...r.log.fps, series: [], clean: [] },
      unknownColumns: r.log.unknownColumns,
      timesMs: [],
      cores: null,
    },
    stats: r.stats,
    events: r.events,
    verdict: r.verdict,
    digest: r.digest,
    windows: {
      windows: [],
      timeSplit: r.windows.timeSplit,
      worst: r.windows.worst,
      windowMs: r.windows.windowMs,
      lowConfidence: r.windows.lowConfidence,
      activityKind: r.windows.activityKind,
      logStartMs: r.windows.windows[0]?.window.startMs ?? 0,
    },
    durationMs: r.windows.timeSplit.totalMs,
  };
}
```

- [ ] **Step 5: Run tests**

Run: `npx vitest src/compare/slim.test.ts` → PASS. Also `npm run build` → exits 0 (the new types compile; nothing existing consumed them yet).

- [ ] **Step 6: One-off size measurement (temporary file — DELETE before committing)**

Create `src/compare/slim.size.probe.test.ts`:

```ts
// TEMPORARY probe: pins the real serialized size of a full AnalysisResult to justify
// SlimResult. Run once, record the printed numbers in the task notes, then DELETE
// this file — it asserts nothing useful long-term and reads multi-MB samples.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { analyze } from '../engine/analyze';
import { slimResult } from './slim';

describe('size probe (temporary)', () => {
  it('logs full vs slim serialized sizes for two real samples', () => {
    for (const rel of ['Intel + Nvidia/KaiC_NTE_undervolt-65_.CSV', 'Intel + Nvidia/KaiC_ItTakesTwo.CSV']) {
      const r = analyze(new Uint8Array(readFileSync(join(process.cwd(), 'HWINFO samples', rel))));
      const full = JSON.stringify(r).length;
      const slim = JSON.stringify(slimResult(r)).length;
      console.log(`${rel}: full ${(full / 1024).toFixed(0)} KB, slim ${(slim / 1024).toFixed(0)} KB`);
      expect(full).toBeGreaterThan(200_000);   // the spec's "~15 KB" claim is dead
      expect(slim).toBeLessThan(60_000);       // real logs carry more sensors than the synthetic one
    }
  });
});
```

Run: `npx vitest src/compare/slim.size.probe.test.ts` → PASS; record the two printed `full`/`slim` numbers in the task notes (expect `full` in the hundreds of KB for KaiC_NTE and several MB for ItTakesTwo; `slim` tens of KB). If `slim` exceeds its bound, a row-aligned array escaped `slimResult` — find it, don't raise the bound. Then **delete `src/compare/slim.size.probe.test.ts`**.

- [ ] **Step 7: Commit**

```bash
git add src/types.ts src/compare/slim.ts src/compare/slim.test.ts
git commit -m "feat(compare): compare contracts and slimResult persisted run form"
```

---

### Task 2: `runsStore` — persisted runs CRUD

**Files:**
- Create: `src/storage/runsStore.ts`
- Test: `src/storage/runsStore.test.ts` (jsdom via the `src/storage/**` glob)

- [ ] **Step 1: Write failing tests** — create `src/storage/runsStore.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { analyze } from '../engine/analyze';
import { saveRun, loadRuns, renameRun, deleteRun, clearRuns } from './runsStore';

const tinyCsv = [
  'Date,Time,"Total CPU Usage [%]","CPU Package [°C]","GPU Temperature [°C]","GPU Core Load [%]","Framerate Displayed (avg) [FPS]",',
  '9.6.2026,12:00:00.000,45.0,70.0,75.0,99.0,120.0,',
  '9.6.2026,12:00:02.000,55.0,72.0,77.0,98.0,118.0,',
].join('\n');
const result = analyze(new TextEncoder().encode(tinyCsv));

beforeEach(() => localStorage.clear());
afterEach(() => vi.restoreAllMocks());

describe('runsStore', () => {
  it('saveRun returns a SavedRun with a slim result and persists it', () => {
    const run = saveRun(result, 'undervolt test');
    expect(run).not.toBeNull();
    expect(run!.name).toBe('undervolt test');
    expect(run!.result.slim).toBe(true);
    expect(run!.result.log.fps.series).toEqual([]);
    const loaded = loadRuns();
    expect(loaded).toHaveLength(1);
    expect(loaded[0]).toEqual(run);
  });

  it('auto-names from gpuModelGuess ?? "Run" plus HH:MM', () => {
    // tinyCsv has no HWiNFO trailer, so gpuModelGuess is null → 'Run'
    const run = saveRun(result)!;
    expect(run.name).toMatch(/^Run — \d{2}:\d{2}$/);
  });

  it('renameRun, deleteRun and clearRuns round-trip through storage', () => {
    const a = saveRun(result, 'a')!;
    const b = saveRun(result, 'b')!;
    renameRun(a.id, 'renamed');
    expect(loadRuns().find((r) => r.id === a.id)?.name).toBe('renamed');
    deleteRun(b.id);
    expect(loadRuns().map((r) => r.id)).toEqual([a.id]);
    clearRuns();
    expect(loadRuns()).toEqual([]);
  });

  it('renaming an unknown id is a harmless no-op', () => {
    saveRun(result, 'only');
    renameRun('nope', 'x');
    expect(loadRuns()[0].name).toBe('only');
  });

  it('keeps the 20 most recent: the 21st save evicts the oldest', () => {
    for (let i = 0; i < 21; i++) saveRun(result, `run-${i}`);
    const runs = loadRuns();
    expect(runs).toHaveLength(20);
    expect(runs[0].name).toBe('run-1');           // run-0 fell off the front
    expect(runs[19].name).toBe('run-20');
  });

  it('tolerates malformed storage: bad JSON, non-array, invalid entries', () => {
    localStorage.setItem('wtfps.runs.v1', '{not json');
    expect(loadRuns()).toEqual([]);
    localStorage.setItem('wtfps.runs.v1', JSON.stringify({ nope: 1 }));
    expect(loadRuns()).toEqual([]);
    localStorage.setItem('wtfps.runs.v1', JSON.stringify([{ id: 'x' }]));
    expect(loadRuns()).toEqual([]);
  });

  it('swallows quota errors: saveRun returns null instead of throwing', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });
    expect(saveRun(result)).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest src/storage/runsStore.test.ts` → FAIL (module not found).

- [ ] **Step 3: Implement `src/storage/runsStore.ts`**

```ts
import type { AnalysisResult, SavedRun } from '../types';
import { slimResult } from '../compare/slim';

const KEY = 'wtfps.runs.v1';
const MAX_RUNS = 20;

function isSavedRun(r: unknown): r is SavedRun {
  if (typeof r !== 'object' || r === null) return false;
  const run = r as SavedRun;
  return typeof run.id === 'string'
    && typeof run.name === 'string'
    && typeof run.createdAt === 'number'
    && run.result?.slim === true;
}

function readAll(): SavedRun[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw === null) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(isSavedRun) : [];
  } catch {
    return [];
  }
}

function writeAll(runs: SavedRun[]): boolean {
  try {
    localStorage.setItem(KEY, JSON.stringify(runs));
    return true;
  } catch {
    return false;   // quota exceeded or private browsing — the change just isn't persisted
  }
}

function makeId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function autoName(result: AnalysisResult, when: Date): string {
  const hh = String(when.getHours()).padStart(2, '0');
  const mm = String(when.getMinutes()).padStart(2, '0');
  return `${result.log.specs.gpuModelGuess ?? 'Run'} — ${hh}:${mm}`;
}

export function loadRuns(): SavedRun[] {
  return readAll();
}

export function saveRun(result: AnalysisResult, name?: string): SavedRun | null {
  const createdAt = Date.now();
  const run: SavedRun = {
    id: makeId(),
    name: name ?? autoName(result, new Date(createdAt)),
    createdAt,
    result: slimResult(result),
  };
  const runs = [...readAll(), run].slice(-MAX_RUNS);   // FIFO: oldest fall off the front
  return writeAll(runs) ? run : null;
}

export function renameRun(id: string, name: string): void {
  writeAll(readAll().map((r) => (r.id === id ? { ...r, name } : r)));
}

export function deleteRun(id: string): void {
  writeAll(readAll().filter((r) => r.id !== id));
}

export function clearRuns(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // nothing to clear
  }
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest src/storage/runsStore.test.ts` → PASS. Also `npx vitest src/storage` → the existing `specsStore` tests still pass.

- [ ] **Step 5: Commit**

```bash
git add src/storage/runsStore.ts src/storage/runsStore.test.ts
git commit -m "feat(storage): persisted runs store with 20-run FIFO and quota swallow"
```

---

### Task 3: `compareRuns` part 1 — sensor & hero deltas with polarity

**Files:**
- Create: `src/compare/testkit.ts`
- Create: `src/compare/diff.ts` (deltas only; event diff/mismatches/headline land in Task 4)
- Test: `src/compare/diff.test.ts`

- [ ] **Step 1: Create `src/compare/testkit.ts`** (test scaffolding, mirrors `src/causes/testkit.ts` — no test of its own)

```ts
import type {
  CanonicalKey, DiagEvent, InferredSpecs, SavedRun, SlimResult, Stats, TimeSplit,
} from '../types';

const DEFAULT_SPECS: InferredSpecs = {
  systemModel: null, cpuVendor: 'unknown', cpuModelGuess: null,
  gpuVendor: 'unknown', gpuModelGuess: null, igpuModelGuess: null,
  igpuPresent: false, isLaptop: false, ramMb: null, ramModelGuess: null, ramModules: null,
};

const DEFAULT_SPLIT: TimeSplit = { gameplayMs: 300_000, totalMs: 360_000, shares: { gpu: 1 }, dominant: 'gpu' };

// label/unit for the keys the compare tests exercise; anything else falls back to key/null
const SENSOR_META: Partial<Record<CanonicalKey, { label: string; unit: string | null }>> = {
  'cpu.tempPackage': { label: 'CPU Package', unit: '°C' },
  'cpu.tempCoreMax': { label: 'Core Temperatures (Max)', unit: '°C' },
  'cpu.usageTotal': { label: 'Total CPU Usage', unit: '%' },
  'cpu.power': { label: 'CPU Package Power', unit: 'W' },
  'gpu.temp': { label: 'GPU Temperature', unit: '°C' },
  'gpu.hotspot': { label: 'GPU Hot Spot Temperature', unit: '°C' },
  'gpu.usage': { label: 'GPU Core Load', unit: '%' },
  'gpu.clock': { label: 'GPU Clock', unit: 'MHz' },
  'gpu.power': { label: 'GPU Power', unit: 'W' },
  'pm.frameTimeMs': { label: 'Frame Time Presented', unit: 'ms' },
  'ram.loadPct': { label: 'Physical Memory Load', unit: '%' },
};

export function stat(over: { avg: number; max?: number; p1Low?: number; p5Low?: number; count?: number }): Stats {
  const max = over.max ?? over.avg;
  const p1 = over.p1Low ?? over.avg;
  return {
    count: over.count ?? 100, avg: over.avg, min: p1, max,
    p5: p1, p95: max, p99: max, p1Low: p1, p5Low: over.p5Low ?? p1,
  };
}

export function makeSlim(over: {
  specs?: Partial<InferredSpecs>;
  stats?: SlimResult['stats'];
  fps?: Partial<SlimResult['log']['fps']>;
  flagCounts?: SlimResult['log']['flagCounts'];
  events?: DiagEvent[];
  timeSplit?: Partial<TimeSplit>;
  activityKind?: 'gameplay' | 'workload';
  digest?: Partial<SlimResult['digest']>;
} = {}): SlimResult {
  const stats = over.stats ?? {};
  const sensors: SlimResult['log']['sensors'] = {};
  for (const key of Object.keys(stats) as CanonicalKey[]) {
    const meta = SENSOR_META[key] ?? { label: key, unit: null };
    sensors[key] = { key, label: meta.label, unit: meta.unit, values: [] };
  }
  const timeSplit: TimeSplit = { ...DEFAULT_SPLIT, ...over.timeSplit };
  return {
    slim: true,
    log: {
      rowCount: 180,
      pollMs: 2000,
      specs: { ...DEFAULT_SPECS, ...over.specs },
      sensors,
      flagCounts: over.flagCounts ?? {},
      fps: {
        source: 'none', sourceLabel: '', clean: [], stats: null,
        presentedAvg: null, displayedAvg: null, capped: false, capValue: null,
        series: [], presented1PctLow: null, presented01PctLow: null, rtss1PctLow: null,
        ...over.fps,
      },
      unknownColumns: [],
      timesMs: [],
      cores: null,
    },
    stats,
    events: over.events ?? [],
    verdict: {
      health: 'good', mascotMood: 'chill', headline: 'Everything looks healthy.',
      hero: [], findings: [], timeSplit, worst: [], primaryFix: null, coverage: null, guidance: [],
    },
    digest: {
      compact: 'COMPACT BODY\n\nGoal: stored per-run goal',
      full: 'FULL BODY\n\nGoal: stored per-run goal',
      tokenEstimate: { compact: 8, full: 8 },
      fpsSourceLabel: '',
      ...over.digest,
    },
    windows: {
      windows: [],
      timeSplit,
      worst: [],
      windowMs: 8000,
      lowConfidence: false,
      activityKind: over.activityKind ?? 'gameplay',
      logStartMs: 0,
    },
    durationMs: timeSplit.totalMs,
  };
}

export function makeSavedRun(result: SlimResult, over: Partial<Omit<SavedRun, 'result'>> = {}): SavedRun {
  return {
    id: over.id ?? 'run-1',
    name: over.name ?? 'Test run',
    createdAt: over.createdAt ?? 1_770_000_000_000,
    result,
  };
}
```

- [ ] **Step 2: Write failing tests** — create `src/compare/diff.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { buildHeroDeltas, buildSensorDeltas } from './diff';
import { makeSlim, stat } from './testkit';

const FPS = (avg: number, p1: number, p5: number) => ({
  source: 'displayed' as const,
  sourceLabel: 'Framerate Displayed (avg)',
  stats: stat({ avg, p1Low: p1, p5Low: p5 }),
});

describe('buildHeroDeltas', () => {
  const before = makeSlim({
    stats: {
      'cpu.usageTotal': stat({ avg: 45 }), 'cpu.tempPackage': stat({ avg: 82 }),
      'gpu.usage': stat({ avg: 97 }), 'gpu.temp': stat({ avg: 80 }),
    },
    fps: FPS(112, 70, 84),
  });
  const after = makeSlim({
    stats: {
      'cpu.usageTotal': stat({ avg: 60 }), 'cpu.tempPackage': stat({ avg: 81.6 }),
      'gpu.usage': stat({ avg: 96 }), 'gpu.temp': stat({ avg: 72 }),
    },
    fps: FPS(118, 76, 90),
  });
  const hero = buildHeroDeltas(before, after);

  it('is the five hero rows in tile order', () => {
    expect(hero.map((d) => d.key)).toEqual(['fps', 'cpu.usageTotal', 'cpu.temp', 'gpu.usage', 'gpu.temp']);
  });

  it('FPS up is improved; temp down is improved; usage shift is neutral', () => {
    expect(hero[0]).toMatchObject({ before: 112, after: 118, delta: 6, direction: 'up', polarity: 'improved' });
    expect(hero[4]).toMatchObject({ before: 80, after: 72, delta: -8, direction: 'down', polarity: 'improved' });
    expect(hero[1]).toMatchObject({ direction: 'up', polarity: 'neutral' });   // CPU usage 45→60: info, not a loss
  });

  it('a sub-floor change is flat and neutral (no arrow color on jitter)', () => {
    // CPU temp 82 → 81.6: under both the 1 °C unit floor and 2% relative floor
    expect(hero[2].direction).toBe('flat');
    expect(hero[2].polarity).toBe('neutral');
  });

  it('CPU temp follows the verdict hero fallback chain on each side independently', () => {
    const b = makeSlim({ stats: { 'cpu.tempCoreMax': stat({ avg: 85 }) } });
    const a = makeSlim({ stats: { 'cpu.tempPackage': stat({ avg: 78 }) } });
    const row = buildHeroDeltas(b, a)[2];
    expect(row).toMatchObject({ before: 85, after: 78, polarity: 'improved' });
  });

  it('fps source none is a null side, not a regression', () => {
    const b = makeSlim({ fps: FPS(112, 70, 84) });
    const a = makeSlim();   // fps source 'none'
    const row = buildHeroDeltas(b, a)[0];
    expect(row).toMatchObject({ before: 112, after: null, delta: null, direction: 'flat', polarity: 'unknown' });
  });
});

describe('buildSensorDeltas', () => {
  const before = makeSlim({
    stats: { 'gpu.temp': stat({ avg: 80, max: 87 }), 'gpu.clock': stat({ avg: 2400, max: 2520 }) },
    flagCounts: { 'flag.gpu.perfLimitThermal': { fired: 12, total: 2175 } },
    fps: FPS(112, 70, 84),
  });
  const after = makeSlim({
    stats: { 'gpu.temp': stat({ avg: 72, max: 78 }), 'gpu.power': stat({ avg: 115, max: 140 }) },
    flagCounts: { 'flag.gpu.perfLimitThermal': { fired: 0, total: 2100 } },
    fps: FPS(118, 76, 90),
  });
  const rows = buildSensorDeltas(before, after);

  it('leads with fps avg + 1%/5% low rows, all higher-better', () => {
    expect(rows.slice(0, 3).map((d) => d.stat)).toEqual(['avg', 'p1Low', 'p5Low']);
    for (const d of rows.slice(0, 3)) {
      expect(d.key).toBe('fps');
      expect(d.polarity).toBe('improved');
    }
  });

  it('emits avg and max rows per sensor with the lower-better table applied', () => {
    const tempAvg = rows.find((d) => d.key === 'gpu.temp' && d.stat === 'avg')!;
    const tempMax = rows.find((d) => d.key === 'gpu.temp' && d.stat === 'max')!;
    expect(tempAvg).toMatchObject({ delta: -8, polarity: 'improved', unit: '°C' });
    expect(tempMax).toMatchObject({ before: 87, after: 78, polarity: 'improved' });
    // clocks are neutral no matter how big the swing
    const clock = rows.find((d) => d.key === 'gpu.clock' && d.stat === 'avg')!;
    expect(clock.polarity).toBe('unknown');   // gpu.clock missing in after → unknown, not worse
  });

  it('a sensor present on one side only gets nulls and unknown polarity — never NaN', () => {
    const power = rows.find((d) => d.key === 'gpu.power' && d.stat === 'avg')!;
    expect(power).toMatchObject({ before: null, after: 115, delta: null, direction: 'flat', polarity: 'unknown' });
  });

  it('flag fired-counts are lower-better rows labeled via FLAG_LABELS', () => {
    const flag = rows.find((d) => d.key === 'flag.gpu.perfLimitThermal')!;
    expect(flag).toMatchObject({
      stat: 'fired', before: 12, after: 0, delta: -12, direction: 'down', polarity: 'improved',
      label: 'GPU thermal limit',
    });
  });
});
```

- [ ] **Step 3: Run to verify failure**

Run: `npx vitest src/compare/diff.test.ts` → FAIL (`./diff` not found).

- [ ] **Step 4: Implement `src/compare/diff.ts`** (part 1 — deltas only)

```ts
import type {
  CanonicalKey, DeltaPolarity, DeltaStat, FlagKey, SensorDelta, SlimResult, Stats,
} from '../types';
import { FLAG_LABELS } from '../windows/snapshot';

// Lower-is-better keys. Everything not listed here (and not FPS) is neutral: usages,
// clocks, voltages, fans, VRAM MB, PresentMon busy/wait, power limits — a shift there
// is information, not a win or a loss, so it gets a Δ but no color.
const LOWER_BETTER = new Set<string>([
  'cpu.tempPackage', 'cpu.tempCoreMax', 'cpu.tempCoreAvg', 'gpu.temp', 'gpu.hotspot',
  'gpu.memJunction', 'igpu.temp', 'cpu.power', 'gpu.power',
  'ram.loadPct', 'pagefile.usagePct', 'pm.frameTimeMs', 'rtss.frameTimeMs',
]);

// Below these floors a delta is run-to-run jitter, not a change worth an arrow.
const UNIT_FLOOR: Record<string, number> = {
  '°C': 1, '%': 1, 'W': 2, 'MHz': 15, 'ms': 0.3, 'MB': 64, 'RPM': 50, 'V': 0.01,
};
const FPS_FLOOR = 1;

type Better = 'lower' | 'higher' | 'neutral';

function makeDelta(args: {
  key: string; label: string; unit: string | null; stat: DeltaStat;
  before: number | null; after: number | null; better: Better; floor?: number;
}): SensorDelta {
  const { key, label, unit, stat, before, after, better } = args;
  if (before === null || after === null) {
    return { key, label, unit, stat, before, after, delta: null, direction: 'flat', polarity: 'unknown' };
  }
  const delta = after - before;
  const floor = Math.max(
    args.floor ?? (unit !== null ? UNIT_FLOOR[unit] ?? 0 : 0),
    0.02 * Math.abs(before),
    1e-9,
  );
  if (Math.abs(delta) < floor) {
    return { key, label, unit, stat, before, after, delta, direction: 'flat', polarity: 'neutral' };
  }
  const direction = delta > 0 ? 'up' : 'down';
  let polarity: DeltaPolarity = 'neutral';
  if (better === 'lower') polarity = delta < 0 ? 'improved' : 'worse';
  if (better === 'higher') polarity = delta > 0 ? 'improved' : 'worse';
  return { key, label, unit, stat, before, after, delta, direction, polarity };
}

function fpsStat(r: SlimResult, pick: (s: Stats) => number): number | null {
  if (r.log.fps.source === 'none' || r.log.fps.stats === null) return null;
  return pick(r.log.fps.stats);
}

function avgOf(stats: SlimResult['stats'], key: CanonicalKey): number | null {
  const s = stats[key];
  return s && s.count > 0 ? s.avg : null;
}

// Same fallback chain as buildVerdict's CPU hero tile: package, then all-core avg,
// then core max. Each side resolves independently — comparing a package avg against
// a core-max avg beats showing "—" for the whole row.
function cpuTempAvg(r: SlimResult): number | null {
  return avgOf(r.stats, 'cpu.tempPackage') ?? avgOf(r.stats, 'cpu.tempCoreAvg') ?? avgOf(r.stats, 'cpu.tempCoreMax');
}

export function buildHeroDeltas(before: SlimResult, after: SlimResult): SensorDelta[] {
  return [
    makeDelta({
      key: 'fps', label: 'Avg FPS', unit: 'FPS', stat: 'avg',
      before: fpsStat(before, (s) => s.avg), after: fpsStat(after, (s) => s.avg),
      better: 'higher', floor: FPS_FLOOR,
    }),
    makeDelta({
      key: 'cpu.usageTotal', label: 'CPU usage', unit: '%', stat: 'avg',
      before: avgOf(before.stats, 'cpu.usageTotal'), after: avgOf(after.stats, 'cpu.usageTotal'),
      better: 'neutral',
    }),
    makeDelta({
      key: 'cpu.temp', label: 'CPU temp', unit: '°C', stat: 'avg',
      before: cpuTempAvg(before), after: cpuTempAvg(after), better: 'lower',
    }),
    makeDelta({
      key: 'gpu.usage', label: 'GPU usage', unit: '%', stat: 'avg',
      before: avgOf(before.stats, 'gpu.usage'), after: avgOf(after.stats, 'gpu.usage'),
      better: 'neutral',
    }),
    makeDelta({
      key: 'gpu.temp', label: 'GPU temp', unit: '°C', stat: 'avg',
      before: avgOf(before.stats, 'gpu.temp'), after: avgOf(after.stats, 'gpu.temp'),
      better: 'lower',
    }),
  ];
}

function statOf(r: SlimResult, key: CanonicalKey, stat: 'avg' | 'max'): number | null {
  const s = r.stats[key];
  return s && s.count > 0 ? s[stat] : null;
}

export function buildSensorDeltas(before: SlimResult, after: SlimResult): SensorDelta[] {
  const out: SensorDelta[] = [];

  const fpsRow = (stat: 'avg' | 'p1Low' | 'p5Low', label: string) => makeDelta({
    key: 'fps', label, unit: 'FPS', stat,
    before: fpsStat(before, (s) => s[stat]), after: fpsStat(after, (s) => s[stat]),
    better: 'higher', floor: FPS_FLOOR,
  });
  out.push(fpsRow('avg', 'FPS avg'), fpsRow('p1Low', 'FPS 1% low'), fpsRow('p5Low', 'FPS 5% low'));

  const keys = [...new Set<CanonicalKey>([
    ...(Object.keys(before.stats) as CanonicalKey[]),
    ...(Object.keys(after.stats) as CanonicalKey[]),
  ])].sort();
  for (const key of keys) {
    const meta = before.log.sensors[key] ?? after.log.sensors[key];
    const label = meta?.label ?? key;
    const unit = meta?.unit ?? null;
    const better: Better = LOWER_BETTER.has(key) ? 'lower' : 'neutral';
    out.push(makeDelta({ key, label, unit, stat: 'avg', before: statOf(before, key, 'avg'), after: statOf(after, key, 'avg'), better }));
    out.push(makeDelta({ key, label, unit, stat: 'max', before: statOf(before, key, 'max'), after: statOf(after, key, 'max'), better }));
  }

  // throttle/limit flag fired-counts: fewer is always better
  const flagKeys = [...new Set<FlagKey>([
    ...(Object.keys(before.log.flagCounts) as FlagKey[]),
    ...(Object.keys(after.log.flagCounts) as FlagKey[]),
  ])].sort();
  for (const key of flagKeys) {
    out.push(makeDelta({
      key, label: FLAG_LABELS[key], unit: null, stat: 'fired',
      before: before.log.flagCounts[key]?.fired ?? null,
      after: after.log.flagCounts[key]?.fired ?? null,
      better: 'lower', floor: 1,
    }));
  }
  return out;
}
```

- [ ] **Step 5: Run tests**

Run: `npx vitest src/compare/diff.test.ts` → PASS.

- [ ] **Step 6: Commit**

```bash
git add src/compare/testkit.ts src/compare/diff.ts src/compare/diff.test.ts
git commit -m "feat(compare): sensor and hero deltas with polarity and significance floors"
```

---

### Task 4: `compareRuns` part 2 — event diff, subtypes, mismatches, headline

**Files:**
- Modify: `src/causes/events.ts`, `src/causes/thermalCollapse.ts`
- Modify: `src/causes/events.test.ts`, `src/causes/thermalCollapse.test.ts`
- Modify: `src/compare/diff.ts`, `src/compare/diff.test.ts`

- [ ] **Step 1: Write failing tests**

Append to `src/causes/events.test.ts` (inside the existing describe block — it already imports `makeEvent` from `./events`):

```ts
it('forwards subtype when given and omits the key otherwise', () => {
  const tagged = makeEvent({ type: 'throttling', subtype: 'gpu-thermal', severity: 'warn', sentence: 'x', sampleCount: 1 });
  expect(tagged.subtype).toBe('gpu-thermal');
  const bare = makeEvent({ type: 'throttling', severity: 'warn', sentence: 'x', sampleCount: 1 });
  expect('subtype' in bare).toBe(false);
});
```

Append to `src/causes/thermalCollapse.test.ts` (top-level; `collapsingWa` is already module-scope there):

```ts
describe('causeThermalCollapse — compare subtypes', () => {
  it('tags CPU flag events cpu-thermal and the GPU limit event gpu-thermal', () => {
    const log = makeLog({
      flags: {
        'flag.cpu.thermalThrottle': [false, true, true],
        'flag.gpu.perfLimitThermal': [true, true, false],   // 67% density → fires
      },
      sensors: { 'cpu.tempCoreMax': [80, 99, 100], 'gpu.temp': [70, 86, 84] },
    });
    const wa = makeWindowAnalysis([makeWindow(0)]);
    const events = causeThermalCollapse(log, {}, wa);
    expect(events.find((e) => e.sentence.startsWith('CPU'))?.subtype).toBe('cpu-thermal');
    expect(events.find((e) => e.sentence.startsWith('GPU'))?.subtype).toBe('gpu-thermal');
  });

  it('tags the heat-soak collapse with the sagging side', () => {
    const e = causeThermalCollapse(makeLog({}), {}, collapsingWa()).find((x) => x.type === 'thermal-collapse')!;
    expect(e.subtype).toBe('gpu-thermal');
  });
});
```

Append to `src/compare/diff.test.ts` (new top-level describes; extend the import line to `import { buildHeroDeltas, buildSensorDeltas, compareRuns, WORKLOAD_CAVEAT } from './diff';` and add `import type { DiagEvent } from '../types';`):

```ts
const ev = (type: string, subtype?: string): DiagEvent => ({
  id: `${type}-${subtype ?? 'x'}`, type, severity: 'warn',
  sentence: `${type} ${subtype ?? ''} happened`, sampleCount: 3,
  ...(subtype !== undefined ? { subtype } : {}),
});

describe('compareRuns — event diff', () => {
  it('splits resolved / introduced / persisted on type:subtype', () => {
    const before = makeSlim({ events: [ev('throttling', 'cpu-thermal'), ev('fps-cap')] });
    const after = makeSlim({ events: [ev('throttling', 'gpu-thermal'), ev('fps-cap')] });
    const d = compareRuns(before, after).eventDiff;
    expect(d.resolved.map((e) => e.subtype)).toEqual(['cpu-thermal']);
    expect(d.introduced.map((e) => e.subtype)).toEqual(['gpu-thermal']);
    expect(d.persisted.map((e) => e.type)).toEqual(['fps-cap']);
  });

  it('dedupes same-key events so nothing double-reports', () => {
    const before = makeSlim({ events: [ev('throttling', 'cpu-thermal'), ev('throttling', 'cpu-thermal')] });
    const d = compareRuns(before, makeSlim()).eventDiff;
    expect(d.resolved).toHaveLength(1);
  });
});

describe('compareRuns — mismatches', () => {
  const intel = { cpuModelGuess: 'Intel Core i7-13650HX', gpuModelGuess: 'NVIDIA GeForce RTX 4070 Laptop' };
  const amd = { cpuModelGuess: 'AMD Ryzen 9 8940HX', gpuModelGuess: 'NVIDIA GeForce RTX 5070 Laptop' };

  it('fires cpu and gpu kinds on different machines', () => {
    const kinds = compareRuns(makeSlim({ specs: intel }), makeSlim({ specs: amd })).mismatches.map((m) => m.kind);
    expect(kinds).toContain('cpu');
    expect(kinds).toContain('gpu');
  });

  it('stays silent when a model is unknown on one side (null is not a mismatch)', () => {
    const kinds = compareRuns(makeSlim({ specs: intel }), makeSlim()).mismatches.map((m) => m.kind);
    expect(kinds).not.toContain('cpu');
    expect(kinds).not.toContain('gpu');
  });

  it('fires fpsSource including the legacy value', () => {
    const before = makeSlim({ fps: { source: 'legacy', sourceLabel: 'Framerate', stats: stat({ avg: 100 }) } });
    const after = makeSlim({ fps: { source: 'displayed', sourceLabel: 'Framerate Displayed (avg)', stats: stat({ avg: 100 }) } });
    const m = compareRuns(before, after).mismatches.find((x) => x.kind === 'fpsSource')!;
    expect(m.message).toContain('legacy');
  });

  it('fires duration on >50% difference of timeSplit.totalMs', () => {
    const before = makeSlim({ timeSplit: { totalMs: 600_000 } });
    const after = makeSlim({ timeSplit: { totalMs: 200_000 } });
    expect(compareRuns(before, after).mismatches.some((m) => m.kind === 'duration')).toBe(true);
    const near = makeSlim({ timeSplit: { totalMs: 500_000 } });
    expect(compareRuns(before, near).mismatches.some((m) => m.kind === 'duration')).toBe(false);
  });

  it('fires activityKind on gameplay vs workload', () => {
    const m = compareRuns(makeSlim(), makeSlim({ activityKind: 'workload' })).mismatches;
    expect(m.some((x) => x.kind === 'activityKind')).toBe(true);
  });

  it('the same-workload caveat is always present, even with zero mismatches', () => {
    const c = compareRuns(makeSlim(), makeSlim());
    expect(c.mismatches).toEqual([]);
    expect(c.caveat).toBe(WORKLOAD_CAVEAT);
    expect(c.caveat).toContain('same workload');
  });
});

describe('compareRuns — headline + timeSplitDelta', () => {
  it('identical runs read as essentially unchanged', () => {
    const r = makeSlim({
      stats: { 'gpu.temp': stat({ avg: 75 }) },
      fps: { source: 'displayed', sourceLabel: 'Framerate Displayed (avg)', stats: stat({ avg: 120 }) },
    });
    expect(compareRuns(r, r).headline).toContain('Essentially unchanged');
  });

  it('names the FPS percent change', () => {
    const before = makeSlim({ fps: { source: 'displayed', sourceLabel: 'x', stats: stat({ avg: 100 }) } });
    const after = makeSlim({ fps: { source: 'displayed', sourceLabel: 'x', stats: stat({ avg: 112 }) } });
    expect(compareRuns(before, after).headline).toContain('12%');
  });

  it('flat FPS plus a cooler GPU reads as held steady + cooler', () => {
    const before = makeSlim({
      stats: { 'gpu.temp': stat({ avg: 80 }) },
      fps: { source: 'displayed', sourceLabel: 'x', stats: stat({ avg: 120 }) },
    });
    const after = makeSlim({
      stats: { 'gpu.temp': stat({ avg: 72 }) },
      fps: { source: 'displayed', sourceLabel: 'x', stats: stat({ avg: 120.3 }) },
    });
    const h = compareRuns(before, after).headline;
    expect(h).toContain('FPS held steady.');
    expect(h).toContain('8°C cooler');
  });

  it('counts cleared and new issues', () => {
    const before = makeSlim({ events: [ev('throttling', 'cpu-thermal')] });
    const after = makeSlim({ events: [ev('vram-pressure')] });
    const h = compareRuns(before, after).headline;
    expect(h).toContain('cleared');
    expect(h).toContain('new issue');
  });

  it('timeSplitDelta carries both splits and flags a dominant change', () => {
    const before = makeSlim();   // dominant gpu
    const after = makeSlim({ timeSplit: { shares: { cpu: 1 }, dominant: 'cpu' } });
    const t = compareRuns(before, after).timeSplitDelta;
    expect(t.before.dominant).toBe('gpu');
    expect(t.after.dominant).toBe('cpu');
    expect(t.dominantChanged).toBe(true);
    expect(compareRuns(before, before).timeSplitDelta.dominantChanged).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest src/causes/events.test.ts src/causes/thermalCollapse.test.ts src/compare/diff.test.ts` → the new tests FAIL (`subtype` undefined; `compareRuns` not exported).

- [ ] **Step 3: Implement — `makeEvent` subtype passthrough** in `src/causes/events.ts`:

Old:

```ts
export function makeEvent(input: {
  type: string;
  severity: Severity;
  sentence: string;
  fix?: string;
  sampleCount: number;
  evidence?: Evidence;
  windowIndexes?: number[];
}): DiagEvent {
```

New (input gains `subtype?: string;` after `type`, and the body gains one line):

```ts
export function makeEvent(input: {
  type: string;
  subtype?: string;
  severity: Severity;
  sentence: string;
  fix?: string;
  sampleCount: number;
  evidence?: Evidence;
  windowIndexes?: number[];
}): DiagEvent {
  const event: DiagEvent = {
    id: `${input.type}-${slug(input.sentence)}`,
    type: input.type,
    severity: input.severity,
    sentence: input.sentence,
    sampleCount: input.sampleCount,
  };
  if (input.subtype !== undefined) event.subtype = input.subtype;
  if (input.fix !== undefined) event.fix = input.fix;
  if (input.evidence !== undefined) event.evidence = input.evidence;
  if (input.windowIndexes !== undefined) event.windowIndexes = input.windowIndexes;
  return event;
}
```

- [ ] **Step 4: Implement — `src/causes/thermalCollapse.ts` subtypes** (three one-line edits)

In `flagEvent` (CPU throttle flags), old:

```ts
  return makeEvent({
    type: 'throttling', severity, sentence, fix: THROTTLE_FIX, sampleCount: count,
    evidence: { tier: 'measured', basis: ['hardware-latched throttle flag'] },
  });
```

New:

```ts
  return makeEvent({
    type: 'throttling', subtype: 'cpu-thermal', severity, sentence, fix: THROTTLE_FIX, sampleCount: count,
    evidence: { tier: 'measured', basis: ['hardware-latched throttle flag'] },
  });
```

In `gpuThermalEvent`, old:

```ts
  return makeEvent({
    type: 'throttling',
    severity,
```

New:

```ts
  return makeEvent({
    type: 'throttling',
    subtype: 'gpu-thermal',
    severity,
```

In `collapseEvent`, old:

```ts
  return makeEvent({
    type: 'thermal-collapse',
    severity: 'warn',
```

New:

```ts
  return makeEvent({
    type: 'thermal-collapse',
    subtype: gpuSag ? 'gpu-thermal' : 'cpu-thermal',
    severity: 'warn',
```

- [ ] **Step 5: Implement — `src/compare/diff.ts` part 2**

Replace the import block with:

```ts
import type {
  CanonicalKey, Comparison, DeltaPolarity, DeltaStat, DiagEvent, EventDiff,
  FlagKey, FpsSource, Mismatch, SensorDelta, SlimResult, Stats,
} from '../types';
import { FLAG_LABELS } from '../windows/snapshot';
```

Append at the end of the file:

```ts
export const WORKLOAD_CAVEAT =
  'HWiNFO logs carry no game or scene identity — confirm both runs were the same workload.';

const eventKey = (e: DiagEvent) => `${e.type}:${e.subtype ?? ''}`;

function uniqueByKey(events: DiagEvent[]): DiagEvent[] {
  const seen = new Set<string>();
  return events.filter((e) => {
    const k = eventKey(e);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

function buildEventDiff(before: DiagEvent[], after: DiagEvent[]): EventDiff {
  const beforeKeys = new Set(before.map(eventKey));
  const afterKeys = new Set(after.map(eventKey));
  return {
    resolved: uniqueByKey(before).filter((e) => !afterKeys.has(eventKey(e))),
    introduced: uniqueByKey(after).filter((e) => !beforeKeys.has(eventKey(e))),
    persisted: uniqueByKey(after).filter((e) => beforeKeys.has(eventKey(e))),
  };
}

const FPS_SOURCE_LABEL: Record<FpsSource, string> = {
  displayed: 'PresentMon displayed',
  presented: 'PresentMon presented',
  legacy: 'legacy framerate counter',
  none: 'no framerate logged',
};

const mins = (ms: number) => (ms / 60_000).toFixed(1);

function buildMismatches(before: SlimResult, after: SlimResult): Mismatch[] {
  const out: Mismatch[] = [];
  const b = before.log.specs;
  const a = after.log.specs;
  if (b.cpuModelGuess !== null && a.cpuModelGuess !== null && b.cpuModelGuess !== a.cpuModelGuess) {
    out.push({ kind: 'cpu', message: `Different CPUs: ${b.cpuModelGuess} vs ${a.cpuModelGuess}.` });
  }
  if (b.gpuModelGuess !== null && a.gpuModelGuess !== null && b.gpuModelGuess !== a.gpuModelGuess) {
    out.push({ kind: 'gpu', message: `Different GPUs: ${b.gpuModelGuess} vs ${a.gpuModelGuess}.` });
  }
  if (before.log.fps.source !== after.log.fps.source) {
    out.push({
      kind: 'fpsSource',
      message: `FPS sources differ: ${FPS_SOURCE_LABEL[before.log.fps.source]} vs ${FPS_SOURCE_LABEL[after.log.fps.source]} — FPS deltas may not be apples-to-apples.`,
    });
  }
  const bMs = before.windows.timeSplit.totalMs;
  const aMs = after.windows.timeSplit.totalMs;
  if (bMs > 0 && aMs > 0 && Math.max(bMs, aMs) / Math.min(bMs, aMs) > 1.5) {
    out.push({
      kind: 'duration',
      message: `Run lengths differ a lot: ${mins(bMs)} vs ${mins(aMs)} min — percentiles aren't directly comparable.`,
    });
  }
  if (before.windows.activityKind !== after.windows.activityKind) {
    out.push({
      kind: 'activityKind',
      message: 'One run is gameplay and the other a no-FPS workload (benchmark) — most deltas are meaningless across that divide.',
    });
  }
  return out;
}

function buildHeadline(heroDeltas: SensorDelta[], eventDiff: EventDiff): string {
  const parts: string[] = [];

  const fps = heroDeltas.find((d) => d.key === 'fps');
  if (fps && fps.delta !== null && fps.direction !== 'flat' && fps.before !== null && fps.before > 0) {
    const pct = Math.round((Math.abs(fps.delta) / fps.before) * 100);
    parts.push(`Average FPS ${fps.direction === 'up' ? 'went up' : 'dropped'} ${pct}% (${Math.round(fps.before)} → ${Math.round(fps.after as number)}).`);
  }

  // one temperature sentence is enough for a headline; GPU outranks CPU
  for (const key of ['gpu.temp', 'cpu.temp']) {
    const t = heroDeltas.find((d) => d.key === key);
    if (t && t.delta !== null && t.direction !== 'flat') {
      parts.push(`${key === 'gpu.temp' ? 'GPU' : 'CPU'} ran ${Math.round(Math.abs(t.delta))}°C ${t.delta < 0 ? 'cooler' : 'hotter'}.`);
      break;
    }
  }

  const { resolved, introduced } = eventDiff;
  if (resolved.length > 0) parts.push(resolved.length === 1 ? 'One earlier issue cleared.' : `${resolved.length} earlier issues cleared.`);
  if (introduced.length > 0) parts.push(introduced.length === 1 ? 'One new issue appeared.' : `${introduced.length} new issues appeared.`);

  if (parts.length === 0) return 'Essentially unchanged — no meaningful difference between these runs.';
  if (fps && fps.before !== null && fps.after !== null && fps.direction === 'flat') parts.unshift('FPS held steady.');
  return parts.slice(0, 3).join(' ');
}

export function compareRuns(before: SlimResult, after: SlimResult): Comparison {
  const heroDeltas = buildHeroDeltas(before, after);
  const eventDiff = buildEventDiff(before.events, after.events);
  return {
    before,
    after,
    heroDeltas,
    sensorDeltas: buildSensorDeltas(before, after),
    eventDiff,
    mismatches: buildMismatches(before, after),
    timeSplitDelta: {
      before: before.windows.timeSplit,
      after: after.windows.timeSplit,
      dominantChanged: before.windows.timeSplit.dominant !== after.windows.timeSplit.dominant,
    },
    headline: buildHeadline(heroDeltas, eventDiff),
    caveat: WORKLOAD_CAVEAT,
  };
}
```

- [ ] **Step 6: Run tests**

Run: `npx vitest src/causes src/compare` → PASS (including all pre-existing causes tests — the subtype additions change no sentence or severity).

- [ ] **Step 7: Commit**

```bash
git add src/causes/events.ts src/causes/events.test.ts src/causes/thermalCollapse.ts src/causes/thermalCollapse.test.ts src/compare/diff.ts src/compare/diff.test.ts
git commit -m "feat(compare): event diff on type:subtype, mismatch detection and headline"
```

---

### Task 5: `buildCompareDigest`

**Files:**
- Create: `src/digest/compareDigest.ts`
- Test: `src/digest/compareDigest.test.ts`

- [ ] **Step 1: Write failing tests** — create `src/digest/compareDigest.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { buildCompareDigest } from './compareDigest';
import { compareRuns } from '../compare/diff';
import { makeSlim, makeSavedRun, stat } from '../compare/testkit';

const before = makeSlim({
  stats: { 'gpu.temp': stat({ avg: 80, max: 87 }) },
  fps: { source: 'displayed', sourceLabel: 'Framerate Displayed (avg)', stats: stat({ avg: 112, p1Low: 70 }) },
  digest: { compact: 'BEFORE COMPACT BODY\n\nGoal: old before goal', full: 'BEFORE FULL BODY\n\nGoal: old before goal' },
});
const after = makeSlim({
  stats: { 'gpu.temp': stat({ avg: 72, max: 78 }) },
  fps: { source: 'displayed', sourceLabel: 'Framerate Displayed (avg)', stats: stat({ avg: 118, p1Low: 76 }) },
  digest: { compact: 'AFTER COMPACT BODY\n\nGoal: old after goal', full: 'AFTER FULL BODY\n\nGoal: old after goal' },
});
const runB = makeSavedRun(before, { id: 'b', name: 'stock', createdAt: Date.UTC(2026, 5, 10, 20, 0) });
const runA = makeSavedRun(after, { id: 'a', name: 'undervolt', createdAt: Date.UTC(2026, 5, 11, 20, 0) });
const comparison = compareRuns(before, after);

describe('buildCompareDigest', () => {
  const digest = buildCompareDigest(runB, runA, comparison);

  it('stacks both stored digests under labeled headers, per mode', () => {
    expect(digest.compact).toContain('=== BEFORE: stock ===');
    expect(digest.compact).toContain('BEFORE COMPACT BODY');
    expect(digest.compact).toContain('=== AFTER: undervolt ===');
    expect(digest.compact).toContain('AFTER COMPACT BODY');
    expect(digest.full).toContain('BEFORE FULL BODY');
    expect(digest.full).toContain('AFTER FULL BODY');
    expect(digest.full).not.toContain('COMPACT BODY');
  });

  it('opens with the delta summary: headline, hero deltas, events, time split, caveats', () => {
    expect(digest.compact).toContain('HWiNFO before/after comparison:');
    expect(digest.compact).toContain(comparison.headline);
    expect(digest.compact).toContain('GPU temp: 80°C → 72°C (-8°C) [better]');
    expect(digest.compact).toContain('Events:');
    expect(digest.compact).toContain('Time split');
    expect(digest.compact).toContain('confirm both runs were the same workload');
  });

  it('the compare goal replaces the per-run goals: exactly one Goal line, at the end', () => {
    expect((digest.compact.match(/^Goal: /gm) ?? []).length).toBe(1);
    expect(digest.compact.trimEnd()).toMatch(/Goal: did this change help, and what else can I tune\?$/);
    const custom = buildCompareDigest(runB, runA, comparison, { goal: 'is my undervolt stable?' });
    expect(custom.compact.trimEnd()).toMatch(/Goal: is my undervolt stable\?$/);
    expect(custom.compact).not.toContain('old before goal');
  });

  it('full mode also lists every significant sensor delta', () => {
    expect(digest.full).toContain('All significant deltas:');
    expect(digest.full).toContain('FPS 1% low');
    expect(digest.compact).not.toContain('All significant deltas:');
  });

  it('renders missing sides as — and never NaN', () => {
    const oneSided = compareRuns(before, makeSlim());
    const d = buildCompareDigest(runB, makeSavedRun(makeSlim(), { name: 'empty' }), oneSided);
    expect(d.compact).toContain('—');
    expect(d.compact).not.toContain('NaN');
  });

  it('token estimate is length/4 per mode and the fps source label carries over', () => {
    expect(digest.tokenEstimate.compact).toBe(Math.ceil(digest.compact.length / 4));
    expect(digest.tokenEstimate.full).toBe(Math.ceil(digest.full.length / 4));
    expect(digest.fpsSourceLabel).toBe(after.digest.fpsSourceLabel);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest src/digest/compareDigest.test.ts` → FAIL (module not found).

- [ ] **Step 3: Implement `src/digest/compareDigest.ts`**

```ts
import type { Comparison, DiagEvent, Digest, DigestMode, SavedRun, SensorDelta, TimeSplit } from '../types';

const DEFAULT_GOAL = 'did this change help, and what else can I tune?';

function n(x: number): string {
  const r = Math.round(x * 10) / 10;
  return Number.isInteger(r) ? String(r) : r.toFixed(1);
}

function fmt(v: number | null, unit: string | null): string {
  if (v === null) return '—';
  if (unit === null) return n(v);
  return unit === '%' || unit === '°C' ? `${n(v)}${unit}` : `${n(v)} ${unit}`;
}

const POLARITY_TAG: Record<SensorDelta['polarity'], string> = {
  improved: ' [better]', worse: ' [worse]', neutral: '', unknown: '',
};

function deltaLine(d: SensorDelta): string {
  if (d.before === null || d.after === null || d.delta === null) {
    return `- ${d.label}: ${fmt(d.before, d.unit)} → ${fmt(d.after, d.unit)} (one side missing)`;
  }
  const sign = d.delta >= 0 ? '+' : '-';
  return `- ${d.label}: ${fmt(d.before, d.unit)} → ${fmt(d.after, d.unit)} (${sign}${fmt(Math.abs(d.delta), d.unit)})${POLARITY_TAG[d.polarity]}`;
}

function when(run: SavedRun): string {
  const d = new Date(run.createdAt);
  const pad = (x: number) => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function eventLine(title: string, events: DiagEvent[]): string {
  if (events.length === 0) return `- ${title}: none`;
  return `- ${title}: ${events.map((e) => e.sentence).join(' | ')}`;
}

function splitSummary(label: string, split: TimeSplit): string {
  if (split.dominant === null) return `${label} no active windows`;
  const pct = (k: 'gpu' | 'cpu' | 'capped') => Math.round((split.shares[k] ?? 0) * 100);
  return `${label} dominant ${split.dominant} (gpu ${pct('gpu')}%, cpu ${pct('cpu')}%, capped ${pct('capped')}%)`;
}

// Each stored digest ends with its own "Goal:" line; the compare goal replaces them.
function stripGoal(digest: string): string {
  return digest.replace(/\n+Goal: [^\n]*\s*$/, '');
}

function render(mode: DigestMode, before: SavedRun, after: SavedRun, c: Comparison, goal: string): string {
  const parts: string[] = [];
  parts.push('HWiNFO before/after comparison:');
  parts.push('');
  parts.push(`BEFORE: ${before.name} (saved ${when(before)})`);
  parts.push(`AFTER: ${after.name} (saved ${when(after)})`);
  parts.push('');
  parts.push(`Verdict: ${c.headline}`);
  parts.push('');
  parts.push('Hero deltas (before → after):');
  parts.push(...c.heroDeltas.map(deltaLine));
  parts.push('');
  parts.push('Events:');
  parts.push(eventLine('resolved (gone in AFTER)', c.eventDiff.resolved));
  parts.push(eventLine('introduced (new in AFTER)', c.eventDiff.introduced));
  parts.push(eventLine('persisted (in both)', c.eventDiff.persisted));
  parts.push('');
  parts.push(`Time split: ${splitSummary('BEFORE', c.timeSplitDelta.before)}; ${splitSummary('AFTER', c.timeSplitDelta.after)}${c.timeSplitDelta.dominantChanged ? ' — the limiter moved between runs' : ''}`);
  parts.push('');
  parts.push('Caveats:');
  parts.push(...c.mismatches.map((m) => `- ${m.message}`));
  parts.push(`- ${c.caveat}`);

  if (mode === 'full') {
    const significant = c.sensorDeltas.filter((d) => d.delta !== null && d.direction !== 'flat');
    if (significant.length > 0) {
      parts.push('');
      parts.push('All significant deltas:');
      parts.push(...significant.map(deltaLine));
    }
  }

  parts.push('');
  parts.push(`=== BEFORE: ${before.name} ===`);
  parts.push(stripGoal(mode === 'full' ? before.result.digest.full : before.result.digest.compact));
  parts.push('');
  parts.push(`=== AFTER: ${after.name} ===`);
  parts.push(stripGoal(mode === 'full' ? after.result.digest.full : after.result.digest.compact));
  parts.push('');
  parts.push(`Goal: ${goal}`);
  return parts.join('\n');
}

export function buildCompareDigest(
  before: SavedRun,
  after: SavedRun,
  comparison: Comparison,
  opts?: { goal?: string },
): Digest {
  const goal = opts?.goal ?? DEFAULT_GOAL;
  const compact = render('compact', before, after, comparison, goal);
  const full = render('full', before, after, comparison, goal);
  return {
    compact,
    full,
    tokenEstimate: {
      compact: Math.ceil(compact.length / 4),
      full: Math.ceil(full.length / 4),
    } as Record<DigestMode, number>,
    fpsSourceLabel: after.result.digest.fpsSourceLabel || before.result.digest.fpsSourceLabel,
  };
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest src/digest` → PASS (the new file plus the untouched existing digest tests).

- [ ] **Step 5: Commit**

```bash
git add src/digest/compareDigest.ts src/digest/compareDigest.test.ts
git commit -m "feat(digest): stacked before/after compare digest with delta summary"
```

---

### Task 6: `useRuns` hook + `RunsPanel` modal

**Files:**
- Create: `src/ui/useRuns.ts`, `src/ui/compareFormat.ts`
- Create: `src/ui/RunsPanel.tsx`, `src/ui/RunsPanel.css`
- Test: `src/ui/useRuns.test.ts`, `src/ui/RunsPanel.test.tsx` (jsdom via the `src/ui/**` glob)

- [ ] **Step 1: Write failing tests**

Create `src/ui/useRuns.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useRuns } from './useRuns';
import { saveRun } from '../storage/runsStore';
import { analyze } from '../engine/analyze';

const tinyCsv = [
  'Date,Time,"Total CPU Usage [%]","CPU Package [°C]","GPU Temperature [°C]","GPU Core Load [%]","Framerate Displayed (avg) [FPS]",',
  '9.6.2026,12:00:00.000,45.0,70.0,75.0,99.0,120.0,',
  '9.6.2026,12:00:02.000,55.0,72.0,77.0,98.0,118.0,',
].join('\n');
const result = analyze(new TextEncoder().encode(tinyCsv));

beforeEach(() => localStorage.clear());

describe('useRuns', () => {
  it('initializes from storage', () => {
    saveRun(result, 'pre-existing');
    const { result: hook } = renderHook(() => useRuns());
    expect(hook.current.runs.map((r) => r.name)).toEqual(['pre-existing']);
  });

  it('save / rename / remove / clear keep state and storage in sync', () => {
    const { result: hook } = renderHook(() => useRuns());
    let savedId = '';
    act(() => { savedId = hook.current.save(result)!.id; });
    expect(hook.current.runs).toHaveLength(1);
    act(() => hook.current.rename(savedId, 'renamed'));
    expect(hook.current.runs[0].name).toBe('renamed');
    act(() => hook.current.remove(savedId));
    expect(hook.current.runs).toEqual([]);
    act(() => { hook.current.save(result); hook.current.clear(); });
    expect(hook.current.runs).toEqual([]);
    expect(localStorage.getItem('wtfps.runs.v1')).toBeNull();
  });
});
```

Create `src/ui/RunsPanel.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { RunsPanel } from './RunsPanel';
import { makeSlim, makeSavedRun } from '../compare/testkit';

// createdAt descending so the displayed (newest-first) order matches the array order
const r1 = makeSavedRun(makeSlim(), { id: 'r1', name: 'Run one', createdAt: 3000 });
const r2 = makeSavedRun(makeSlim(), { id: 'r2', name: 'Run two', createdAt: 2000 });
const r3 = makeSavedRun(makeSlim(), { id: 'r3', name: 'Run three', createdAt: 1000 });

function setup(runs = [r1, r2, r3]) {
  const handlers = {
    onClose: vi.fn(), onOpenRun: vi.fn(), onCompare: vi.fn(),
    onRename: vi.fn(), onDelete: vi.fn(), onClearAll: vi.fn(),
  };
  render(<RunsPanel runs={runs} {...handlers} />);
  return handlers;
}

describe('RunsPanel', () => {
  it('Compare is enabled only with exactly two selected; a third checkbox is blocked', () => {
    setup();
    const compare = screen.getByRole('button', { name: 'Compare' });
    const boxes = screen.getAllByRole('checkbox');
    expect(compare).toBeDisabled();
    fireEvent.click(boxes[0]);
    expect(compare).toBeDisabled();
    fireEvent.click(boxes[1]);
    expect(compare).toBeEnabled();
    expect(boxes[2]).toBeDisabled();   // only two can be picked
    fireEvent.click(boxes[0]);         // unselect → third frees up
    expect(boxes[2]).toBeEnabled();
  });

  it('Compare passes the runs in chronological order (older = before)', () => {
    const h = setup();
    // select Run one (newest, createdAt 3000) and Run three (oldest, 1000)
    fireEvent.click(screen.getByRole('checkbox', { name: /select run one/i }));
    fireEvent.click(screen.getByRole('checkbox', { name: /select run three/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Compare' }));
    expect(h.onCompare).toHaveBeenCalledWith(r3, r1);
  });

  it('clicking a run name reopens it', () => {
    const h = setup();
    fireEvent.click(screen.getByRole('button', { name: /run two/i }));
    expect(h.onOpenRun).toHaveBeenCalledWith(r2);
  });

  it('rename: edit inline and commit with Enter', () => {
    const h = setup();
    fireEvent.click(screen.getAllByRole('button', { name: 'Rename' })[0]);   // first row = r1
    const input = screen.getByRole('textbox', { name: /run name/i });
    fireEvent.change(input, { target: { value: 'Undervolt -75' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(h.onRename).toHaveBeenCalledWith('r1', 'Undervolt -75');
  });

  it('delete and clear-all fire their callbacks', () => {
    const h = setup();
    fireEvent.click(screen.getAllByRole('button', { name: 'Delete' })[1]);   // second row = r2
    expect(h.onDelete).toHaveBeenCalledWith('r2');
    fireEvent.click(screen.getByRole('button', { name: /clear all/i }));
    expect(h.onClearAll).toHaveBeenCalled();
  });

  it('empty state explains auto-save and disables Clear all', () => {
    setup([]);
    expect(screen.getByText(/lands here automatically/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /clear all/i })).toBeDisabled();
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest src/ui/useRuns.test.ts src/ui/RunsPanel.test.tsx` → FAIL (modules not found).

- [ ] **Step 3: Implement `src/ui/useRuns.ts`**

```ts
import { useCallback, useState } from 'react';
import type { AnalysisResult, SavedRun } from '../types';
import { clearRuns, deleteRun, loadRuns, renameRun, saveRun } from '../storage/runsStore';

export interface UseRunsReturn {
  runs: SavedRun[];
  save: (result: AnalysisResult) => SavedRun | null;
  rename: (id: string, name: string) => void;
  remove: (id: string) => void;
  clear: () => void;
}

// Thin state wrapper over runsStore: every mutation re-reads storage so the list
// always reflects what actually persisted (a quota-failed save changes nothing).
export function useRuns(): UseRunsReturn {
  const [runs, setRuns] = useState<SavedRun[]>(() => loadRuns());

  const save = useCallback((result: AnalysisResult) => {
    const run = saveRun(result);
    setRuns(loadRuns());
    return run;
  }, []);
  const rename = useCallback((id: string, name: string) => {
    renameRun(id, name);
    setRuns(loadRuns());
  }, []);
  const remove = useCallback((id: string) => {
    deleteRun(id);
    setRuns(loadRuns());
  }, []);
  const clear = useCallback(() => {
    clearRuns();
    setRuns([]);
  }, []);

  return { runs, save, rename, remove, clear };
}
```

- [ ] **Step 4: Implement `src/ui/compareFormat.ts`** (shared by RunsPanel/SavedRunView/CompareView/CompareTable)

```ts
import type { DeltaDirection, SensorDelta } from '../types';

export function fmtSide(v: number | null, unit: string | null): string {
  if (v === null) return '—';
  const rounded = Math.abs(v) >= 100 ? Math.round(v) : Math.round(v * 10) / 10;
  const text = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
  if (unit === null) return text;
  return unit === '%' || unit === '°C' ? `${text}${unit}` : `${text} ${unit}`;
}

export function fmtDelta(d: SensorDelta): string {
  if (d.delta === null) return '—';
  return `${d.delta >= 0 ? '+' : '-'}${fmtSide(Math.abs(d.delta), d.unit)}`;
}

export const DIR_ARROW: Record<DeltaDirection, string> = { up: '↑', down: '↓', flat: '→' };

// Color rides on the row class so CSS can scope it to the Δ cell only.
export function deltaRowClass(d: SensorDelta): string {
  if (d.polarity === 'improved') return 'delta--improved';
  if (d.polarity === 'worse') return 'delta--worse';
  return '';
}

export function fmtTimestamp(epochMs: number): string {
  const d = new Date(epochMs);
  const pad = (x: number) => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
```

- [ ] **Step 5: Implement `src/ui/RunsPanel.tsx`**

```tsx
import { useState } from 'react';
import type { SavedRun } from '../types';
import { GlassCard, Button } from './primitives';
import { fmtTimestamp } from './compareFormat';
import './RunsPanel.css';

interface RunsPanelProps {
  runs: SavedRun[];
  onClose: () => void;
  onOpenRun: (run: SavedRun) => void;
  onCompare: (before: SavedRun, after: SavedRun) => void;
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
  onClearAll: () => void;
}

export function RunsPanel(props: RunsPanelProps): JSX.Element {
  const [selected, setSelected] = useState<string[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');

  const sorted = [...props.runs].sort((a, b) => b.createdAt - a.createdAt);

  function toggle(id: string) {
    setSelected((cur) =>
      cur.includes(id) ? cur.filter((x) => x !== id) : cur.length < 2 ? [...cur, id] : cur,
    );
  }

  function compare() {
    const picked = props.runs.filter((r) => selected.includes(r.id));
    if (picked.length !== 2) return;
    // chronology decides the roles; CompareView has a Swap control for the rest
    const [before, after] = [...picked].sort((a, b) => a.createdAt - b.createdAt);
    props.onCompare(before, after);
  }

  function commitRename(id: string) {
    const name = draft.trim();
    if (name) props.onRename(id, name);
    setEditingId(null);
  }

  return (
    <div className="runs-overlay" role="dialog" aria-modal="true" aria-label="Saved runs">
      <div className="runs-overlay__backdrop" onClick={props.onClose} />
      <GlassCard className="runs-panel">
        <div className="runs-panel__header">
          <h2 className="runs-panel__title">Saved runs</h2>
          <Button variant="ghost" onClick={props.onClose}>Close</Button>
        </div>

        {sorted.length === 0 ? (
          <p className="u-dim">No saved runs yet — every analyzed log lands here automatically.</p>
        ) : (
          <ul className="runs-panel__list">
            {sorted.map((run) => (
              <li key={run.id} className="runs-panel__row">
                <input
                  type="checkbox"
                  className="runs-panel__check"
                  aria-label={`Select ${run.name} for compare`}
                  checked={selected.includes(run.id)}
                  disabled={!selected.includes(run.id) && selected.length >= 2}
                  onChange={() => toggle(run.id)}
                />
                {editingId === run.id ? (
                  <input
                    className="runs-panel__rename mono"
                    aria-label="Run name"
                    value={draft}
                    autoFocus
                    onChange={(e) => setDraft(e.target.value)}
                    onBlur={() => commitRename(run.id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') commitRename(run.id);
                      if (e.key === 'Escape') setEditingId(null);
                    }}
                  />
                ) : (
                  <button type="button" className="runs-panel__open" onClick={() => props.onOpenRun(run)}>
                    <span className="runs-panel__name">{run.name}</span>
                    <span className="runs-panel__meta mono u-dim">{fmtTimestamp(run.createdAt)}</span>
                  </button>
                )}
                <Button variant="subtle" onClick={() => { setEditingId(run.id); setDraft(run.name); }}>Rename</Button>
                <Button variant="subtle" onClick={() => props.onDelete(run.id)}>Delete</Button>
              </li>
            ))}
          </ul>
        )}

        <div className="runs-panel__footer">
          <Button variant="ghost" onClick={props.onClearAll} disabled={sorted.length === 0}>Clear all</Button>
          <Button variant="accent" onClick={compare} disabled={selected.length !== 2}>Compare</Button>
        </div>
      </GlassCard>
    </div>
  );
}
```

- [ ] **Step 6: Create `src/ui/RunsPanel.css`** (tokens only; the overlay is the third allowed blur surface, same as the settings modal; the run rows are solid per DESIGN.md — dense data never sits on glass)

```css
.runs-overlay {
  position: fixed;
  inset: 0;
  z-index: var(--z-modal);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--s5);
}

.runs-overlay__backdrop {
  position: absolute;
  inset: 0;
  background: var(--overlay-bg);
  -webkit-backdrop-filter: blur(var(--overlay-blur));
  backdrop-filter: blur(var(--overlay-blur));
}

.runs-panel {
  position: relative;
  width: 100%;
  max-width: 640px;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
  gap: var(--s4);
}

.runs-panel__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.runs-panel__title {
  font-size: var(--text-lg);
  margin: 0;
}

.runs-panel__list {
  list-style: none;
  margin: 0;
  padding: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: var(--s2);
}

.runs-panel__row {
  display: flex;
  align-items: center;
  gap: var(--s3);
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--r-md);
  padding: var(--s2) var(--s3);
}

.runs-panel__open {
  flex: 1;
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--s3);
  background: none;
  border: none;
  padding: var(--s1) 0;
  cursor: pointer;
  text-align: left;
  color: var(--text);
  font: inherit;
}

.runs-panel__open:hover .runs-panel__name {
  color: var(--accent);
}

.runs-panel__meta {
  font-size: var(--text-xs);
}

.runs-panel__rename {
  flex: 1;
  background: var(--inset);
  border: 1px solid var(--border-strong);
  border-radius: var(--r-sm);
  color: var(--text);
  padding: var(--s1) var(--s2);
  font-size: var(--text-sm);
}

.runs-panel__footer {
  display: flex;
  justify-content: space-between;
  gap: var(--s3);
}
```

- [ ] **Step 7: Run tests**

Run: `npx vitest src/ui/useRuns.test.ts src/ui/RunsPanel.test.tsx` → PASS.

- [ ] **Step 8: Commit**

```bash
git add src/ui/useRuns.ts src/ui/useRuns.test.ts src/ui/compareFormat.ts src/ui/RunsPanel.tsx src/ui/RunsPanel.css src/ui/RunsPanel.test.tsx
git commit -m "feat(ui): saved-runs modal with select-two compare and runs state hook"
```

---

### Task 7: `CompareView` + `CompareTable` + `DigestPanel` sources

**Files:**
- Create: `src/ui/CompareView.tsx`, `src/ui/CompareView.css`, `src/ui/CompareView.test.tsx`
- Create: `src/ui/CompareTable.tsx`, `src/ui/CompareTable.css`, `src/ui/CompareTable.test.tsx`
- Modify: `src/ui/DigestPanel.tsx`, `src/ui/DigestPanel.test.tsx`
- Modify: `src/App.tsx` (one line — the `DigestPanel` call site moves to the new prop so `tsc -b` stays green; the full wiring lands in Task 8)

- [ ] **Step 1: Write failing tests**

Create `src/ui/CompareView.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { CompareView } from './CompareView';
import { compareRuns } from '../compare/diff';
import { makeSlim, makeSavedRun, stat } from '../compare/testkit';

const FPS = (avg: number) => ({
  source: 'displayed' as const, sourceLabel: 'Framerate Displayed (avg)', stats: stat({ avg }),
});

const before = makeSlim({
  stats: { 'gpu.temp': stat({ avg: 80 }), 'cpu.usageTotal': stat({ avg: 45 }) },
  fps: FPS(112),
});
const after = makeSlim({
  stats: { 'gpu.temp': stat({ avg: 72 }), 'cpu.usageTotal': stat({ avg: 60 }) },
  fps: FPS(118),
});
const runB = makeSavedRun(before, { id: 'b', name: 'stock', createdAt: 1000 });
const runA = makeSavedRun(after, { id: 'a', name: 'undervolt', createdAt: 2000 });
const comparison = compareRuns(before, after);

function setup(c = comparison) {
  const onSwap = vi.fn();
  const onExit = vi.fn();
  const view = render(
    <CompareView before={runB} after={runA} comparison={c} onSwap={onSwap} onExit={onExit} />,
  );
  return { onSwap, onExit, container: view.container };
}

describe('CompareView', () => {
  it('shows the headline, both run names and five hero rows', () => {
    const { container } = setup();
    expect(screen.getByText(comparison.headline)).toBeInTheDocument();
    expect(screen.getByText('stock')).toBeInTheDocument();
    expect(screen.getByText('undervolt')).toBeInTheDocument();
    expect(container.querySelectorAll('tbody tr')).toHaveLength(5);
  });

  it('colors only clear-polarity rows; neutral changes carry no color class', () => {
    const { container } = setup();
    expect(container.querySelectorAll('.delta--improved').length).toBeGreaterThan(0);
    const rows = [...container.querySelectorAll('tbody tr')];
    const cpuUsage = rows.find((r) => r.textContent?.includes('CPU usage'))!;
    expect(cpuUsage.className).toBe('');   // 45→60 is information, not a loss
  });

  it('missing sides render as — and never NaN', () => {
    const { container } = setup();
    // cpu.temp and gpu.usage exist in neither fixture → whole row is dashes
    expect(container.textContent).toContain('—');
    expect(container.textContent).not.toContain('NaN');
  });

  it('the warn banner appears only when there are mismatches; the caveat always shows', () => {
    const { container } = setup();
    expect(container.querySelector('.compare-view__banner')).toBeNull();
    expect(screen.getByText(/same workload/i)).toBeInTheDocument();

    const mismatched = compareRuns(before, makeSlim({ activityKind: 'workload' }));
    const second = render(
      <CompareView before={runB} after={runA} comparison={mismatched} onSwap={vi.fn()} onExit={vi.fn()} />,
    );
    expect(second.container.querySelector('.compare-view__banner')).not.toBeNull();
  });

  it('swap and exit fire their callbacks', () => {
    const { onSwap, onExit } = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Swap' }));
    expect(onSwap).toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: /exit compare/i }));
    expect(onExit).toHaveBeenCalled();
  });
});
```

Create `src/ui/CompareTable.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CompareTable } from './CompareTable';
import { compareRuns } from '../compare/diff';
import { makeSlim, stat } from '../compare/testkit';
import type { DiagEvent } from '../types';

const throttle: DiagEvent = {
  id: 't1', type: 'throttling', subtype: 'cpu-thermal', severity: 'warn',
  sentence: 'CPU hit thermal throttling in 12 samples.', sampleCount: 12,
};

const before = makeSlim({
  stats: { 'gpu.temp': stat({ avg: 80, max: 87 }), 'gpu.clock': stat({ avg: 2400, max: 2520 }) },
  flagCounts: { 'flag.cpu.thermalThrottle': { fired: 12, total: 1800 } },
  events: [throttle],
});
const after = makeSlim({
  stats: { 'gpu.temp': stat({ avg: 72, max: 78 }), 'gpu.clock': stat({ avg: 2460, max: 2580 }) },
  flagCounts: { 'flag.cpu.thermalThrottle': { fired: 0, total: 1750 } },
});
const comparison = compareRuns(before, after);

describe('CompareTable', () => {
  it('renders avg and max rows per sensor plus the flag-count row', () => {
    const { container } = render(<CompareTable comparison={comparison} />);
    const text = container.textContent ?? '';
    expect(text).toContain('GPU Temperature');
    expect(text).toContain('CPU thermal throttle');
    // gpu.temp avg + max, gpu.clock avg + max, flag row, fps rows skipped (both none)
    expect(container.querySelectorAll('tbody tr').length).toBe(5);
    expect(text).not.toContain('NaN');
  });

  it('breaks down the event diff into resolved / introduced / persisted', () => {
    render(<CompareTable comparison={comparison} />);
    expect(screen.getByText(/resolved/i)).toBeInTheDocument();
    expect(screen.getByText(/CPU hit thermal throttling/)).toBeInTheDocument();
    expect(screen.getAllByText('none').length).toBe(2);   // introduced + persisted are empty
  });

  it('colors only clear-polarity rows', () => {
    const { container } = render(<CompareTable comparison={comparison} />);
    const rows = [...container.querySelectorAll('tbody tr')];
    const clock = rows.find((r) => r.textContent?.includes('GPU Clock'))!;
    expect(clock.className).toBe('');                      // clocks stay neutral
    const temp = rows.find((r) => r.textContent?.includes('GPU Temperature'))!;
    expect(temp.className).toBe('delta--improved');
  });
});
```

Modify `src/ui/DigestPanel.test.tsx`: change the three existing `render(<DigestPanel result={result} specs={specs} />)` calls to `render(<DigestPanel source={{ kind: 'live', result, specs }} />)` (the tests' assertions stay untouched), add `import { makeSlim, makeSavedRun, stat } from '../compare/testkit';` and `import { compareRuns } from '../compare/diff';`, and append:

```tsx
describe('DigestPanel — saved and compare sources', () => {
  it('saved mode shows the stored digest verbatim and disables goal editing', () => {
    const run = makeSavedRun(makeSlim({
      digest: { compact: 'STORED COMPACT\n\nGoal: old goal', full: 'STORED FULL\n\nGoal: old goal' },
    }));
    render(<DigestPanel source={{ kind: 'saved', run }} />);
    expect(document.querySelector('pre')?.textContent).toContain('STORED COMPACT');
    expect(document.querySelector('pre')?.textContent).toContain('Goal: old goal');   // verbatim, goal included
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(screen.getByText(/goal.*can't be edited/i)).toBeInTheDocument();
  });

  it('compare mode builds the compare digest and the goal stays editable', () => {
    const before = makeSlim({ fps: { source: 'displayed', sourceLabel: 'x', stats: stat({ avg: 100 }) } });
    const after = makeSlim({ fps: { source: 'displayed', sourceLabel: 'x', stats: stat({ avg: 112 }) } });
    const comparison = compareRuns(before, after);
    const runB = makeSavedRun(before, { id: 'b', name: 'stock', createdAt: 1 });
    const runA = makeSavedRun(after, { id: 'a', name: 'tuned', createdAt: 2 });
    render(<DigestPanel source={{ kind: 'compare', before: runB, after: runA, comparison }} />);
    expect(document.querySelector('pre')?.textContent).toContain('HWiNFO before/after comparison');
    const textarea = screen.getByRole('textbox');
    expect(textarea).toHaveValue('did this change help, and what else can I tune?');
    fireEvent.change(textarea, { target: { value: 'is the undervolt stable?' } });
    expect(document.querySelector('pre')?.textContent).toContain('is the undervolt stable?');
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest src/ui/CompareView.test.tsx src/ui/CompareTable.test.tsx src/ui/DigestPanel.test.tsx` → FAIL.

- [ ] **Step 3: Implement `src/ui/CompareView.tsx`**

```tsx
import type { Comparison, SavedRun } from '../types';
import { Card, Button } from './primitives';
import { DIR_ARROW, deltaRowClass, fmtDelta, fmtSide } from './compareFormat';
import './CompareView.css';

export function CompareView({ before, after, comparison, onSwap, onExit }: {
  before: SavedRun;
  after: SavedRun;
  comparison: Comparison;
  onSwap: () => void;
  onExit: () => void;
}): JSX.Element {
  return (
    <Card className="compare-view">
      <div className="compare-view__header">
        <h2 className="compare-view__headline">{comparison.headline}</h2>
        <div className="compare-view__actions">
          <Button variant="subtle" onClick={onSwap}>Swap</Button>
          <Button variant="ghost" onClick={onExit}>Exit compare</Button>
        </div>
      </div>

      {comparison.mismatches.length > 0 && (
        <div className="compare-view__banner" role="status">
          {comparison.mismatches.map((m) => <p key={m.kind}>{m.message}</p>)}
        </div>
      )}
      <p className="compare-view__caveat u-dim">{comparison.caveat}</p>

      <table className="compare-view__table mono">
        <thead>
          <tr>
            <th />
            <th>BEFORE<span className="compare-view__run">{before.name}</span></th>
            <th>AFTER<span className="compare-view__run">{after.name}</span></th>
            <th>Δ</th>
          </tr>
        </thead>
        <tbody>
          {comparison.heroDeltas.map((d) => (
            <tr key={d.key} className={deltaRowClass(d)}>
              <th scope="row">{d.label}</th>
              <td>{fmtSide(d.before, d.unit)}</td>
              <td>{fmtSide(d.after, d.unit)}</td>
              <td className="compare-view__delta">
                {d.delta === null ? '—' : `${DIR_ARROW[d.direction]} ${fmtDelta(d)}`}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}
```

- [ ] **Step 4: Create `src/ui/CompareView.css`** (tokens only)

```css
.compare-view {
  display: flex;
  flex-direction: column;
  gap: var(--s4);
}

.compare-view__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--s4);
}

.compare-view__headline {
  font-family: var(--font-body);
  font-size: var(--text-lg);
  line-height: 1.3;
  margin: 0;
}

.compare-view__actions {
  display: flex;
  gap: var(--s2);
  flex-shrink: 0;
}

.compare-view__banner {
  background: var(--warn-dim);
  border: 1px solid var(--warn);
  border-radius: var(--r-md);
  padding: var(--s3) var(--s4);
  font-size: var(--text-sm);
}

.compare-view__banner p {
  margin: 0;
}

.compare-view__caveat {
  font-size: var(--text-xs);
  margin: 0;
}

/* numbers live on a solid recessed surface, never on glass */
.compare-view__table {
  width: 100%;
  border-collapse: collapse;
  background: var(--inset);
  border-radius: var(--r-md);
  font-size: var(--text-sm);
}

.compare-view__table th,
.compare-view__table td {
  text-align: right;
  padding: var(--s2) var(--s3);
  border-bottom: 1px solid var(--border);
}

.compare-view__table th[scope='row'] {
  text-align: left;
  font-family: var(--font-body);
  font-weight: 400;
  color: var(--text-dim);
}

.compare-view__run {
  display: block;
  font-size: var(--text-xs);
  font-weight: 400;
  color: var(--text-mute);
}

.delta--improved .compare-view__delta {
  color: var(--good);
}

.delta--worse .compare-view__delta {
  color: var(--bad);
}
```

- [ ] **Step 5: Implement `src/ui/CompareTable.tsx`**

```tsx
import type { Comparison, DiagEvent, DeltaStat } from '../types';
import { Card } from './primitives';
import { DIR_ARROW, deltaRowClass, fmtDelta, fmtSide } from './compareFormat';
import './CompareTable.css';

const STAT_LABEL: Record<DeltaStat, string> = {
  avg: 'avg', max: 'max', p1Low: '1% low', p5Low: '5% low', fired: 'samples fired',
};

function EventGroup({ title, events }: { title: string; events: DiagEvent[] }): JSX.Element {
  return (
    <div className="compare-table__group">
      <h4 className="u-label">{title}</h4>
      {events.length === 0 ? (
        <p className="u-dim">none</p>
      ) : (
        <ul className="compare-table__events">
          {events.map((e) => <li key={e.id}>[{e.severity}] {e.sentence}</li>)}
        </ul>
      )}
    </div>
  );
}

export function CompareTable({ comparison }: { comparison: Comparison }): JSX.Element {
  // a row with neither side measured says nothing — drop it
  const rows = comparison.sensorDeltas.filter((d) => d.before !== null || d.after !== null);
  return (
    <Card className="compare-table">
      <h3 className="compare-table__h">Per-stat deltas</h3>
      <div className="compare-table__wrap">
        <table className="compare-table__table mono">
          <thead>
            <tr>
              <th className="compare-table__name">Metric</th>
              <th>stat</th>
              <th>before</th>
              <th>after</th>
              <th>Δ</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((d) => (
              <tr key={`${d.key}:${d.stat}`} className={deltaRowClass(d)}>
                <th className="compare-table__name" scope="row">{d.label}</th>
                <td>{STAT_LABEL[d.stat]}</td>
                <td>{fmtSide(d.before, d.unit)}</td>
                <td>{fmtSide(d.after, d.unit)}</td>
                <td className="compare-table__delta">
                  {d.delta === null ? '—' : `${DIR_ARROW[d.direction]} ${fmtDelta(d)}`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h3 className="compare-table__h">Event diff</h3>
      <div className="compare-table__diff">
        <EventGroup title="Resolved (gone in AFTER)" events={comparison.eventDiff.resolved} />
        <EventGroup title="Introduced (new in AFTER)" events={comparison.eventDiff.introduced} />
        <EventGroup title="Persisted (in both)" events={comparison.eventDiff.persisted} />
      </div>
    </Card>
  );
}
```

- [ ] **Step 6: Create `src/ui/CompareTable.css`** (tokens only; solid instrument-bench surface like the nerd cards)

```css
.compare-table {
  background: var(--surface);
  display: flex;
  flex-direction: column;
  gap: var(--s4);
}

.compare-table__h {
  margin: 0;
  font-size: var(--text-sm);
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text-dim);
}

.compare-table__wrap {
  overflow-x: auto;
}

.compare-table__table {
  width: 100%;
  border-collapse: collapse;
  font-size: var(--text-sm);
}

.compare-table__table th,
.compare-table__table td {
  text-align: right;
  padding: var(--s1) var(--s3);
  border-bottom: 1px solid var(--border);
  white-space: nowrap;
}

th.compare-table__name {
  text-align: left;
  font-family: var(--font-body);
  font-weight: 400;
  color: var(--text-dim);
}

.delta--improved .compare-table__delta {
  color: var(--good);
}

.delta--worse .compare-table__delta {
  color: var(--bad);
}

.compare-table__diff {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: var(--s4);
}

.compare-table__events {
  margin: 0;
  padding-left: var(--s4);
  font-size: var(--text-sm);
}

@media (max-width: 860px) {
  .compare-table__diff {
    grid-template-columns: 1fr;
  }
}
```

- [ ] **Step 7: Rework `src/ui/DigestPanel.tsx`** to the discriminated `source` prop (full replacement):

```tsx
import { useState, useMemo } from 'react';
import type { AnalysisResult, Comparison, Digest, DigestMode, InferredSpecs, SavedRun } from '../types';
import { buildDigest } from '../digest/digest';
import { buildCompareDigest } from '../digest/compareDigest';
import { Card, Button } from './primitives';
import './DigestPanel.css';

const DEFAULT_GOAL = 'help me lower temps without losing FPS';
const COMPARE_GOAL = 'did this change help, and what else can I tune?';

export type DigestSource =
  | { kind: 'live'; result: AnalysisResult; specs: InferredSpecs }
  | { kind: 'saved'; run: SavedRun }
  | { kind: 'compare'; before: SavedRun; after: SavedRun; comparison: Comparison };

export function DigestPanel({ source }: { source: DigestSource }): JSX.Element {
  const [mode, setMode] = useState<DigestMode>('compact');
  const [goal, setGoal] = useState(source.kind === 'compare' ? COMPARE_GOAL : DEFAULT_GOAL);

  const digest = useMemo<Digest>(() => {
    switch (source.kind) {
      case 'live':
        // inject the caller's (possibly user-edited) specs so they flow into the prompt
        return buildDigest({
          log: { ...source.result.log, specs: source.specs },
          stats: source.result.stats,
          events: source.result.events,
          windows: source.result.windows,
          guidance: source.result.verdict.guidance,
          goal,
        });
      case 'saved':
        return source.run.result.digest;   // stored verbatim, original goal baked in
      case 'compare':
        return buildCompareDigest(source.before, source.after, source.comparison, { goal });
    }
  }, [source, goal]);

  function handleCopy() {
    navigator.clipboard.writeText(digest[mode]);
  }

  return (
    <div className="digest-panel">
      <div className="digest-panel__header">
        <h2 className="digest-panel__title">Copy prompt for my LLM</h2>
        <div className="digest-panel__toggle" role="group" aria-label="Digest mode">
          <Button
            variant={mode === 'compact' ? 'accent' : 'subtle'}
            onClick={() => setMode('compact')}
          >
            Compact
          </Button>
          <Button
            variant={mode === 'full' ? 'accent' : 'subtle'}
            onClick={() => setMode('full')}
          >
            Full
          </Button>
        </div>
      </div>

      {source.kind === 'saved' ? (
        <p className="u-dim">
          Saved runs keep the prompt they were analyzed with — the goal can't be edited here.
        </p>
      ) : (
        <>
          <label className="digest-panel__goal-label u-label" htmlFor="digest-goal">
            Your goal
          </label>
          <textarea
            id="digest-goal"
            className="digest-panel__goal"
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
            rows={2}
          />
        </>
      )}

      <Card tone="inset" className="digest-panel__well">
        <pre className="mono digest-panel__pre">{digest[mode]}</pre>
      </Card>

      <div className="digest-panel__footer">
        <span className="digest-panel__tokens u-dim">
          ~{digest.tokenEstimate[mode]} tokens
        </span>
        <Button variant="accent" onClick={handleCopy}>
          Copy prompt
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 8: Fix the one existing call site** in `src/App.tsx` (`Results`):

Old:

```tsx
        <DigestPanel result={result} specs={specs} />
```

New:

```tsx
        <DigestPanel source={{ kind: 'live', result, specs }} />
```

- [ ] **Step 9: Run tests + typecheck**

Run: `npx vitest src/ui` → PASS (including the reworked DigestPanel tests and all untouched UI tests). Run: `npm run build` → exits 0.

- [ ] **Step 10: Commit**

```bash
git add src/ui/CompareView.tsx src/ui/CompareView.css src/ui/CompareView.test.tsx src/ui/CompareTable.tsx src/ui/CompareTable.css src/ui/CompareTable.test.tsx src/ui/DigestPanel.tsx src/ui/DigestPanel.test.tsx src/App.tsx
git commit -m "feat(ui): compare views and live/saved/compare digest panel sources"
```

---

### Task 8: App wiring + `SavedRunView` + golden compare

**Files:**
- Create: `src/ui/SavedRunView.tsx`, `src/ui/SavedRunView.css`, `src/ui/SavedRunView.test.tsx`
- Modify: `src/App.tsx`
- Create: `src/engine/compare.golden.test.ts`

- [ ] **Step 1: Write failing tests**

Create `src/ui/SavedRunView.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SavedRunView } from './SavedRunView';
import { analyze } from '../engine/analyze';
import { slimResult } from '../compare/slim';
import { makeSavedRun } from '../compare/testkit';

const tinyCsv = [
  'Date,Time,"Total CPU Usage [%]","CPU Package [°C]","GPU Temperature [°C]","GPU Core Load [%]","Framerate Displayed (avg) [FPS]",',
  '9.6.2026,12:00:00.000,45.0,70.0,75.0,99.0,120.0,',
  '9.6.2026,12:00:02.000,55.0,72.0,77.0,98.0,118.0,',
].join('\n');
const run = makeSavedRun(slimResult(analyze(new TextEncoder().encode(tinyCsv))), { name: 'My saved run' });

describe('SavedRunView', () => {
  it('renders the stored verdict, name, digest and the summary-only notice', () => {
    const { container } = render(<SavedRunView run={run} mode="nerd" onBack={vi.fn()} />);
    expect(screen.getByText('My saved run')).toBeInTheDocument();
    expect(screen.getByText(run.result.verdict.headline)).toBeInTheDocument();
    expect(document.querySelector('pre')?.textContent).toContain('HWiNFO session summary');
    expect(screen.getByText(/re-drop the original CSV/i)).toBeInTheDocument();
    expect(container.textContent).not.toContain('NaN');
  });

  it('easy mode renders without the nerd findings list', () => {
    render(<SavedRunView run={run} mode="easy" onBack={vi.fn()} />);
    expect(screen.getByText('My saved run')).toBeInTheDocument();
  });

  it('Back fires the callback', () => {
    const onBack = vi.fn();
    render(<SavedRunView run={run} mode="easy" onBack={onBack} />);
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(onBack).toHaveBeenCalled();
  });
});
```

Create `src/engine/compare.golden.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { analyze } from './analyze';
import { slimResult } from '../compare/slim';
import { compareRuns } from '../compare/diff';
import { buildCompareDigest } from '../digest/compareDigest';
import type { SavedRun, SlimResult } from '../types';

const sample = (rel: string): Uint8Array =>
  new Uint8Array(readFileSync(join(process.cwd(), 'HWINFO samples', rel)));
const asRun = (id: string, name: string, createdAt: number, result: SlimResult): SavedRun =>
  ({ id, name, createdAt, result });

describe('compare (golden, real same-machine logs)', () => {
  // Same ASUS A16 laptop, same Superposition 1080p Extreme scene: stock 2460 MHz vs a
  // 0.9 V / 2520 MHz undervolt — the exact before/after this feature exists for.
  const before = slimResult(analyze(sample('AMD + Nvidia/A16_superposition_1080extreme_2460MHz.CSV')));
  const after = slimResult(analyze(sample('AMD + Nvidia/A16_superposition_1080extreme_0.9_2520MHz.CSV')));
  const c = compareRuns(before, after);

  it('same machine: no cpu/gpu mismatch; the workload caveat is still there', () => {
    expect(c.mismatches.every((m) => m.kind !== 'cpu' && m.kind !== 'gpu')).toBe(true);
    expect(c.caveat).toContain('same workload');
  });

  it('five hero rows with real numbers on both sides; every delta finite', () => {
    expect(c.heroDeltas).toHaveLength(5);
    const fps = c.heroDeltas[0];
    expect(fps.before).not.toBeNull();   // both logs carry an FPS source
    expect(fps.after).not.toBeNull();
    for (const d of [...c.heroDeltas, ...c.sensorDeltas]) {
      for (const v of [d.before, d.after, d.delta]) {
        if (v !== null) expect(Number.isFinite(v), `${d.key}/${d.stat}`).toBe(true);
      }
    }
  });

  it('deltas are sane and the headline says something', () => {
    const gpu = c.heroDeltas.find((d) => d.key === 'gpu.temp')!;
    expect(Math.abs(gpu.delta ?? 0)).toBeLessThan(20);   // same card, same scene
    expect(c.headline.length).toBeGreaterThan(0);
    expect(c.timeSplitDelta.before.dominant).toBe('gpu');   // locked by the existing golden
  });

  it('the compare digest stacks both runs, one Goal line, no NaN', () => {
    const digest = buildCompareDigest(
      asRun('b', 'stock 2460', 1, before),
      asRun('a', '0.9 V undervolt', 2, after),
      c,
    );
    expect(digest.full).toContain('=== BEFORE: stock 2460 ===');
    expect(digest.full).toContain('=== AFTER: 0.9 V undervolt ===');
    expect(digest.full).not.toContain('NaN');
    expect(digest.compact).not.toContain('NaN');
    expect((digest.full.match(/^Goal: /gm) ?? []).length).toBe(1);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest src/ui/SavedRunView.test.tsx src/engine/compare.golden.test.ts` → FAIL (`SavedRunView` not found; the golden file should fail only on the missing import if anything — if a golden assertion itself fails, e.g. the FPS source turns out absent in one log, adjust the *fixture expectation* after inspecting the real data, never the engine).

- [ ] **Step 3: Implement `src/ui/SavedRunView.tsx`**

```tsx
import type { SavedRun } from '../types';
import { HeroVerdict } from './HeroVerdict';
import { HeroStats } from './HeroStats';
import { FindingsList } from './FindingsList';
import { TimeSplitBar } from './TimeSplitBar';
import { PrimaryFix } from './PrimaryFix';
import { WorstMoments } from './WorstMoments';
import { DigestPanel } from './DigestPanel';
import { Card, Button } from './primitives';
import { fmtTimestamp } from './compareFormat';
import './SavedRunView.css';

// Read-only view of a stored run. Everything here comes from SlimResult — the raw
// arrays are gone, so the live-only nerd extras (timeline, core grid, sensor table)
// are deliberately absent and the notice says why.
export function SavedRunView({ run, mode, onBack }: {
  run: SavedRun;
  mode: 'easy' | 'nerd';
  onBack: () => void;
}): JSX.Element {
  const { verdict, windows } = run.result;
  return (
    <div className="results stack">
      <Card className="saved-run-bar">
        <div>
          <p className="u-label">Saved run</p>
          <p className="saved-run-bar__name">
            {run.name} <span className="mono u-dim">{fmtTimestamp(run.createdAt)}</span>
          </p>
        </div>
        <Button variant="ghost" onClick={onBack}>Back</Button>
      </Card>

      <HeroVerdict verdict={verdict} />
      <HeroStats hero={verdict.hero} />

      {verdict.timeSplit && (
        <TimeSplitBar split={verdict.timeSplit} activityKind={windows.activityKind} />
      )}

      {mode === 'easy' ? (
        <PrimaryFix fix={verdict.primaryFix} />
      ) : (
        <>
          <FindingsList findings={verdict.findings} showEvidence />
          <WorstMoments worst={windows.worst} baseMs={windows.logStartMs} />
        </>
      )}

      <DigestPanel source={{ kind: 'saved', run }} />

      <Card className="saved-run-notice">
        <p className="u-dim">
          Saved runs keep summary data only — re-drop the original CSV for the timeline,
          per-core grid, per-flag samples and the full sensor table.
        </p>
      </Card>
    </div>
  );
}
```

- [ ] **Step 4: Create `src/ui/SavedRunView.css`** (tokens only)

```css
.saved-run-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--s4);
}

.saved-run-bar__name {
  margin: 0;
  font-size: var(--text-lg);
}

.saved-run-notice p {
  margin: 0;
  font-size: var(--text-sm);
}
```

- [ ] **Step 5: Rewire `src/App.tsx`** (full replacement — the only behavioral changes vs the current file are the view state machine, the auto-save in the existing on-result effect, the enabled Compare-runs trigger, and the landing's Saved-runs button):

```tsx
import { useEffect, useRef, useState } from 'react';
import type { AnalysisResult, Comparison, InferredSpecs, SavedRun } from './types';
import { TopBar } from './ui/TopBar';
import { DropZone } from './ui/DropZone';
import { HeroVerdict } from './ui/HeroVerdict';
import { HeroStats } from './ui/HeroStats';
import { FindingsList } from './ui/FindingsList';
import { TimeSplitBar } from './ui/TimeSplitBar';
import { PrimaryFix } from './ui/PrimaryFix';
import { GuidanceCard } from './ui/GuidanceCard';
import { DigestPanel } from './ui/DigestPanel';
import { SpecsCard } from './ui/SpecsCard';
import { NerdView } from './ui/NerdView';
import { Mascot } from './ui/Mascot';
import { RunsPanel } from './ui/RunsPanel';
import { SavedRunView } from './ui/SavedRunView';
import { CompareView } from './ui/CompareView';
import { CompareTable } from './ui/CompareTable';
import { useRuns } from './ui/useRuns';
import { compareRuns } from './compare/diff';
import { useAnalysis, type AnalysisStatus } from './ui/useAnalysis';
import { loadSpecs, saveSpecs, EMPTY_SPECS } from './storage/specsStore';
import { Button } from './ui/primitives';
import './ui/App.css';

type UiMode = 'easy' | 'nerd';

type View =
  | { kind: 'live' }
  | { kind: 'saved'; run: SavedRun }
  | { kind: 'compare'; before: SavedRun; after: SavedRun; comparison: Comparison };

export function App() {
  const { status, result, error, analyzeFile, reset } = useAnalysis();
  const [mode, setMode] = useState<UiMode>('easy');
  const [specs, setSpecs] = useState<InferredSpecs | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [view, setView] = useState<View>({ kind: 'live' });
  const [runsOpen, setRunsOpen] = useState(false);
  const { runs, save, rename, remove, clear } = useRuns();
  // StrictMode mounts effects twice in dev; remember which result object was saved.
  const savedFor = useRef<AnalysisResult | null>(null);

  // On a fresh result, prefer the engine's detection. Reuse saved overrides only when they
  // belong to the same machine (same CPU + GPU), so one rig's log can't shadow another's.
  useEffect(() => {
    if (!result) return;
    const fresh = result.log.specs;
    const saved = loadSpecs();
    const sameMachine =
      !!saved &&
      saved.cpuModelGuess === fresh.cpuModelGuess &&
      saved.gpuModelGuess === fresh.gpuModelGuess;
    if (sameMachine) {
      setSpecs(saved);
    } else {
      setSpecs(fresh);
      saveSpecs(fresh);
    }
    if (savedFor.current !== result) {
      savedFor.current = result;
      save(result);
      setView({ kind: 'live' });   // a fresh analysis always lands on the live view
    }
  }, [result, save]);

  function openSettings() {
    setSpecs((cur) => cur ?? loadSpecs() ?? EMPTY_SPECS);
    setSettingsOpen(true);
  }

  function openRun(run: SavedRun) {
    setRunsOpen(false);
    setView({ kind: 'saved', run });
  }

  function startCompare(before: SavedRun, after: SavedRun) {
    setRunsOpen(false);
    setView({ kind: 'compare', before, after, comparison: compareRuns(before.result, after.result) });
  }

  function swapCompare() {
    setView((v) =>
      v.kind !== 'compare'
        ? v
        : { kind: 'compare', before: v.after, after: v.before, comparison: compareRuns(v.after.result, v.before.result) },
    );
  }

  function exitToLive() {
    setView({ kind: 'live' });
  }

  return (
    <div className="app">
      <TopBar mode={mode} onModeChange={setMode} onOpenSettings={openSettings} />
      <main className="app__main">
        {view.kind === 'saved' ? (
          <SavedRunView run={view.run} mode={mode} onBack={exitToLive} />
        ) : view.kind === 'compare' ? (
          <div className="results stack">
            <CompareView
              before={view.before}
              after={view.after}
              comparison={view.comparison}
              onSwap={swapCompare}
              onExit={exitToLive}
            />
            {mode === 'nerd' && <CompareTable comparison={view.comparison} />}
            <DigestPanel
              source={{ kind: 'compare', before: view.before, after: view.after, comparison: view.comparison }}
            />
          </div>
        ) : status === 'ready' && result ? (
          <Results
            result={result}
            specs={specs ?? result.log.specs}
            mode={mode}
            onSpecsChange={setSpecs}
            onReset={reset}
            onOpenRuns={() => setRunsOpen(true)}
          />
        ) : (
          <Landing
            status={status}
            error={error}
            onFile={analyzeFile}
            runCount={runs.length}
            onOpenRuns={() => setRunsOpen(true)}
          />
        )}
      </main>
      {settingsOpen && (
        <div className="settings-overlay" role="dialog" aria-modal="true" aria-label="System specs">
          <div className="settings-overlay__backdrop" onClick={() => setSettingsOpen(false)} />
          <div className="settings-overlay__panel">
            <SpecsCard specs={specs ?? EMPTY_SPECS} onChange={setSpecs} />
            <div className="settings-overlay__actions">
              <Button variant="accent" onClick={() => setSettingsOpen(false)}>Done</Button>
            </div>
          </div>
        </div>
      )}
      {runsOpen && (
        <RunsPanel
          runs={runs}
          onClose={() => setRunsOpen(false)}
          onOpenRun={openRun}
          onCompare={startCompare}
          onRename={rename}
          onDelete={remove}
          onClearAll={clear}
        />
      )}
      <footer className="app__footer u-dim">
        Runs entirely in your browser — your log never leaves your machine.
      </footer>
    </div>
  );
}

function Landing({
  status,
  error,
  onFile,
  runCount,
  onOpenRuns,
}: {
  status: AnalysisStatus;
  error: string | null;
  onFile: (file: File) => void;
  runCount: number;
  onOpenRuns: () => void;
}) {
  return (
    <section className="landing">
      <div className="landing__mascot">
        <Mascot mood="chill" size={104} />
      </div>
      <p className="landing__kicker u-label">HWiNFO sensor-log analyzer</p>
      <h1 className="landing__title">
        What the <span className="landing__f">F</span>PS is going on?
      </h1>
      <p className="landing__pitch">
        Drop a HWiNFO sensor log and get a plain-language verdict on what's holding your frame
        rate back — plus a copy-paste prompt for your favorite LLM.
      </p>
      <DropZone onFile={onFile} disabled={status === 'parsing'} />
      {runCount > 0 && (
        <Button variant="ghost" onClick={onOpenRuns}>
          Saved runs ({runCount})
        </Button>
      )}
      {status === 'parsing' && <p className="landing__status u-dim">Analyzing your log…</p>}
      {status === 'error' && (
        <p role="alert" className="landing__error">
          Couldn't read that log{error ? `: ${error}` : ''}. Try a different HWiNFO CSV.
        </p>
      )}
    </section>
  );
}

function Results({
  result,
  specs,
  mode,
  onSpecsChange,
  onReset,
  onOpenRuns,
}: {
  result: AnalysisResult;
  specs: InferredSpecs;
  mode: UiMode;
  onSpecsChange: (next: InferredSpecs) => void;
  onReset: () => void;
  onOpenRuns: () => void;
}) {
  const { verdict } = result;
  return (
    <div className="results stack">
      <HeroVerdict verdict={verdict} />
      <HeroStats hero={verdict.hero} />

      {verdict.timeSplit && (
        <TimeSplitBar split={verdict.timeSplit} activityKind={result.windows.activityKind} />
      )}

      {mode === 'easy' ? (
        <>
          <PrimaryFix fix={verdict.primaryFix} />
          {verdict.timeSplit === null && <GuidanceCard guidance={verdict.guidance} />}
        </>
      ) : (
        <>
          <FindingsList findings={verdict.findings} showEvidence />
          <GuidanceCard guidance={verdict.guidance} />
        </>
      )}

      <div className="results__cols">
        <DigestPanel source={{ kind: 'live', result, specs }} />
        <SpecsCard specs={specs} onChange={onSpecsChange} />
      </div>

      {mode === 'nerd' && <NerdView result={result} />}

      <div className="results__actions">
        <Button variant="ghost" onClick={onReset}>
          Analyze another log
        </Button>
        <Button variant="subtle" onClick={onOpenRuns}>
          Compare runs
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Run the new tests, then the whole world**

Run: `npx vitest src/ui/SavedRunView.test.tsx src/engine/compare.golden.test.ts` → PASS.
Run: `npm run test` → full suite green (the golden snapshot in `analyze.golden.test.ts` is untouched — nothing in this plan changes digest or event text for single runs).
Run: `npm run build` → `tsc -b` strict + Vite both exit 0.

- [ ] **Step 7: Commit**

```bash
git add src/ui/SavedRunView.tsx src/ui/SavedRunView.css src/ui/SavedRunView.test.tsx src/App.tsx src/engine/compare.golden.test.ts
git commit -m "feat(app): wire saved runs, compare flow and read-only saved-run view"
```

---

## Verification (end of item #1)

1. `npm run test` — full suite green, including `src/compare/*`, `src/storage/runsStore.test.ts`, the new UI tests and `src/engine/compare.golden.test.ts`.
2. `npm run build` — `tsc -b` strict typecheck + Vite production build exit 0.
3. `npm run preview` — manual pass:
   - Drop `HWINFO samples/AMD + Nvidia/A16_superposition_1080extreme_2460MHz.CSV` → results render; **Compare runs** button is enabled; the run appears in the panel auto-named `NVIDIA GeForce RTX 5070 Laptop — HH:MM`.
   - Drop `A16_superposition_1080extreme_0.9_2520MHz.CSV`, open Runs, rename one run, select both, hit **Compare** → side-by-side `BEFORE | AFTER | Δ` with arrows; green/red only on temps/power/FPS rows; **Swap** flips the columns and re-derives every delta; **Exit compare** returns to the live result.
   - Switch to Nerd → full per-stat table + event diff appear. **Copy prompt** → pasted text starts with the delta summary and stacks both stored digests with exactly one `Goal:` line.
   - Drop a cross-machine log (any `Intel + Nvidia/*.CSV`) and compare against an A16 run → the `--warn` mismatch banner names the CPU/GPU differences; the diff still renders.
   - Click a run row → read-only saved view with the stored verdict/digest, goal editing disabled, and the "re-drop the original CSV" notice; reload the page → the runs list survives, reopening still works.
   - Save 21 runs (drop logs repeatedly) → the list caps at 20, oldest gone.
4. DevTools: Network tab stays empty after load (no requests on drop/compare/save); Application → Local Storage shows **only** `wtfps.runs.v1` and `wtfps.specs.v1` keys; total origin storage stays well under quota with 20 runs (~≤ 1 MB).

## Future / stretch (not this plan)

- Runs-list polish: search, tags, pinning (pin survives FIFO), bulk delete.
- A local HTML/PNG **compare report card** arrives with item #5 (digest & profiles), which also adds the `profile` option to `buildCompareDigest`.
- Item #6 (packaging & a11y) retrofits `RunsPanel` with the shared `useModal` focus trap and Escape-to-close.
- A "re-attach CSV to saved run" flow (drop the original file onto a saved run to restore full Nerd detail) would pair with timelines (#2).

---

## Self-review checklist (for the implementer, before calling this done)

- Every deviation (1–7) maps to a task: #1 → Task 1 Step 6 probe + size test; #2 → Task 1; #3 → Tasks 7–8 (`SavedRunView`, DigestPanel saved mode); #4 → Task 4 (`timeSplitDelta`, 5 mismatch kinds, `totalMs` duration, legacy source); #5 → Task 4 (subtype + thermalCollapse edits + event-diff key); #6 → Task 3 (polarity sets + hero fallback chain); #7 → Task 4 (`caveat`) and Tasks 5/7 (rendered in digest + banner).
- Cross-plan names are exact: `SlimResult`, `SavedRun`, `slimResult`, `compareRuns`, `buildCompareDigest(before, after, comparison, opts?: { goal?: string })`, `DiagEvent.subtype`, `RunsPanel`.
- No UI file touches `theme.css`, `cx.ts`, `primitives/`, or `Mascot.tsx`; all new CSS is `var(--…)`-only; numbers render in `.mono` on solid surfaces; missing values are `—`, never `NaN`; `fps.source === 'none'` is never scored as a regression.
- The temporary size probe is deleted; `wtfps.runs.v1` and `wtfps.specs.v1` are the only storage keys; no network calls anywhere.

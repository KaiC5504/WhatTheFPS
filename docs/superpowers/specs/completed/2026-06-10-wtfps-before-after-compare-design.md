# WTFPS v2 — Before/after comparison (+ lightweight history) — Design Spec

**Status:** Approved design, pre-implementation. Supersedes nothing; extends the v1 product.
**Date:** 2026-06-10
**Predecessors:** [`specs/2026-06-09-wtfps-hwinfo-analyzer-design.md`](./2026-06-09-wtfps-hwinfo-analyzer-design.md) (v1 product/design), [`plans/2026-06-09-wtfps-hwinfo-analyzer.md`](../plans/2026-06-09-wtfps-hwinfo-analyzer.md) (v1 plan, incl. the original v2 roadmap).

---

## Context

v1 ships a complete, fully client-side HWiNFO analyzer: parse one CSV → Easy/Nerd verdict with
five hero numbers → token-efficient "copy prompt for my LLM" digest. It is feature-complete and
tested (158 tests, golden coverage on all 12 real sample logs). A **disabled "Compare runs (soon)"
button** already sits in `src/ui/App.tsx` as the placeholder for this work.

The natural next step — and the v2 roadmap's stated #1 priority — is **before/after comparison**:
the user re-tests after an undervolt / fan-curve / power-limit change and wants a plain-language
answer to "did it help?". This spec covers that feature, with **lightweight session history folded
in**, because both rest on one shared foundation: saved runs in `localStorage`.

**Foundational constraint (from the engine):** a full `AnalysisResult` serializes to ~15 KB and
holds **summary stats per sensor**, not raw per-sample arrays (those are discarded after
`computeStats`; only `fps.clean` survives). Saved runs are therefore cheap to persist and to diff,
but a saved run **cannot be re-charted or re-windowed later** — that capability belongs to the
timelines item (#2), which must read live samples, not saved runs.

---

## Refined v2 roadmap

This session re-shaped the roadmap. Each item is still its own brainstorm → spec → plan cycle.

1. **Before/after comparison + lightweight session history** — *this spec.*
2. **Interactive timelines & windowing** — uPlot timelines with event markers; brush-to-select a
   window and recompute stats; auto-segment idle/load/benchmark. (Needs raw samples; does **not**
   read from saved runs.)
3. **Deeper diagnostics** — frame-pacing/micro-stutter, VRM/mem-junction/drive temps, fan-vs-temp,
   per-core detail, confidence levels.
4. **Specs & normalization breadth** — optional HWiNFO report-file parsing; broaden the registry to
   desktop Ryzen/Intel, Radeon dGPU, Arc; small reference DB of expected temp ranges.
5. **Digest & profiles** — goal presets; multiple LLM output profiles; local HTML/PNG report card.
6. **Packaging & a11y** — PWA/offline; full a11y pass.

**Stretch / maybe-later:** Tauri desktop app · live CSV tail mode · privacy-preserving share link
(URL-encoded digest).

**Governing principles (carried from v1, apply to every v2 feature):** 100% client-side / no network;
never invent numbers (all diffs computed from real data); permanent Easy/Nerd split; dark
control-room aesthetic with warm heat colors and a single blue accent; graceful degradation when
data is missing; `localStorage` is the only database.

---

## Item #1 — Goals & locked decisions

**Goal:** Let the user compare any two analyzed runs and get (a) a plain-language headline + hero
deltas, (b) a full per-sensor delta table in Nerd mode, and (c) a compare-aware LLM digest — all
client-side, honest about mismatches.

Decisions settled during brainstorming:

| Question | Decision |
|---|---|
| How do two runs reach the compare view? | **Auto-save every analyzed run** to a persisted "Runs" list (auto-named, editable, timestamped, deletable). Compare = **pick any two**. |
| Mismatched runs (machine / FPS source / duration)? | **Warn but allow** — caveat banner, diff still computed. |
| Diff depth | **Tiered**: Easy = headline + side-by-side hero deltas; Nerd = full per-sensor delta table. Covers **stats and events**. |
| Easy compare layout | **Side-by-side columns** — `BEFORE | AFTER | Δ`, trend arrow + semantic color per row. |
| Compare digest | **Both runs' full digests** labeled `BEFORE`/`AFTER`, **plus** a delta summary block. |
| History scope now | Save / auto-name / rename / delete / reopen / clear-all + a 20-run cap. Search, tags, bulk ops = later polish. |

---

## Architecture

The comparison is a small, pure addition layered on the existing engine — **no changes to the
analysis pipeline or the worker**. Two analyzed `AnalysisResult`s are diffed on the main thread
(cheap arithmetic over already-computed stats).

```
analyze() ──► AnalysisResult ──► runsStore.saveRun() ──► localStorage 'wtfps.runs.v1'
                                                              │
   user picks 2 runs (RunsPanel) ◄────── loadRuns() ─────────┘
                                  │
                                  ▼
                  compareRuns(before, after) ──► Comparison
                                  │
            ┌─────────────────────┼──────────────────────┐
            ▼                     ▼                      ▼
      CompareView           CompareTable          buildCompareDigest()
   (Easy: side-by-side    (Nerd: full delta      (stacked BEFORE/AFTER
    hero deltas +          table)                 + delta summary)
    headline + banner)
```

### Data model (new types in `src/types.ts`)

`src/types.ts` is the central contract — read it first (per `CLAUDE.md`). Add:

- `SavedRun { id: string; name: string; createdAt: number; result: AnalysisResult }`
- `SensorDelta { key: CanonicalKey; label: string; before: number | null; after: number | null;
  delta: number | null; direction: 'up' | 'down' | 'flat';
  polarity: 'improved' | 'worse' | 'neutral' | 'unknown' }`
- `EventDiff { resolved: DiagEvent[]; introduced: DiagEvent[]; persisted: DiagEvent[] }`
- `Mismatch { kind: 'cpu' | 'gpu' | 'fpsSource' | 'duration'; message: string }`
- `Comparison { before: SavedRun; after: SavedRun; heroDeltas: SensorDelta[];
  sensorDeltas: SensorDelta[]; eventDiff: EventDiff; mismatches: Mismatch[]; headline: string }`

### Storage — `src/storage/runsStore.ts` (new)

Mirrors `specsStore.ts` exactly: versioned key, `try/catch`-swallow on quota/private-mode.

- Key: `wtfps.runs.v1`.
- API: `saveRun(result, name?) → SavedRun`, `loadRuns(): SavedRun[]`, `renameRun(id, name)`,
  `deleteRun(id)`, `clearRuns()`.
- **Soft cap: keep the 20 most recent**, FIFO-evict the oldest on overflow (pinning deferred).
- Stores the **full `AnalysisResult`** per run (~15 KB) so a run can be *reopened*, not only diffed.
- Auto-name: `<gpuModelGuess ?? 'Run'> — <HH:MM>` from the log's specs + save time; user-editable.

### Compare engine — `src/compare/diff.ts` (new, pure)

`compareRuns(before: AnalysisResult, after: AnalysisResult): Comparison`

- **Sensor deltas** from each run's `result.stats[key]` (and `fps.stats`) — the existing diffable
  surface. Display labels reuse `sensors/registry.ts`.
- **Polarity table** drives green/red coloring:
  - *lower is better*: all temps, power, RAM/pagefile load, throttle & perf-limit flag counts.
  - *higher is better*: FPS (avg + 1%/5% lows).
  - *neutral* (show Δ, no good/bad color): ambiguous metrics — CPU/GPU usage, clocks.
- **Event diff:** match `before.events` ↔ `after.events` by `event.type` → `resolved` /
  `introduced` / `persisted` (e.g. throttling 12→0 = resolved).
- **Mismatch detection:** compare `specs.cpuModelGuess` / `gpuModelGuess` (machine), `fps.source`
  (displayed vs presented vs none), and duration (`rowCount × pollMs`; warn at >50% difference).
  Always append a fixed "confirm both runs were the same workload" caveat — HWiNFO logs carry no
  game/scene identity, so we can't verify it.
- **Headline:** one or two plain sentences from the top deltas + event diff, in the same voice as
  `buildVerdict` ("Undervolt held FPS and ran 6 °C cooler. Throttling is gone.").

### Compare digest — `src/digest/compareDigest.ts` (new)

`buildCompareDigest(before, after, comparison, opts): Digest`

- Reuse `buildDigest` per run; label them `BEFORE` / `AFTER`; prepend a **delta summary** block (the
  headline + meaningful sensor/event deltas + a compare-aware goal line, default
  "did this change help, and what else can I tune?").
- `tokenEstimate` = sum of both digests + summary. Never includes raw CSV (inherited).

### UI (follow `src/ui/DESIGN.md`)

- `src/ui/useRuns.ts` — hook owning the saved-runs list + the two-run selection state.
- `src/ui/RunsPanel.tsx` — modal/drawer listing saved runs (name [editable], timestamp, specs chip,
  delete; "Clear all"). Row click = **reopen** that run's normal results view; checkbox = select for
  compare; two selected enables **Compare**. Opened by enabling the existing `App.tsx` "Compare runs"
  button. May use `GlassCard` (modals are allowed glass).
- `src/ui/CompareView.tsx` — Easy-mode **side-by-side** `BEFORE | AFTER | Δ` hero block + headline +
  mismatch banner (`--warn`) + swap/exit controls. **Solid surface, mono/tabular figures**; arrows
  colored only for clear-polarity rows.
- `src/ui/CompareTable.tsx` — Nerd-mode full per-sensor delta table (before → after → Δ, every stat).
- Extend `src/ui/DigestPanel.tsx` to accept an optional `comparison` and call `buildCompareDigest`.

`src/ui/App.tsx` wiring: auto-save each successful analysis via `runsStore` (in the same effect that
restores/saves specs); hold compare state (selected ids + active `Comparison`); when a comparison is
active, render `CompareView` (+ `CompareTable` in Nerd) and the compare digest in place of the
single-run view.

## Data flow

1. User drops a CSV → worker runs `analyze()` → `AnalysisResult` (unchanged path).
2. On success, `App` auto-saves the run via `runsStore.saveRun` and refreshes the Runs list.
3. User opens **Runs** (the enabled compare button), selects two, hits **Compare**.
4. `compareRuns` produces a `Comparison` on the main thread.
5. Easy mode renders `CompareView`; Nerd mode adds `CompareTable`; the digest panel switches to the
   compare digest. Swap/exit return to single-run view.

## Error handling & edge cases

- **Mismatch:** never blocks; renders a `--warn` banner naming each `Mismatch`.
- **Missing metric in one run** (sensor present in only one log): `before`/`after` is `null`,
  `delta` `null`, polarity `unknown`; row shows "—" on the missing side (never `NaN`, per v1 rule).
- **`fps.source === 'none'`** in either run: FPS row shows "no framerate logged"; not counted as a
  regression.
- **localStorage unavailable / quota:** `runsStore` swallows and degrades to in-memory for the
  session (same posture as `specsStore`).
- **Identical runs / zero deltas:** headline states "essentially unchanged"; arrows are flat/neutral.

## Easy vs Nerd

- **Easy:** headline sentence + the five side-by-side hero deltas + mismatch banner. Reassuring,
  curated to what changed most.
- **Nerd:** everything above + the full per-sensor delta table and the event diff breakdown
  (resolved / introduced / persisted).

---

## Critical files

- **New:** `src/storage/runsStore.ts`, `src/compare/diff.ts`, `src/digest/compareDigest.ts`,
  `src/ui/useRuns.ts`, `src/ui/RunsPanel.tsx`, `src/ui/CompareView.tsx`, `src/ui/CompareTable.tsx`
- **Changed:** `src/types.ts` (compare types), `src/ui/App.tsx` (auto-save + compare state + enable
  button), `src/ui/DigestPanel.tsx` (compare mode)
- **Reused as-is:** `src/storage/specsStore.ts` (pattern), `src/stats/percentiles.ts` (`Stats`),
  `src/digest/digest.ts` (`buildDigest`), `src/sensors/registry.ts` (labels), `src/detect/testkit.ts`
  (synthetic logs for tests)

## Testing (TDD, colocated)

- `src/compare/diff.test.ts` — two synthetic `AnalysisResult`s: sensor deltas/direction/polarity,
  event diff (resolved/introduced/persisted), each mismatch kind fires, missing-metric → `null` not `NaN`.
- `src/digest/compareDigest.test.ts` — output has `BEFORE`/`AFTER` blocks + delta summary,
  `tokenEstimate` sums, no raw CSV timestamp.
- `src/storage/runsStore.test.ts` (jsdom) — save/load/rename/delete, 20-run cap eviction, malformed
  JSON tolerated.
- UI (jsdom + RTL): `RunsPanel` enables Compare only with two selected; `CompareView` renders the
  side-by-side deltas with the correct color class; mismatch banner appears on a CPU/GPU mismatch.
- **Golden:** extend `src/engine/` golden test to compare two real same-machine logs from
  `HWINFO samples/` (e.g. the Intel+Nvidia stock vs `…undervolt-65…` pair) → sensible deltas, no `NaN`.

## Verification (manual, post-implementation)

1. `npm run test` — full suite green incl. new compare unit/UI tests and the golden compare.
2. `npm run build` — `tsc -b` (strict) + Vite succeed.
3. `npm run preview` — drop two real same-machine logs: both auto-appear in Runs; selecting two opens
   the side-by-side compare with correct arrows/colors; mismatch banner behaves on a cross-machine
   pair; Easy↔Nerd toggles the full delta table; "Copy prompt" yields the stacked BEFORE/AFTER digest
   + summary.
4. DevTools: Network tab empty after load; only `localStorage` (`wtfps.runs.v1`) written.

## Out of scope (future items)

Timelines/windowing (#2), deeper diagnostics (#3), specs breadth & report parsing (#4), digest
profiles & report card (#5), packaging/a11y (#6), and the stretch trio (Tauri, live tail, share link).
Richer history management (search, tags, pinning, bulk delete) is a later polish pass on this feature.

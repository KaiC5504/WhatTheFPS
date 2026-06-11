# WTFPS v2 #3 — Deeper Diagnostics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Three new root-cause analyzers — frame-pacing/micro-stutter, unresponsive fan curves, and storage-driven stutter — backed by new drive and VRM sensor mappings and a multi-instance merge in normalize (a log can carry several drives; the worst one is the signal).

**Architecture:** No new pipeline stages. The registry learns the drive/VRM columns (Task 1), normalize learns to fold repeated columns into a per-row max series (Task 2), a small pure-math module `src/causes/pacing.ts` provides shared stutter primitives (Task 3), and three new cause analyzers with the standard `(log, stats, windows) => DiagEvent[]` signature plug into the existing array in `src/engine/analyze.ts` (Tasks 4–7). Verdict/digest surfacing is automatic — events flow through the existing findings ranking and events block; the only surfacing edits are two new sensor-table rows and one guidance entry.

**Tech Stack:** TypeScript 5 strict, Vitest (node env for all engine code). No new dependencies.

**Baseline (assumed merged before this plan):**
- v2 plan #1 (compare/history): `DiagEvent` has an optional `subtype?: string` field. This plan uses it to record the frame-time source on stutter events. Task 4 includes a drift guard in case `makeEvent` doesn't forward it yet.
- v2 plan #2 (interactive timelines): the Nerd timeline paints a marker for every `DiagEvent` with non-empty `windowIndexes` and `severity !== 'info'`. **The new detectors get timeline markers for free by setting `windowIndexes`** — no UI work in this plan beyond two sensor-table rows.

**Out of scope:** chipset temperature (no sample evidence, low diagnostic value); per-direction `Read Activity`/`Write Activity` columns (`Total Activity` covers the signal); drive wear/health columns (`Drive Remaining Life`, `Drive Available Spare`, `Drive Failure`, `Drive Warning`, `Total Host Writes/Reads`); the `GT:`/`RING:` VR thermal alert variants; verdict/headline template changes; any timeline UI work. `gpu.memJunction` already exists — do not re-add it.

**Commit style:** single-line conventional commits, NO Co-Authored-By or any other trailer.

---

## Design decisions

**1. New keys (exact, locked).** `CanonicalKey` gains `drive.tempC`, `drive.activityPct`, `drive.readRateMbps`, `drive.writeRateMbps`, `vrm.tempC`. `FlagKey` gains `flag.cpu.vrThermalAlert`. Event types are exactly `'stutter'`, `'fan-curve'`, `'storage-stutter'`. Plan #4 (vendor aliases) may add more column spellings later; this plan maps only names proven in the sample logs.

**Column-name provenance** (verified 2026-06-11 by reading the header line of every CSV under `HWINFO samples/`; the registry matches the lower-cased name with the `[unit]` already stripped by `parsing/columns`):

| Exact header (raw) | Found in |
|---|---|
| `"Drive Temperature [°C]"`, `"Drive Temperature 2 [°C]"` | all 5 `AMD + Nvidia/A16_*.CSV` (one NVMe drive, two thermal sensors); drive #1 section of all 8 `Intel + Nvidia/*.CSV` |
| `"Drive Temperature [°C]"`, `"Drive Temperature 3 [°C]"` | drive #2 section of all 8 `Intel + Nvidia/*.CSV` — so the Intel logs carry **four** drive-temp columns, with instance numbers 2 *and* 3 |
| `"Total Activity [%]"`, `"Read Rate [MB/s]"`, `"Write Rate [MB/s]"` | all 13 samples (×1 set in AMD logs, ×2 sets in Intel logs — one per drive) |
| `"Read Activity [%]"`, `"Write Activity [%]"` | all 13 samples — deliberately left unmapped (out of scope) |
| `"CPU VDDCR_VDD VRM (SVI3 TFN) [°C]"`, `"CPU VDDCR_SOC VRM (SVI3 TFN) [°C]"`, `"CPU VDD_MISC VRM (SVI3 TFN) [°C]"` | all 5 `AMD + Nvidia/A16_*.CSV` only (AMD SVI3 telemetry; Intel logs have no VRM temp column) |
| `"IA: VR Thermal Alert [Yes/No]"` | all 8 `Intel + Nvidia/*.CSV` (the `GT:`/`RING:` variants also exist there and stay unmapped) |

`vrm.tempC` maps all three SVI3 rails onto one key (worst rail wins via the multi-merge below) — the user question is "are the VRMs cooking?", not "which rail?". Beware the near-miss: `CPU VDDCR_VDD Voltage (SVI3 TFN)` (a voltage, already mapped to `cpu.coreVoltage`) vs `CPU VDDCR_VDD VRM (SVI3 TFN)` (the temperature we want).

**2. Multi-instance merge (`multi: 'max'`).** `SensorDef` gains optional `multi?: 'max'`. For keys so marked, normalize aggregates ALL matching columns into one per-row-max series (null-safe: max of the non-null values, null only when every instance is null on that row) — the worst drive/rail is the signal. Non-marked keys keep the existing first-claim-wins rule untouched (the `claimed` Set in `normalize.ts`). All four drive keys and `vrm.tempC` are `multi: 'max'`.

**3. Shared pacing math in `src/causes/pacing.ts`.** Pure, dependency-light (reuses `stats/percentiles`): `gameplayRowSet(wa)` (rows covered by gameplay windows — menus/loading legitimately spike and must be excluded), `stutterIndex(series, rows)` = p99/avg of gameplay frame-time samples (1.0 = perfectly even), `gameplayMedian`, `spikeRows` / `spikeClusters(series, rows)` = runs of ≥2 consecutive samples above 2× the gameplay median, and `rowsToWindowIndexes(rows, windows)`. All-null/empty/thin-data safe (returns null/[] below 20 samples).

**4. `framePacing.ts` — honesty constraint.** Source is `pm.frameTimeMs`, falling back to `rtss.frameTimeMs`. Event `type: 'stutter'`, `subtype` = `'presentmon'` | `'rtss'`. Warn at stutterIndex ≥ 1.8 OR ≥ 3 spike clusters; bad at ≥ 2.5. HWiNFO frame-time columns are **per-poll averages of many frames, not per-frame data** — whatever variability survives that averaging is real and *understated*, so the sentence must say "sampled frame-time variability", the evidence tier is `'measured'`, and the polling caveat goes in `evidence.basis`. Sets `windowIndexes` to the windows containing spiked samples, so the timeline marks them (plan #2 contract). Skipped for workload (no-FPS) logs.

**5. `fanCurve.ts` — flat fan under rising temps.** Per pair (`gpu.temp`-derived `metrics.gpuTempC` with `fan.gpuRpm`; `metrics.cpuTempC` with `fan.cpuRpm`), over gameplay windows: temp rises ≥ 10 °C (first-quarter mean → last-quarter mean) while every gameplay-window fan RPM stays within ±5% of its early-gameplay mean AND the flat level sits below 90% of the fan's own session max → `type: 'fan-curve'` warn ("fans didn't respond to rising temps — check fan curve / dust"). Fan at/near its observed max → NO event (cooling maxed ≠ bad curve). Corollary worth stating: if the fan never went faster *anywhere* in the log, we cannot prove headroom existed and stay silent — the only confident call is when the log itself shows the fan can spin faster. Missing fan sensor → no event (`guidance.ts` already asks for fans).

**6. `storageStutter.ts` — co-location, not causation.** Windows containing a frame-time spike cluster (reuses `pacing.spikeClusters` — no duplicated math) where `drive.activityPct` window-mean exceeds 3× its gameplay median OR `drive.readRateMbps` window-max exceeds its gameplay p95 → `type: 'storage-stutter'`, info for one matched cluster / warn for ≥ 2, with `windowIndexes`. Requires both a frame-time sensor and at least one drive sensor. Absolute floors (activity ≥ 10%, read rate ≥ 50 MB/s) guard the relative gates: a near-idle drive's median/p95 is ~0 and any blip would otherwise match. Evidence tier `'inferred'` — co-location is correlation; the basis says so.

**7. Surfacing is automatic.** Events flow into findings + the digest events block with zero digest-logic changes. The only surfacing edits: the digest **full** sensor set (`FULL_EXTRA_SENSORS` in `src/digest/digest.ts`) and the NerdView sensor table (`SENSOR_ORDER` in `src/ui/NerdView.tsx`) gain `drive.tempC` and `vrm.tempC` rows (identifiers verified against current source), plus one new `guidance.ts` entry asking for drive sensors when absent (so the digest tells the user the storage-stutter check was blind).

**8. Golden tests are the threshold guardrail.** All three causes register in `analyze.ts`; the goldens then assert NO stutter/fan-curve/storage-stutter event fires on the 11 benchmark samples (Cinebench + Superposition runs — a "stutter" call on a clean fixed-scene benchmark is a false positive by definition). If one fires, the implementer must TUNE the gates (`SPIKE_FACTOR`, `WARN_INDEX`/`WARN_CLUSTERS`, `ACTIVITY_BURST_FACTOR`, `TEMP_RISE_C`) and document the change in the commit message — never delete the assertion. The two real gameplay logs (`KaiC_*`) may legitimately fire; for those the goldens assert honesty invariants instead (non-info events carry `windowIndexes`; stutter sentences say "Sampled").

---

## File map

| File | Action | Responsibility |
|---|---|---|
| `src/types.ts` | modify | `CanonicalKey` drive/VRM members, `FlagKey` VR-thermal member |
| `src/sensors/registry.ts` | modify | `multi?: 'max'` on `SensorDef`, `'drive'` domain, `numbered()` matcher, 6 new defs |
| `src/sensors/registry.test.ts` | modify | exact-header tests incl. numbered instances |
| `src/sensors/normalize.ts` | modify | per-row-max merge for `multi: 'max'` keys |
| `src/sensors/normalize.test.ts` | modify | merge + null handling + first-claim-wins regression |
| `src/causes/pacing.ts` | create | shared stutter math (index, clusters, row→window mapping) |
| `src/causes/pacing.test.ts` | create | synthetic-series tests |
| `src/causes/framePacing.ts` | create | micro-stutter analyzer (`'stutter'`) |
| `src/causes/framePacing.test.ts` | create | smooth/spiky/RTSS-fallback/bad-escalation tests |
| `src/causes/events.ts` | modify (drift guard only) | `subtype` passthrough if plan #1 didn't add it |
| `src/causes/fanCurve.ts` | create | unresponsive fan-curve analyzer (`'fan-curve'`) |
| `src/causes/fanCurve.test.ts` | create | climb+flat / ramping / maxed / missing-sensor tests |
| `src/causes/storageStutter.ts` | create | storage co-location analyzer (`'storage-stutter'`) |
| `src/causes/storageStutter.test.ts` | create | co-location / lone-spike / missing-sensor tests |
| `src/engine/analyze.ts` | modify | register the three causes |
| `src/digest/digest.ts` | modify | `FULL_EXTRA_SENSORS` + drive/VRM rows |
| `src/digest/digest.test.ts` | modify | full-digest row test |
| `src/ui/NerdView.tsx` | modify | `SENSOR_ORDER` + drive/VRM rows |
| `src/verdict/guidance.ts` | modify | missing drive-sensor guidance |
| `src/verdict/guidance.test.ts` | modify | guidance tests (incl. fixing the fully-instrumented case) |
| `src/engine/analyze.golden.test.ts` | modify | drive/VRM claim assertions + no-false-positive guardrail |
| `src/engine/__snapshots__/analyze.golden.test.ts.snap` | regenerate | digest gains drive-temp row on the snapshot log |

Run all tests with `npm run test`; single file with `npx vitest src/causes/pacing.test.ts`. Typecheck via `npm run build`.

---

### Task 1: Types + registry defs for drive/VRM sensors

**Files:**
- Modify: `src/types.ts`
- Modify: `src/sensors/registry.ts`
- Test: `src/sensors/registry.test.ts`

- [ ] **Step 1: Write failing registry tests** (append inside the existing `describe('findSensor')` block; every string below is verbatim from the sample headers — see provenance table)

```ts
  it('maps drive sensors including the numbered instances HWiNFO emits per extra thermal sensor', () => {
    expect(key('Drive Temperature')).toBe('drive.tempC');
    expect(key('Drive Temperature 2')).toBe('drive.tempC');   // AMD + Intel drive #1
    expect(key('Drive Temperature 3')).toBe('drive.tempC');   // Intel drive #2
    expect(key('Total Activity')).toBe('drive.activityPct');
    expect(key('Read Rate')).toBe('drive.readRateMbps');
    expect(key('Write Rate')).toBe('drive.writeRateMbps');
    // per-direction activity and wear columns stay unmapped (out of scope)
    expect(key('Read Activity')).toBeNull();
    expect(key('Drive Remaining Life')).toBeNull();
    expect(key('Drive Temperature X')).toBeNull();            // numbered means digits only
  });
  it('maps every AMD SVI3 VRM rail temp onto one worst-rail key', () => {
    expect(key('CPU VDDCR_VDD VRM (SVI3 TFN)')).toBe('vrm.tempC');
    expect(key('CPU VDDCR_SOC VRM (SVI3 TFN)')).toBe('vrm.tempC');
    expect(key('CPU VDD_MISC VRM (SVI3 TFN)')).toBe('vrm.tempC');
    // the Voltage near-miss must keep resolving to the existing voltage key
    expect(key('CPU VDDCR_VDD Voltage (SVI3 TFN)')).toBe('cpu.coreVoltage');
  });
  it('maps the Intel core VR thermal alert; GT/RING variants stay unmapped', () => {
    expect(key('IA: VR Thermal Alert')).toBe('flag.cpu.vrThermalAlert');
    expect(key('GT: VR Thermal Alert')).toBeNull();
    expect(key('RING: VR Thermal Alert')).toBeNull();
  });
  it('marks drive/VRM keys for the per-row-max merge', () => {
    const def = findSensor('Drive Temperature 2');
    expect(def!.multi).toBe('max');
    expect(def!.domain).toBe('drive');
    expect(findSensor('CPU VDDCR_VDD VRM (SVI3 TFN)')!.multi).toBe('max');
    expect(findSensor('GPU Temperature')!.multi).toBeUndefined();
  });
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest src/sensors/registry.test.ts` → new tests FAIL (`findSensor` returns null / `multi` undefined). The `vrm.tempC` / `drive.*` strings won't even compile until types change — that's the same failure signal.

- [ ] **Step 3: Add the keys to `src/types.ts`**

In `CanonicalKey`, replace:

```ts
  // core voltages (undervolt headroom) and fan speeds (cooling headroom)
  | 'gpu.coreVoltage' | 'cpu.coreVoltage' | 'fan.cpuRpm' | 'fan.gpuRpm'
  // fps (filled via FpsData, not a plain series)
  ;
```

with:

```ts
  // core voltages (undervolt headroom) and fan speeds (cooling headroom)
  | 'gpu.coreVoltage' | 'cpu.coreVoltage' | 'fan.cpuRpm' | 'fan.gpuRpm'
  // storage — multi-instance columns, merged to the per-row worst drive at normalize time
  | 'drive.tempC' | 'drive.activityPct' | 'drive.readRateMbps' | 'drive.writeRateMbps'
  // CPU voltage-regulator temperature (worst rail; AMD SVI3 telemetry)
  | 'vrm.tempC'
  // fps (filled via FpsData, not a plain series)
  ;
```

In `FlagKey`, replace:

```ts
export type FlagKey =
  | 'flag.cpu.thermalThrottle' | 'flag.cpu.prochot' | 'flag.cpu.ratl' | 'flag.cpu.powerLimit'
  | 'flag.gpu.perfLimitPower' | 'flag.gpu.perfLimitThermal' | 'flag.gpu.perfLimitUtil'
  | 'flag.gpu.perfLimitVRel' | 'flag.gpu.perfLimitVOp' | 'flag.gpu.perfLimitCurrent';
```

with:

```ts
export type FlagKey =
  | 'flag.cpu.thermalThrottle' | 'flag.cpu.prochot' | 'flag.cpu.ratl' | 'flag.cpu.powerLimit'
  | 'flag.cpu.vrThermalAlert'
  | 'flag.gpu.perfLimitPower' | 'flag.gpu.perfLimitThermal' | 'flag.gpu.perfLimitUtil'
  | 'flag.gpu.perfLimitVRel' | 'flag.gpu.perfLimitVOp' | 'flag.gpu.perfLimitCurrent';
```

- [ ] **Step 4: Extend `src/sensors/registry.ts`**

Replace the `SensorDef` interface:

```ts
export interface SensorDef {
  key: CanonicalKey | FlagKey;
  domain: 'cpu' | 'gpu' | 'igpu' | 'ram' | 'drive' | 'flag';
  kind: 'numeric' | 'flag';
  label: string;
  unit: string | null;
  multi?: 'max';                    // merge ALL matching columns into one per-row-max series
  match: (name: string) => boolean; // receives a lower-cased name
}
```

Add a matcher helper directly below the existing `eq` helper:

```ts
// HWiNFO numbers repeated sensor names within a section ('Drive Temperature 2', …3).
const numbered = (base: string) => {
  const b = base.toLowerCase();
  return (name: string) =>
    name === b || (name.startsWith(b + ' ') && /^\d+$/.test(name.slice(b.length + 1)));
};
```

Insert into `DEFS`, after the `pagefile.usagePct` def (end of the memory block) and before the CPU flags:

```ts
  // storage — names repeat once per drive section; multi:'max' folds them to the worst drive
  { key: 'drive.tempC', domain: 'drive', kind: 'numeric', label: 'Drive Temperature (worst)', unit: '°C',
    multi: 'max', match: numbered('Drive Temperature') },
  { key: 'drive.activityPct', domain: 'drive', kind: 'numeric', label: 'Drive Activity (max)', unit: '%',
    multi: 'max', match: eq('Total Activity') },
  { key: 'drive.readRateMbps', domain: 'drive', kind: 'numeric', label: 'Drive Read Rate (max)', unit: 'MB/s',
    multi: 'max', match: eq('Read Rate') },
  { key: 'drive.writeRateMbps', domain: 'drive', kind: 'numeric', label: 'Drive Write Rate (max)', unit: 'MB/s',
    multi: 'max', match: eq('Write Rate') },

  // CPU VRM temperature — AMD SVI3 exposes one sensor per rail; the worst rail wins
  { key: 'vrm.tempC', domain: 'cpu', kind: 'numeric', label: 'CPU VRM (worst rail)', unit: '°C',
    multi: 'max', match: eq('CPU VDDCR_VDD VRM (SVI3 TFN)', 'CPU VDDCR_SOC VRM (SVI3 TFN)', 'CPU VDD_MISC VRM (SVI3 TFN)') },
```

Append to the CPU flags block (after `flag.cpu.powerLimit`):

```ts
  { key: 'flag.cpu.vrThermalAlert', domain: 'flag', kind: 'flag', label: 'CPU VR Thermal Alert', unit: 'Yes/No',
    match: eq('IA: VR Thermal Alert') },
```

- [ ] **Step 5: Run tests**

Run: `npx vitest src/sensors/registry.test.ts src/sensors/normalize.test.ts src/engine` → PASS. Note: until Task 2 lands, only the FIRST matching drive/VRM column per key is claimed (first-claim-wins) — that's correct interim behavior; the columns just leave `unknownColumns`. The digest snapshot is unaffected (drive keys aren't rendered until Task 7).

- [ ] **Step 6: Commit**

```bash
git add src/types.ts src/sensors/registry.ts src/sensors/registry.test.ts
git commit -m "feat(sensors): drive and VRM sensor keys with numbered-instance matching"
```

---

### Task 2: Normalize — `multi: 'max'` merge

**Files:**
- Modify: `src/sensors/normalize.ts`
- Test: `src/sensors/normalize.test.ts`

- [ ] **Step 1: Write failing tests** (append a new describe block; inline-CSV style matches the file's existing tests)

```ts
describe('multi-instance merge', () => {
  it('folds every Drive Temperature column into one per-row-max series', () => {
    // Intel layout: two drive sections, four temp columns, instance numbers 2 and 3.
    const text =
      'Date,Time,"Drive Temperature [°C]","Drive Temperature 2 [°C]","Drive Temperature [°C]","Drive Temperature 3 [°C]"\n' +
      '9.6.2026,12:00:00.000,41,55,38,40\n' +
      '9.6.2026,12:00:02.000,42,,39,60\n';
    const csv = parseCsv(text);
    const log = normalize(buildColumns(csv.headers), csv.rows, csv.decimal);
    expect(log.sensors['drive.tempC']!.values).toEqual([55, 60]);
    expect(log.unknownColumns).toHaveLength(0);
  });

  it('merges null-safely: null only when every instance is null on that row', () => {
    const text =
      'Date,Time,"Total Activity [%]","Total Activity [%]"\n' +
      '9.6.2026,12:00:00.000,,\n' +
      '9.6.2026,12:00:02.000,12,3\n' +
      '9.6.2026,12:00:04.000,,7\n';
    const csv = parseCsv(text);
    const log = normalize(buildColumns(csv.headers), csv.rows, csv.decimal);
    expect(log.sensors['drive.activityPct']!.values).toEqual([null, 12, 7]);
  });

  it('merges the three VRM rails to the worst rail', () => {
    const text =
      'Date,Time,"CPU VDDCR_VDD VRM (SVI3 TFN) [°C]","CPU VDDCR_SOC VRM (SVI3 TFN) [°C]","CPU VDD_MISC VRM (SVI3 TFN) [°C]"\n' +
      '9.6.2026,12:00:00.000,71,65,58\n' +
      '9.6.2026,12:00:02.000,70,74,59\n';
    const csv = parseCsv(text);
    const log = normalize(buildColumns(csv.headers), csv.rows, csv.decimal);
    expect(log.sensors['vrm.tempC']!.values).toEqual([71, 74]);
  });

  it('non-multi keys keep first-claim-wins', () => {
    const text =
      'Date,Time,"Total CPU Usage [%]","Total CPU Usage [%]"\n' +
      '9.6.2026,12:00:00.000,10,99\n';
    const csv = parseCsv(text);
    const log = normalize(buildColumns(csv.headers), csv.rows, csv.decimal);
    expect(log.sensors['cpu.usageTotal']!.values).toEqual([10]);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest src/sensors/normalize.test.ts` → the first three FAIL (first instance wins today: `[41, 42]`, `[null, 12, null]`, `[71, 70]`); the regression test passes.

- [ ] **Step 3: Implement in `src/sensors/normalize.ts`**

In the main column loop, replace:

```ts
    // First column to claim a key wins (e.g. avoid a later duplicate overwriting it).
    if (claimed.has(key)) continue;
    claimed.add(key);
```

with:

```ts
    // First column to claim a key wins (e.g. avoid a later duplicate overwriting it) —
    // except multi:'max' keys, where every matching column folds into a per-row max:
    // a log can carry several drives / VRM rails, and the worst one is the signal.
    if (claimed.has(key)) {
      if (def.kind === 'numeric' && def.multi === 'max') {
        const existing = sensors[key as CanonicalKey]!;
        const incoming = rows.map((r) => parseNumeric(r[col.index] ?? '', decimal));
        existing.values = existing.values.map((a, i) => {
          const b = incoming[i] ?? null;
          if (a === null) return b;
          if (b === null) return a;
          return Math.max(a, b);
        });
      }
      continue;
    }
    claimed.add(key);
```

No other changes — the first matching column still creates the sensor (with the def's label/unit); later instances only fold values in.

- [ ] **Step 4: Run tests**

Run: `npx vitest src/sensors/normalize.test.ts src/engine/analyze.golden.test.ts` → PASS (golden logs still load; the Intel logs' four drive-temp columns now merge into one series).

- [ ] **Step 5: Commit**

```bash
git add src/sensors/normalize.ts src/sensors/normalize.test.ts
git commit -m "feat(sensors): per-row max merge for multi-instance drive/VRM columns"
```

---

### Task 3: `src/causes/pacing.ts` — shared stutter math

**Files:**
- Create: `src/causes/pacing.ts`
- Test: `src/causes/pacing.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
import { describe, it, expect } from 'vitest';
import { gameplayRowSet, stutterIndex, gameplayMedian, spikeRows, spikeClusters, rowsToWindowIndexes } from './pacing';
import { makeWindow, makeWindowAnalysis } from './testkit';

const allRows = (n: number) => new Set(Array.from({ length: n }, (_, i) => i));

describe('gameplayRowSet', () => {
  it('covers gameplay windows only', () => {
    const wa = makeWindowAnalysis([
      makeWindow(0, { activity: 'idle' }),
      makeWindow(1),                          // gameplay, rows 4..7
      makeWindow(2, { activity: 'loading' }),
    ]);
    expect([...gameplayRowSet(wa)].sort((a, b) => a - b)).toEqual([4, 5, 6, 7]);
  });
});

describe('stutterIndex', () => {
  it('reads ~1 for even pacing and rises with a heavy tail', () => {
    const flat = Array.from({ length: 100 }, () => 10);
    expect(stutterIndex(flat, allRows(100))).toBeCloseTo(1, 5);
    const spiky = [...Array.from({ length: 98 }, () => 10), 40, 40];
    expect(stutterIndex(spiky, allRows(100))!).toBeGreaterThan(2);
  });

  it('ignores rows outside gameplay and is null on thin or all-null data', () => {
    const series = [...Array.from({ length: 30 }, () => 10), 80, 80]; // spikes after gameplay ends
    const rows = new Set(Array.from({ length: 30 }, (_, i) => i));
    expect(stutterIndex(series, rows)).toBeCloseTo(1, 5);
    expect(stutterIndex([10, 10, 10], allRows(3))).toBeNull();        // < MIN_SAMPLES
    expect(stutterIndex(Array.from({ length: 50 }, () => null), allRows(50))).toBeNull();
    expect(stutterIndex([], new Set())).toBeNull();
  });
});

describe('spikeRows / spikeClusters', () => {
  it('flags samples above 2× the gameplay median and keeps only runs of ≥2 as clusters', () => {
    const s: (number | null)[] = Array.from({ length: 40 }, () => 8);
    s[10] = 20;                            // lone spike — a row but not a cluster
    s[20] = 25; s[21] = 30; s[22] = 22;    // 3-run cluster
    expect(spikeRows(s, allRows(40))).toEqual([10, 20, 21, 22]);
    expect(spikeClusters(s, allRows(40))).toEqual([{ startRow: 20, endRow: 22, peakMs: 30 }]);
  });

  it('is empty when the gameplay median cannot be established', () => {
    expect(spikeClusters(Array.from({ length: 40 }, () => null), allRows(40))).toEqual([]);
    expect(spikeClusters([], new Set())).toEqual([]);
    expect(gameplayMedian([], new Set())).toBeNull();
  });
});

describe('rowsToWindowIndexes', () => {
  it('maps rows to the windows containing them, deduped and sorted', () => {
    const wa = makeWindowAnalysis([makeWindow(0), makeWindow(1), makeWindow(2)]);
    expect(rowsToWindowIndexes([5, 6, 9], wa.windows)).toEqual([1, 2]);
    expect(rowsToWindowIndexes([], wa.windows)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest src/causes/pacing.test.ts` → FAIL (module not found).

- [ ] **Step 3: Implement `src/causes/pacing.ts`**

```ts
import type { WindowAnalysis, WindowClassification } from '../types';
import { computeStats } from '../stats/percentiles';

export interface SpikeCluster { startRow: number; endRow: number; peakMs: number; }

// Below this many gameplay samples, pacing percentiles are noise — every function
// in this module goes silent rather than guessing.
const MIN_SAMPLES = 20;
const SPIKE_FACTOR = 2;  // a sample 2× the gameplay median counts as a spike
const MIN_RUN = 2;       // ≥2 consecutive spiked polls = a cluster, not a one-poll artefact

// Row indexes covered by gameplay windows — pacing math must ignore menus/loading,
// where frame times legitimately spike.
export function gameplayRowSet(wa: WindowAnalysis): Set<number> {
  const rows = new Set<number>();
  for (const w of wa.windows) {
    if (w.activity !== 'gameplay') continue;
    for (let i = w.window.startRow; i <= w.window.endRow; i++) rows.add(i);
  }
  return rows;
}

function inPlay(series: (number | null)[], rows: Set<number>): number[] {
  const out: number[] = [];
  for (let i = 0; i < series.length; i++) {
    const v = series[i];
    if (rows.has(i) && v !== null && Number.isFinite(v) && v > 0) out.push(v);
  }
  return out;
}

// p99/avg of gameplay frame-time samples. 1.0 = perfectly even pacing; 2.0 means the
// worst 1% of polls averaged twice the typical frame time.
export function stutterIndex(series: (number | null)[], rows: Set<number>): number | null {
  const vals = inPlay(series, rows);
  if (vals.length < MIN_SAMPLES) return null;
  const s = computeStats(vals);
  if (s.avg <= 0) return null;
  return s.p99 / s.avg;
}

export function gameplayMedian(series: (number | null)[], rows: Set<number>): number | null {
  const vals = inPlay(series, rows).sort((a, b) => a - b);
  return vals.length >= MIN_SAMPLES ? vals[Math.floor(vals.length / 2)] : null;
}

export function spikeRows(series: (number | null)[], rows: Set<number>): number[] {
  const median = gameplayMedian(series, rows);
  if (median === null || median <= 0) return [];
  const threshold = SPIKE_FACTOR * median;
  const out: number[] = [];
  for (let i = 0; i < series.length; i++) {
    const v = series[i];
    if (rows.has(i) && v !== null && v > threshold) out.push(i);
  }
  return out;
}

export function spikeClusters(series: (number | null)[], rows: Set<number>): SpikeCluster[] {
  const idx = spikeRows(series, rows);
  const clusters: SpikeCluster[] = [];
  for (let i = 0; i < idx.length; ) {
    let j = i;
    while (j + 1 < idx.length && idx[j + 1] === idx[j] + 1) j++;
    if (idx[j] - idx[i] + 1 >= MIN_RUN) {
      let peak = 0;
      for (let k = idx[i]; k <= idx[j]; k++) peak = Math.max(peak, series[k] ?? 0);
      clusters.push({ startRow: idx[i], endRow: idx[j], peakMs: peak });
    }
    i = j + 1;
  }
  return clusters;
}

export function rowsToWindowIndexes(rowIdx: number[], windows: WindowClassification[]): number[] {
  const out = new Set<number>();
  for (const w of windows) {
    for (const r of rowIdx) {
      if (r >= w.window.startRow && r <= w.window.endRow) { out.add(w.window.index); break; }
    }
  }
  return [...out].sort((a, b) => a - b);
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest src/causes/pacing.test.ts` → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/causes/pacing.ts src/causes/pacing.test.ts
git commit -m "feat(causes): shared frame-pacing math (stutter index, spike clusters)"
```

---

### Task 4: `src/causes/framePacing.ts` — micro-stutter

**Files:**
- Create: `src/causes/framePacing.ts`
- Test: `src/causes/framePacing.test.ts`
- Possibly modify: `src/causes/events.ts`, `src/types.ts` (baseline drift guard, Step 0)

- [ ] **Step 0: Baseline drift guard.** Open `src/types.ts` and `src/causes/events.ts`. Plan #1 should already have added `subtype?: string` to `DiagEvent` and a passthrough in `makeEvent`. If either is missing, add them now (and include the files in this task's commit):

In `DiagEvent` (types.ts), after `type: string;`-bearing line add nothing if present, else extend the interface with:

```ts
  subtype?: string;
```

In `makeEvent` (events.ts): add `subtype?: string;` to the input type and, next to the existing `fix`/`evidence` passthroughs:

```ts
  if (input.subtype !== undefined) event.subtype = input.subtype;
```

- [ ] **Step 1: Write failing tests** — `src/causes/framePacing.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { causeFramePacing } from './framePacing';
import { makeLog, makeWindow, makeWindowAnalysis } from './testkit';

// 6 gameplay windows × 4 rows = rows 0..23 (testkit windows are 4 rows each)
const wa6 = () => makeWindowAnalysis([0, 1, 2, 3, 4, 5].map((i) => makeWindow(i)));
const flat = (n: number, v: number) => Array.from({ length: n }, () => v);

describe('causeFramePacing', () => {
  it('stays silent on evenly paced frame times', () => {
    const log = makeLog({ sensors: { 'pm.frameTimeMs': flat(24, 8.3) } });
    expect(causeFramePacing(log, {}, wa6())).toEqual([]);
  });

  it('warns with "Sampled" wording, the polling caveat, and marks the spiked windows', () => {
    const series = flat(24, 8);
    series[9] = 30; series[10] = 28;    // cluster in window 2 (rows 8..11)
    series[17] = 26; series[18] = 27;   // cluster in window 4
    series[21] = 25; series[22] = 29;   // cluster in window 5
    const log = makeLog({ sensors: { 'pm.frameTimeMs': series } });
    const events = causeFramePacing(log, {}, wa6());
    expect(events).toHaveLength(1);
    const e = events[0];
    expect(e.type).toBe('stutter');
    expect(e.subtype).toBe('presentmon');
    expect(e.severity).toBe('warn');
    expect(e.sentence).toContain('Sampled frame-time variability');
    expect(e.windowIndexes).toEqual([2, 4, 5]);
    expect(e.evidence?.tier).toBe('measured');
    expect(e.evidence?.basis.join(' ')).toMatch(/per-poll averages/);
  });

  it('escalates to bad on extreme variability', () => {
    const series = flat(24, 8);
    series[9] = 100; series[10] = 100; series[17] = 100; series[18] = 100;
    const [e] = causeFramePacing(makeLog({ sensors: { 'pm.frameTimeMs': series } }), {}, wa6());
    expect(e.severity).toBe('bad');
  });

  it('falls back to RTSS frame time when PresentMon is absent', () => {
    const series = flat(24, 8);
    series[9] = 40; series[10] = 40;
    const log = makeLog({ sensors: { 'rtss.frameTimeMs': series } });
    const [e] = causeFramePacing(log, {}, wa6());
    expect(e).toBeDefined();
    expect(e.subtype).toBe('rtss');
  });

  it('does not run on workload (no-FPS) logs or without a frame-time sensor', () => {
    const series = flat(24, 8);
    series[9] = 100; series[10] = 100;
    const wa = makeWindowAnalysis([0, 1, 2, 3, 4, 5].map((i) => makeWindow(i)), { activityKind: 'workload' });
    expect(causeFramePacing(makeLog({ sensors: { 'pm.frameTimeMs': series } }), {}, wa)).toEqual([]);
    expect(causeFramePacing(makeLog({}), {}, wa6())).toEqual([]);
  });
});
```

Fixture math, for the record: the warn case has avg 12.875 ms / p99 ≈ 29.8 ms → index ≈ 2.31 (≥ 1.8, < 2.5) and 3 clusters; the bad case has index ≈ 4.3 (≥ 2.5).

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest src/causes/framePacing.test.ts` → FAIL (module not found).

- [ ] **Step 3: Implement `src/causes/framePacing.ts`**

```ts
import type { CanonicalKey, DiagEvent, NormalizedLog, Severity, Stats, WindowAnalysis } from '../types';
import { makeEvent } from './events';
import { gameplayRowSet, rowsToWindowIndexes, spikeClusters, spikeRows, stutterIndex } from './pacing';

const WARN_INDEX = 1.8;
const BAD_INDEX = 2.5;
const WARN_CLUSTERS = 3;

const FIX = 'Cap FPS slightly below your average, update GPU drivers, and close recording/overlay apps; if it persists in one game, suspect shader-compilation stutter.';

// HWiNFO frame-time columns are per-poll AVERAGES of many frames, not per-frame data.
// Whatever variability survives that averaging is real and understated — say "sampled",
// never claim per-frame measurements.
const POLL_CAVEAT = 'HWiNFO frame times are per-poll averages — true per-frame spikes are larger than sampled';

export function causeFramePacing(
  log: NormalizedLog,
  _stats: Partial<Record<CanonicalKey, Stats>>,
  wa: WindowAnalysis,
): DiagEvent[] {
  const pm = log.sensors['pm.frameTimeMs'];
  const source = pm ?? log.sensors['rtss.frameTimeMs'];
  if (!source || wa.activityKind !== 'gameplay') return [];

  const rows = gameplayRowSet(wa);
  const index = stutterIndex(source.values, rows);
  if (index === null) return [];

  const clusters = spikeClusters(source.values, rows);
  if (index < WARN_INDEX && clusters.length < WARN_CLUSTERS) return [];

  const severity: Severity = index >= BAD_INDEX ? 'bad' : 'warn';
  const spikes = spikeRows(source.values, rows);
  const clusterClause = clusters.length > 0
    ? ` with ${clusters.length} sustained spike ${clusters.length === 1 ? 'cluster' : 'clusters'}`
    : '';

  return [makeEvent({
    type: 'stutter',
    subtype: pm ? 'presentmon' : 'rtss',
    severity,
    sentence: `Sampled frame-time variability was high during gameplay (worst 1% of samples ran ${index.toFixed(1)}× the average)${clusterClause} — felt as micro-stutter.`,
    fix: FIX,
    sampleCount: spikes.length,
    evidence: {
      tier: 'measured',
      basis: [
        `${source.label}: gameplay p99/avg ${index.toFixed(2)}, ${clusters.length} spike cluster(s)`,
        POLL_CAVEAT,
      ],
    },
    windowIndexes: rowsToWindowIndexes(spikes, wa.windows),
  })];
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest src/causes/framePacing.test.ts src/causes/events.test.ts` → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/causes/framePacing.ts src/causes/framePacing.test.ts src/causes/events.ts src/types.ts
git commit -m "feat(causes): frame-pacing micro-stutter analyzer with sampled-data honesty"
```

(Drop `events.ts`/`types.ts` from the add if Step 0 needed no change.)

---

### Task 5: `src/causes/fanCurve.ts` — fans not responding to rising temps

**Files:**
- Create: `src/causes/fanCurve.ts`
- Test: `src/causes/fanCurve.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
import { describe, it, expect } from 'vitest';
import { causeFanCurve } from './fanCurve';
import { makeLog, makeWindow, makeWindowAnalysis } from './testkit';

// 8 gameplay windows of ramping temps, preceded by one idle window (rows 0..3),
// so the fan series has 9 windows × 4 rows = 36 values.
const tempsRamp = [60, 60, 62, 64, 66, 68, 70, 72];
const perWindowRows = (perWindow: number[]) => perWindow.flatMap((v) => [v, v, v, v]);

function gpuFixture(fanPerWindow: number[], temps = tempsRamp) {
  const windows = [
    makeWindow(0, { activity: 'idle' }),
    ...temps.map((t, i) => makeWindow(i + 1, { metrics: { gpuTempC: t } })),
  ];
  const log = makeLog({ sensors: { 'fan.gpuRpm': perWindowRows(fanPerWindow) } });
  return { log, wa: makeWindowAnalysis(windows) };
}

describe('causeFanCurve', () => {
  it('fires when temps climb ≥10°C and the fan stays flat despite proven headroom', () => {
    // idle burst at 3500 RPM proves headroom; gameplay holds a flat 2000 RPM
    const { log, wa } = gpuFixture([3500, 2000, 2000, 2000, 2000, 2000, 2000, 2000, 2000]);
    const events = causeFanCurve(log, {}, wa);
    expect(events).toHaveLength(1);
    const e = events[0];
    expect(e.type).toBe('fan-curve');
    expect(e.severity).toBe('warn');
    expect(e.sentence).toMatch(/didn't respond to rising temps/);
    expect(e.sentence).toMatch(/fan curve/);
    expect(e.windowIndexes).toEqual([7, 8]);          // last quarter of the 8 gameplay windows
    expect(e.evidence?.tier).toBe('measured');
  });

  it('stays silent when the fan ramps with the temps', () => {
    const { log, wa } = gpuFixture([3500, 2000, 2100, 2200, 2400, 2600, 2800, 3000, 3200]);
    expect(causeFanCurve(log, {}, wa)).toEqual([]);
  });

  it('stays silent when the fan is flat at its observed max (cooling maxed ≠ bad curve)', () => {
    const { log, wa } = gpuFixture([3500, 3500, 3500, 3500, 3500, 3500, 3500, 3500, 3500]);
    expect(causeFanCurve(log, {}, wa)).toEqual([]);
  });

  it('stays silent without a temp rise or without the fan sensor', () => {
    const flatTemps = [60, 60, 60, 60, 60, 61, 61, 61];
    const { log, wa } = gpuFixture([3500, 2000, 2000, 2000, 2000, 2000, 2000, 2000, 2000], flatTemps);
    expect(causeFanCurve(log, {}, wa)).toEqual([]);
    const { wa: wa2 } = gpuFixture([3500, 2000, 2000, 2000, 2000, 2000, 2000, 2000, 2000]);
    expect(causeFanCurve(makeLog({}), {}, wa2)).toEqual([]);
  });

  it('checks the CPU pair too', () => {
    const windows = [
      makeWindow(0, { activity: 'idle' }),
      ...tempsRamp.map((t, i) => makeWindow(i + 1, { metrics: { cpuTempC: t } })),
    ];
    const log = makeLog({ sensors: { 'fan.cpuRpm': perWindowRows([4000, 2200, 2200, 2200, 2200, 2200, 2200, 2200, 2200]) } });
    const [e] = causeFanCurve(log, {}, makeWindowAnalysis(windows));
    expect(e.sentence).toContain('CPU');
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest src/causes/fanCurve.test.ts` → FAIL (module not found).

- [ ] **Step 3: Implement `src/causes/fanCurve.ts`**

```ts
import type { CanonicalKey, DiagEvent, NormalizedLog, Stats, WindowAnalysis, WindowClassification } from '../types';
import { makeEvent } from './events';
import { windowMean } from '../windows/slice';

const MIN_WINDOWS = 8;
const TEMP_RISE_C = 10;
const FAN_FLAT_TOLERANCE = 0.05;  // every gameplay window within ±5% of the early-gameplay mean
const FAN_HEADROOM_FRAC = 0.9;    // the flat level must sit below 90% of the fan's own session max

interface Pair {
  side: 'GPU' | 'CPU';
  tempOf: (w: WindowClassification) => number | null;
  fanKey: CanonicalKey;
}
const PAIRS: Pair[] = [
  { side: 'GPU', tempOf: (w) => w.metrics.gpuTempC, fanKey: 'fan.gpuRpm' },
  { side: 'CPU', tempOf: (w) => w.metrics.cpuTempC, fanKey: 'fan.cpuRpm' },
];

const mean = (xs: number[]) => xs.reduce((s, v) => s + v, 0) / xs.length;

export function causeFanCurve(
  log: NormalizedLog,
  _stats: Partial<Record<CanonicalKey, Stats>>,
  wa: WindowAnalysis,
): DiagEvent[] {
  const events: DiagEvent[] = [];

  for (const pair of PAIRS) {
    const fan = log.sensors[pair.fanKey];
    if (!fan) continue;

    const usable = wa.windows
      .filter((w) => w.activity === 'gameplay')
      .map((w) => ({ w, temp: pair.tempOf(w), rpm: windowMean(fan.values, w.window) }))
      .filter((x): x is { w: WindowClassification; temp: number; rpm: number } =>
        x.temp !== null && x.rpm !== null);
    if (usable.length < MIN_WINDOWS) continue;

    const q = Math.max(2, Math.floor(usable.length / 4));
    const tempEarly = mean(usable.slice(0, q).map((x) => x.temp));
    const tempLate = mean(usable.slice(-q).map((x) => x.temp));
    if (tempLate - tempEarly < TEMP_RISE_C) continue;

    const rpmEarly = mean(usable.slice(0, q).map((x) => x.rpm));
    if (rpmEarly <= 0) continue;
    const flat = usable.every((x) => Math.abs(x.rpm - rpmEarly) <= FAN_FLAT_TOLERANCE * rpmEarly);
    if (!flat) continue;

    // A fan that never went faster anywhere in the log might simply be maxed out —
    // only call the curve out when the log itself proves headroom existed.
    let sessionMax = 0;
    for (const v of fan.values) if (v !== null && v > sessionMax) sessionMax = v;
    if (rpmEarly >= FAN_HEADROOM_FRAC * sessionMax) continue;

    const late = usable.slice(-q);
    events.push(makeEvent({
      type: 'fan-curve',
      severity: 'warn',
      sentence: `${pair.side} temp rose ${Math.round(tempLate - tempEarly)}°C during gameplay (${Math.round(tempEarly)}→${Math.round(tempLate)}°C) but the ${pair.side} fan held ~${Math.round(rpmEarly)} RPM — the fans didn't respond to rising temps; check the fan curve and clean out dust.`,
      fix: `Set a steeper ${pair.side} fan curve (or enable the performance fan mode) and clean dust from the intakes and fins.`,
      sampleCount: usable.length,
      evidence: {
        tier: 'measured',
        basis: [
          `${pair.side} temp ${Math.round(tempEarly)}→${Math.round(tempLate)}°C while fan RPM stayed within ±5% of ${Math.round(rpmEarly)} RPM`,
          `the fan reached ${Math.round(sessionMax)} RPM elsewhere in the log, so headroom existed`,
        ],
      },
      windowIndexes: late.map((x) => x.w.window.index),
    }));
  }
  return events;
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest src/causes/fanCurve.test.ts` → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/causes/fanCurve.ts src/causes/fanCurve.test.ts
git commit -m "feat(causes): unresponsive fan-curve analyzer"
```

---

### Task 6: `src/causes/storageStutter.ts` — spikes co-located with drive bursts

**Files:**
- Create: `src/causes/storageStutter.ts`
- Test: `src/causes/storageStutter.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
import { describe, it, expect } from 'vitest';
import { causeStorageStutter } from './storageStutter';
import { makeLog, makeWindow, makeWindowAnalysis } from './testkit';

const wa6 = () => makeWindowAnalysis([0, 1, 2, 3, 4, 5].map((i) => makeWindow(i)));
const flat = (n: number, v: number) => Array.from({ length: n }, () => v);

// frame-time cluster in window 2 (rows 8..11)
function spikyFt(): number[] {
  const s = flat(24, 8);
  s[9] = 30; s[10] = 28;
  return s;
}

describe('causeStorageStutter', () => {
  it('reports a frame-time cluster co-located with a drive-activity burst (info for one cluster)', () => {
    const activity = flat(24, 4);
    activity[8] = 40; activity[9] = 40; activity[10] = 40; activity[11] = 40;
    const log = makeLog({ sensors: { 'pm.frameTimeMs': spikyFt(), 'drive.activityPct': activity } });
    const events = causeStorageStutter(log, {}, wa6());
    expect(events).toHaveLength(1);
    const e = events[0];
    expect(e.type).toBe('storage-stutter');
    expect(e.severity).toBe('info');
    expect(e.windowIndexes).toEqual([2]);
    expect(e.evidence?.tier).toBe('inferred');
  });

  it('escalates to warn when two clusters co-locate with drive bursts', () => {
    const ft = spikyFt();
    ft[17] = 27; ft[18] = 26;                  // second cluster, window 4
    const activity = flat(24, 4);
    for (const i of [8, 9, 10, 11, 16, 17, 18, 19]) activity[i] = 40;
    const log = makeLog({ sensors: { 'pm.frameTimeMs': ft, 'drive.activityPct': activity } });
    const [e] = causeStorageStutter(log, {}, wa6());
    expect(e.severity).toBe('warn');
    expect(e.windowIndexes).toEqual([2, 4]);
  });

  it('also matches via a read-rate burst above the gameplay p95', () => {
    const readRate = flat(24, 2);
    readRate[9] = 600; readRate[10] = 600;
    const log = makeLog({ sensors: { 'pm.frameTimeMs': spikyFt(), 'drive.readRateMbps': readRate } });
    const [e] = causeStorageStutter(log, {}, wa6());
    expect(e).toBeDefined();
    expect(e.windowIndexes).toEqual([2]);
  });

  it('a drive burst without a frame-time cluster is not an event', () => {
    const activity = flat(24, 4);
    activity[9] = 90;
    const log = makeLog({ sensors: { 'pm.frameTimeMs': flat(24, 8), 'drive.activityPct': activity } });
    expect(causeStorageStutter(log, {}, wa6())).toEqual([]);
  });

  it('a frame-time cluster over a calm drive is not a storage event', () => {
    const log = makeLog({ sensors: { 'pm.frameTimeMs': spikyFt(), 'drive.activityPct': flat(24, 4) } });
    expect(causeStorageStutter(log, {}, wa6())).toEqual([]);
  });

  it('requires both sensor families', () => {
    expect(causeStorageStutter(makeLog({ sensors: { 'pm.frameTimeMs': spikyFt() } }), {}, wa6())).toEqual([]);
    expect(causeStorageStutter(makeLog({ sensors: { 'drive.activityPct': flat(24, 90) } }), {}, wa6())).toEqual([]);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest src/causes/storageStutter.test.ts` → FAIL (module not found).

- [ ] **Step 3: Implement `src/causes/storageStutter.ts`**

```ts
import type { CanonicalKey, DiagEvent, NormalizedLog, Severity, Stats, WindowAnalysis } from '../types';
import { makeEvent } from './events';
import { gameplayMedian, gameplayRowSet, rowsToWindowIndexes, spikeClusters } from './pacing';
import { computeStats } from '../stats/percentiles';
import { windowMax, windowMean } from '../windows/slice';

const ACTIVITY_BURST_FACTOR = 3;
// Relative gates need absolute floors: a near-idle drive's median/p95 is ~0,
// and 3× ~0 would match any blip.
const MIN_ACTIVITY_PCT = 10;
const MIN_READ_RATE_MBPS = 50;

const span = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => a + i);

export function causeStorageStutter(
  log: NormalizedLog,
  _stats: Partial<Record<CanonicalKey, Stats>>,
  wa: WindowAnalysis,
): DiagEvent[] {
  const ft = log.sensors['pm.frameTimeMs'] ?? log.sensors['rtss.frameTimeMs'];
  const activity = log.sensors['drive.activityPct'];
  const readRate = log.sensors['drive.readRateMbps'];
  if (!ft || (!activity && !readRate) || wa.activityKind !== 'gameplay') return [];

  const rows = gameplayRowSet(wa);
  const clusters = spikeClusters(ft.values, rows);
  if (clusters.length === 0) return [];

  const activityMedian = activity ? gameplayMedian(activity.values, rows) : null;
  const readP95 = readRate
    ? computeStats(readRate.values.map((v, i) => (rows.has(i) ? v : null))).p95
    : null;

  const matched = new Set<number>();
  let matchedClusters = 0;
  for (const c of clusters) {
    let hit = false;
    for (const wi of rowsToWindowIndexes(span(c.startRow, c.endRow), wa.windows)) {
      const w = wa.windows.find((x) => x.window.index === wi);
      if (!w) continue;
      const burst = activity && activityMedian !== null
        && (windowMean(activity.values, w.window) ?? 0)
          > Math.max(ACTIVITY_BURST_FACTOR * activityMedian, MIN_ACTIVITY_PCT);
      const readSpike = readRate && readP95 !== null
        && (windowMax(readRate.values, w.window) ?? 0) > Math.max(readP95, MIN_READ_RATE_MBPS);
      if (burst || readSpike) { matched.add(wi); hit = true; }
    }
    if (hit) matchedClusters++;
  }
  if (matched.size === 0) return [];

  const severity: Severity = matchedClusters >= 2 ? 'warn' : 'info';
  return [makeEvent({
    type: 'storage-stutter',
    severity,
    sentence: `${matchedClusters} of ${clusters.length} frame-time spike ${clusters.length === 1 ? 'cluster' : 'clusters'} lined up with a burst of drive activity — likely asset/shader streaming hitting the drive.`,
    fix: 'Move the game to a faster drive (NVMe SSD) and pause downloads/indexing while playing.',
    sampleCount: matched.size,
    evidence: {
      tier: 'inferred',
      basis: [
        `frame-time spike clusters co-locate with ${activity ? 'drive activity ≥3× its gameplay median' : 'read-rate bursts above the gameplay p95'}`,
        'co-location, not causation — per-frame data would be needed to prove the stall',
      ],
    },
    windowIndexes: [...matched].sort((a, b) => a - b),
  })];
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest src/causes/storageStutter.test.ts` → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/causes/storageStutter.ts src/causes/storageStutter.test.ts
git commit -m "feat(causes): storage-stutter co-location analyzer"
```

---

### Task 7: Register in `analyze.ts`, surface drive/VRM, golden guardrails

**Files:**
- Modify: `src/engine/analyze.ts`
- Modify: `src/digest/digest.ts` + `src/digest/digest.test.ts`
- Modify: `src/ui/NerdView.tsx`
- Modify: `src/verdict/guidance.ts` + `src/verdict/guidance.test.ts`
- Modify: `src/engine/analyze.golden.test.ts` (+ regenerate the digest snapshot)

- [ ] **Step 1: Write failing tests first**

(a) Append to `src/digest/digest.test.ts`:

```ts
  it('full digest includes worst-drive and VRM temp rows when present, compact does not', () => {
    const base = sampleResult();
    const extra = { 'drive.tempC': [45, 52, 70, 68, 66], 'vrm.tempC': [60, 64, 70, 72, 71] };
    const d = buildDigest({ ...base, stats: { ...base.stats, ...statsFor(extra) } });
    expect(d.full).toMatch(/Drive temp \(worst\): avg .*max 70/);
    expect(d.full).toMatch(/CPU VRM temp \(worst rail\)/);
    expect(d.compact).not.toMatch(/Drive temp/);
  });
```

(b) Append to `src/verdict/guidance.test.ts`:

```ts
  it('asks for drive activity sensors when absent, satisfied by either drive family', () => {
    expect(buildGuidance(makeLog({})).map((x) => x.what).join(' ')).toMatch(/drive activity/i);
    const log = makeLog({ sensors: { 'drive.activityPct': [5] } });
    expect(buildGuidance(log).map((x) => x.what).join(' ')).not.toMatch(/drive activity/i);
  });
```

(c) Append to `src/engine/analyze.golden.test.ts` (inside the top-level describe):

```ts
  it('v2: drive/VRM columns are claimed and merged on real logs', () => {
    const amd = analyze(sample('AMD + Nvidia/A16_superposition_1080extreme_2460MHz.CSV'));
    expect(amd.stats['drive.tempC']?.count).toBeGreaterThan(0);
    expect(amd.stats['drive.activityPct']?.count).toBeGreaterThan(0);
    expect(amd.stats['vrm.tempC']?.count).toBeGreaterThan(0);
    expect(amd.log.unknownColumns.filter((c) => c.startsWith('Drive Temperature'))).toEqual([]);

    const intel = analyze(sample('Intel + Nvidia/KaiC_ItTakesTwo.CSV'));
    // four drive-temp columns across two drives merged into one worst-drive series
    expect(intel.log.sensors['drive.tempC']!.values.length).toBe(intel.log.rowCount);
    expect(intel.stats['drive.tempC']?.count).toBeGreaterThan(0);
    expect(intel.log.flags['flag.cpu.vrThermalAlert']).toBeDefined();
  });

  // THRESHOLD GUARDRAIL — a stutter / fan-curve / storage-stutter call on a clean
  // fixed-scene benchmark is a false positive by definition. If this fails, TUNE the
  // analyzer gates (SPIKE_FACTOR / WARN_INDEX / WARN_CLUSTERS / ACTIVITY_BURST_FACTOR /
  // TEMP_RISE_C) and document the change in the commit message. Do NOT delete this test.
  it('v2: no new detector fires on the benchmark samples', () => {
    const NEW_TYPES = ['stutter', 'fan-curve', 'storage-stutter'];
    const BENCHMARKS = [
      'AMD + Nvidia/A16_cinebench_MultiCore_-20UVz_1669pts.CSV',
      'AMD + Nvidia/A16_cinebench_MultiCore_-25UV_1695pts.CSV',
      'AMD + Nvidia/A16_cinebench_SingleCore_-20UV_114pts.CSV',
      'AMD + Nvidia/A16_superposition_1080extreme_0.9_2520MHz.CSV',
      'AMD + Nvidia/A16_superposition_1080extreme_2460MHz.CSV',
      'Intel + Nvidia/StrixG16_cinebench_CPU_MultiThreads_3524pts.CSV',
      'Intel + Nvidia/StrixG16_cinebench_CPU_SingleCore_577pts.CSV',
      'Intel + Nvidia/StrixG16_cinebench_CPU_SingleThread_445pts_MP7.92x.CSV',
      'Intel + Nvidia/StrixG16_cinebench_GPU_46643pts.CSV',
      'Intel + Nvidia/StrixG16_superposition_GPU_1080extreme_5633score.CSV',
      'Intel + Nvidia/StrixG16_superposition_GPU_1080extreme_800mem_5693score.CSV',
    ];
    for (const rel of BENCHMARKS) {
      const r = analyze(sample(rel));
      const fired = r.events.filter((e) => NEW_TYPES.includes(e.type));
      expect(fired.map((e) => `${rel}: ${e.type} — ${e.sentence}`)).toEqual([]);
    }
  });

  it('v2: gameplay logs keep the honesty invariants on any new-detector event', () => {
    const NEW_TYPES = ['stutter', 'fan-curve', 'storage-stutter'];
    for (const rel of ['Intel + Nvidia/KaiC_ItTakesTwo.CSV', 'Intel + Nvidia/KaiC_NTE_undervolt-65_.CSV']) {
      const r = analyze(sample(rel));
      for (const e of r.events.filter((x) => NEW_TYPES.includes(x.type))) {
        // plan #2 timeline contract: non-info events must carry their windows
        if (e.severity !== 'info') expect(e.windowIndexes?.length, `${rel}: ${e.type}`).toBeGreaterThan(0);
        if (e.type === 'stutter') expect(e.sentence, rel).toContain('Sampled');
        expect(e.evidence, `${rel}: ${e.type}`).toBeDefined();
      }
    }
  });
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest src/digest/digest.test.ts src/verdict/guidance.test.ts src/engine/analyze.golden.test.ts` → the digest-row, guidance and drive/VRM-claim tests FAIL (the guardrail tests pass trivially until the causes are registered — that's expected).

- [ ] **Step 3: Register the causes in `src/engine/analyze.ts`**

Replace:

```ts
import { causeRamPressure } from '../causes/ramPressure';
import { causeHotspotDelta } from '../causes/hotspotDelta';
```

with:

```ts
import { causeRamPressure } from '../causes/ramPressure';
import { causeHotspotDelta } from '../causes/hotspotDelta';
import { causeFramePacing } from '../causes/framePacing';
import { causeFanCurve } from '../causes/fanCurve';
import { causeStorageStutter } from '../causes/storageStutter';
```

and replace:

```ts
    ...causeRamPressure(log, stats, windows),
    ...causeHotspotDelta(log, stats, windows),
  ];
```

with:

```ts
    ...causeRamPressure(log, stats, windows),
    ...causeHotspotDelta(log, stats, windows),
    ...causeFramePacing(log, stats, windows),
    ...causeFanCurve(log, stats, windows),
    ...causeStorageStutter(log, stats, windows),
  ];
```

- [ ] **Step 4: Surface the new sensors**

(a) `src/digest/digest.ts` — replace the last two entries of `FULL_EXTRA_SENSORS`:

```ts
  { key: 'ram.loadPct', label: 'RAM load', unit: '%', kind: 'usage' },
  { key: 'cpu.usageCoreMax', label: 'CPU core usage (max)', unit: '%', kind: 'usage' },
];
```

with:

```ts
  { key: 'ram.loadPct', label: 'RAM load', unit: '%', kind: 'usage' },
  { key: 'cpu.usageCoreMax', label: 'CPU core usage (max)', unit: '%', kind: 'usage' },
  { key: 'drive.tempC', label: 'Drive temp (worst)', unit: '°C', kind: 'level' },
  { key: 'vrm.tempC', label: 'CPU VRM temp (worst rail)', unit: '°C', kind: 'level' },
];
```

(b) `src/ui/NerdView.tsx` — replace `SENSOR_ORDER`:

```ts
const SENSOR_ORDER: CanonicalKey[] = [
  'cpu.tempPackage', 'cpu.tempCoreMax', 'cpu.usageTotal', 'cpu.usageCoreMax',
  'cpu.clock', 'cpu.clockEff', 'cpu.power',
  'gpu.temp', 'gpu.hotspot', 'gpu.memJunction', 'gpu.usage', 'gpu.memUsagePct',
  'gpu.memControllerLoad', 'gpu.clock', 'gpu.clockEff', 'gpu.power', 'gpu.powerLimit',
  'vram.allocatedMb', 'vram.availableMb', 'vram.d3dDedicatedMb', 'vram.d3dDynamicMb',
  'pm.frameTimeMs', 'pm.gpuBusyMs', 'pm.gpuWaitMs', 'pm.cpuBusyMs', 'pm.cpuWaitMs',
  'rtss.frameTimeMs',
  'igpu.temp', 'igpu.usage',
  'ram.loadPct', 'ram.usedMb', 'pagefile.usagePct',
];
```

with:

```ts
const SENSOR_ORDER: CanonicalKey[] = [
  'cpu.tempPackage', 'cpu.tempCoreMax', 'cpu.usageTotal', 'cpu.usageCoreMax',
  'cpu.clock', 'cpu.clockEff', 'cpu.power', 'vrm.tempC',
  'gpu.temp', 'gpu.hotspot', 'gpu.memJunction', 'gpu.usage', 'gpu.memUsagePct',
  'gpu.memControllerLoad', 'gpu.clock', 'gpu.clockEff', 'gpu.power', 'gpu.powerLimit',
  'vram.allocatedMb', 'vram.availableMb', 'vram.d3dDedicatedMb', 'vram.d3dDynamicMb',
  'pm.frameTimeMs', 'pm.gpuBusyMs', 'pm.gpuWaitMs', 'pm.cpuBusyMs', 'pm.cpuWaitMs',
  'rtss.frameTimeMs',
  'igpu.temp', 'igpu.usage',
  'ram.loadPct', 'ram.usedMb', 'pagefile.usagePct',
  'drive.tempC',
];
```

(Data-only change; no styling touched, consistent with `src/ui/DESIGN.md`.)

(c) `src/verdict/guidance.ts` — insert after the fan-speeds block, before the GPU-core-voltage block:

```ts
  if (!log.sensors['drive.activityPct'] && !log.sensors['drive.readRateMbps']) {
    out.push({
      what: 'drive activity (storage-stutter check)',
      how: 'Include the per-drive "Total Activity" and "Read Rate" sensors in the log — they reveal asset-streaming stutter.',
    });
  }
```

Then fix the now-failing `'a fully-instrumented fast log gets no guidance'` test in `src/verdict/guidance.test.ts` by adding the drive sensor to its `makeLog` sensors:

```ts
        'pm.gpuBusyMs': [1], 'pm.frameTimeMs': [1],
        'fan.cpuRpm': [3000], 'gpu.coreVoltage': [0.9], 'drive.activityPct': [2],
```

- [ ] **Step 5: Run the goldens and tune if the guardrail trips**

Run: `npx vitest src/engine/analyze.golden.test.ts`.

- The digest format-lock snapshot WILL fail: the full digest for the Superposition log now includes the `Drive temp (worst)` row (no VRM row — that log is Intel, which has no VRM temp column). Inspect the diff; when it shows only the expected new sensor row(s) (and, only if a new event legitimately fired, an events-block line), regenerate with `npx vitest run src/engine/analyze.golden.test.ts -u` and review `src/engine/__snapshots__/analyze.golden.test.ts.snap`.
- If `v2: no new detector fires on the benchmark samples` fails: tune, don't delete. Likely culprits in order: Superposition scene cuts producing 2-sample frame-time spikes → raise `SPIKE_FACTOR` (2 → 2.5) and/or `MIN_RUN` (2 → 3) in `pacing.ts`, or raise `WARN_INDEX`; benchmark warm-up temp climb tripping fan-curve → raise `TEMP_RISE_C` or `MIN_WINDOWS` in `fanCurve.ts`; logging-tool disk writes tripping storage-stutter → raise `ACTIVITY_BURST_FACTOR` or `MIN_ACTIVITY_PCT`. Re-run the unit tests for the analyzer you touched (adjust their fixture magnitudes to stay above the new gate) and state the tuned value + reason in the commit message.

- [ ] **Step 6: Full suite + build**

Run: `npm run test` → all green.
Run: `npm run build` → exits 0 (strict typecheck across all tsconfig projects).

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(engine): register deeper diagnostics and surface drive/VRM sensors"
```

---

## Verification (end of plan)

1. `npm run build` — strict typecheck green.
2. `npm run test` — full suite green, including:
   - registry/normalize: numbered drive instances + per-row-max merge,
   - the three analyzer unit suites,
   - golden guardrail: zero stutter/fan-curve/storage-stutter events on the 11 benchmark samples,
   - golden claims: `drive.tempC` / `drive.activityPct` / `vrm.tempC` stats present, `flag.cpu.vrThermalAlert` parsed, drive columns gone from `unknownColumns`.
3. Manual: `npm run dev`, drop `Intel + Nvidia/KaiC_ItTakesTwo.CSV` (a real gameplay log):
   - Nerd mode sensor table shows a `Drive Temperature (worst)` row;
   - the full digest shows the `Drive temp (worst)` line;
   - if a stutter finding fired, it reads "Sampled frame-time variability…" and the Nerd timeline shows markers on the affected windows (plan #2 contract — markers come from `windowIndexes`, no UI change in this plan);
   - drop an AMD sample and confirm the `CPU VRM temp (worst rail)` digest row appears.

## Future / stretch (v2.1+)

- **Per-core stutter attribution:** correlate spike clusters with `cores.usage` saturation on a single thread (shader-comp / asset-decompress stalls are usually one pinned thread).
- **Drive wear & health:** map `Drive Remaining Life`, `Drive Available Spare`, `Drive Failure`, `Drive Warning` and surface a one-line health check (the columns are already in every sample).
- **Chipset / SSD-controller temps:** `PCH Temperature` exists in the Intel samples; add when a detector can actually use it.
- **Animation-error metric:** a true frame-pacing score (displayed-time vs simulated-time) if per-frame data (FrameView/PresentMon CSV import) ever lands — would retire the per-poll-average caveat.
- **`GT:`/`RING:` VR thermal alerts and write-rate stutter:** map if a real log ever shows them firing meaningfully.
- **Vendor aliases (plan #4):** more spellings of the drive/VRM columns from other HWiNFO versions/hardware.

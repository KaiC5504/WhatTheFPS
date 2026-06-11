# WTFPS v2 #4 — Specs & Normalization Breadth Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Widen what WTFPS recognizes beyond the Intel/NVIDIA-laptop logs it grew up on: desktop Ryzen and Intel CPU labels, Radeon dGPU and Arc labels resolve to canonical keys; HWiNFO "Save Report" files (TXT/HTM) supply exact hardware names through the specs card; and a class-level reference DB of expected temperature ranges replaces the two hardcoded temp-tile thresholds and adds one calibration line to the digest.

**Architecture:** Three additions, none of which change the pipeline shape. (1) `src/sensors/registry.ts` gains aliases plus one new canonical key (`gpu.socTempC`), and `GPU Utilization`/`GPU Total Usage` move from a direct iGPU mapping to section-aware dGPU/iGPU assignment in `normalize`. (2) A new `src/report/` module (`parseReport` + `mergeSpecs`) parses HWiNFO Save Reports into a `Partial<InferredSpecs>` that the SpecsCard merges and persists through its existing `onChange`/`specsStore` flow. (3) A new `src/reference/tempRanges.ts` (`lookupTempRange`) is consumed by `buildVerdict`'s hero temp tiles and by one new full-digest context line.

**Tech Stack:** TypeScript 5 strict, Vitest (node env for `src/report/` and `src/reference/`; jsdom for `src/ui/` per `vitest.config.ts`). No new dependencies.

**Baseline:** This plan assumes WTFPS v2 plans #1–#3 are merged. Specifically from #3: `CanonicalKey` includes `drive.tempC` and `vrm.tempC`, and `SensorDef` carries an optional `multi?: 'max'` property (all columns matching such a def aggregate elementwise by max in `normalize` instead of first-claim-wins). **Before starting Task 1, read the merged `src/sensors/registry.ts` and `src/sensors/normalize.ts`** — if #3 shipped the multi machinery under a different name or semantics, adapt the `CPU CCD2 (Tdie)` aggregation in Task 1 to whatever actually merged and note the deviation in the commit message.

**No spec document exists for this item.** The Design decisions section below is the spec.

**Out of scope:** per-SKU hardware databases (Tjmax per model number); any change to detectors/causes or window classification; changes to `fingerprint.ts` vendor inference; a second top-level DropZone; re-running `analyze()` when specs are edited (the existing App flow re-renders the digest specs block from edited specs — that is enough); the App's exact-string same-machine guard (see Future / stretch).

---

## Design decisions

1. **Alias-first registry breadth.** New hardware support is overwhelmingly a *naming* problem, not a semantics problem: a Radeon hotspot is the same measurement as an NVIDIA hotspot. So almost every new label maps onto an existing `CanonicalKey`, and downstream (windows, causes, verdict, digest) gets the new hardware for free. Exactly **one** new key is added: `gpu.socTempC` (Radeon's SoC die temperature has no existing semantic match). Task 1 starts with a research step the implementer executes — compile the exact HWiNFO header strings from the HWiNFO docs/forums and the repo's sample logs. Every alias added carries a provenance comment; aliases not verified against a real log are explicitly marked `provisional`. Research already done while writing this plan (verify, don't redo): `CPU (Tctl/Tdie)`, `CPU CCD1 (Tdie)`, `Thermal Throttling (HTC)`, the Radeon `Throttle Reason - *` flags, `Vcore`/SVI2/SVI3 voltages, `GPU Hot Spot Temperature`, `GPU Memory Junction Temperature`, and the whole Intel desktop DTS set (`CPU Package`, `Core Max`, `IA: PROCHOT`, …) are **already covered** by the current registry — the plan only adds the real gaps listed in Task 1.

2. **One report parser, no DOM.** `src/report/parseReport.ts` handles both HWiNFO "Save Report" formats (TXT and HTM): bytes → `decodeBytes` (HWiNFO writes locale code pages, same as the CSVs — never read reports as UTF-8 strings) → if HTM, strip tags to text with regexes (no `DOMParser`, so the module stays node-testable and worker-safe) → line-anchored field regexes extract a `Partial<InferredSpecs>` containing **only fields the report states outright**: `cpuModelGuess`, `gpuModelGuess`, `ramMb`, `ramModelGuess`, `systemModel`. Vendor flags, laptop detection, and module counts stay with the CSV fingerprint — the report must never *remove* knowledge. Returns `null` on anything unrecognizable (garbage, empty file, a CSV log); never throws. **Fixture blocker:** the repo has no HWiNFO report file. Task 5 begins with obtaining real TXT + HTM reports from the user and committing trimmed fixtures; if none can be produced, the implementer STOPS and asks rather than inventing a format.

3. **`mergeSpecs(current, fromReport)`: report wins where non-null.** A tiny, total function in `src/report/mergeSpecs.ts`: every non-null/non-undefined report field overwrites; everything else is preserved byte-for-byte. Keeping it separate from `parseReport` makes the merge rule independently testable and reusable (a future "paste your specs" feature would merge the same way).

4. **SpecsCard integration, no second top-level DropZone.** The app's identity is "drop one CSV"; a second full-size dropzone would compete with it. Instead the SpecsCard gains a small drop/browse target ("Have a HWiNFO report? Drop it here for exact names") → `parseReport` → `mergeSpecs` → the card's existing `update()` (which calls `onChange` and `saveSpecs`, so persistence and the digest specs block come along automatically). Parse failure shows an inline note and changes nothing — importing a report can never block or clear the card. CSS is tokens-only per `src/ui/DESIGN.md`.

5. **Reference DB is class-level, not per-SKU.** `src/reference/tempRanges.ts` exports `interface TempRange { warnAt: number; badAt: number; note: string }` and `lookupTempRange(component, specs)` for `'cpu' | 'gpu' | 'gpu.hotspot' | 'gpu.memJunction' | 'vrm' | 'drive'`. Granularity is vendor × laptop/desktop where it matters (Ryzen Tctl 95 desktop / 89 X3D-class / 100 mobile; Intel TjMax 100; laptop GeForce throttle target 87 vs desktop 90; Radeon edge-vs-hotspot split; NVMe ~70/80) — a per-SKU table would rot instantly and add nothing the class doesn't already say. Every entry's `note` cites its basis. Unknown vendors fall back to the *current hardcoded values* (CPU 90/100, GPU 85/90) so behavior only changes where we actually know more. Consumers: (a) `buildVerdict`'s two temp tiles replace their hardcoded thresholds with lookups; (b) the full digest gains one context line ("Typical for this class of hardware: …"). `vrm`/`drive` entries exist for the #3 sensors' future consumers and are covered by the table invariant test now. **Golden severity shifts are review checkpoints:** after Tasks 3–4 the implementer diffs golden/snapshot changes by hand and justifies each in the commit message — never a blanket `vitest -u` without reading the diff.

---

## File map

| File | Action | Responsibility |
|---|---|---|
| `src/types.ts` | modify | add `gpu.socTempC` to `CanonicalKey` |
| `src/sensors/registry.ts` | modify | desktop Ryzen / Radeon / Arc aliases; `GPU Utilization`/`GPU Total Usage` move to `gpu.usage` |
| `src/sensors/registry.test.ts` | modify | alias tests (double as provenance documentation) |
| `src/sensors/normalize.ts` | modify | Radeon dGPU anchor variants; `gpu.socTempC` ambiguity |
| `src/sensors/normalize.test.ts` | modify | section-assignment tests; swap the fixture that used `GPU Utilization` as its iGPU anchor |
| `src/reference/tempRanges.ts` | create | class-level expected temp ranges + `lookupTempRange` |
| `src/reference/tempRanges.test.ts` | create | per-class lookups, generic fallback, whole-table `warnAt < badAt` invariant |
| `src/verdict/buildVerdict.ts` | modify | temp tiles read `lookupTempRange` instead of hardcoded `90, 100` / `85, 90` |
| `src/verdict/buildVerdict.test.ts` | modify | class-aware tile severities |
| `src/digest/digest.ts` | modify | full-digest typical-range context line |
| `src/digest/digest.test.ts` | modify | line present in full / absent in compact / absent without temp sensors |
| `src/engine/__snapshots__/analyze.golden.test.ts.snap` | modify | hand-reviewed update (exactly one added line) |
| `src/report/parseReport.ts` | create | HWiNFO Save Report (TXT/HTM) → `Partial<InferredSpecs>` \| null |
| `src/report/parseReport.test.ts` | create | synthetic-format + real-fixture + rejection tests (node) |
| `src/report/mergeSpecs.ts` | create | report-wins merge into `InferredSpecs` |
| `src/report/mergeSpecs.test.ts` | create | merge-rule tests (node) |
| `src/report/__fixtures__/` | create | trimmed real report fixtures (TXT + HTM, original bytes) |
| `src/ui/SpecsCard.tsx` | modify | report drop/browse target + merge + inline error |
| `src/ui/SpecsCard.css` | modify | tokens-only styles for the report target |
| `src/ui/SpecsCard.test.tsx` | modify | RTL drop/merge/error/persistence tests (jsdom) |

Run all tests with `npm run test`; single file with `npx vitest src/reference/tempRanges.test.ts`. Typecheck via `npm run build`.

Task dependencies: Task 2 must precede Tasks 3–4; Task 5 must precede Task 6; Task 1 is independent of the rest.

---

### Task 1: Label research, registry aliases, `gpu.socTempC`

**Files:**
- Modify: `src/types.ts`, `src/sensors/registry.ts`, `src/sensors/normalize.ts`
- Test: `src/sensors/registry.test.ts`, `src/sensors/normalize.test.ts`

- [ ] **Step 1: Execute the label research and finalize the alias table**

Dump the headers of every in-repo sample so verified labels can be told apart from provisional ones:

```powershell
Get-ChildItem 'HWINFO samples' -Recurse -Filter *.CSV |
  ForEach-Object { "== $($_.Name)"; Get-Content $_.FullName -TotalCount 1 } > sample-headers.txt
```

All 13 samples are Intel/AMD *laptop* CPUs with NVIDIA dGPUs — expect zero in-repo verification for Radeon dGPU, Arc, and desktop-only labels. For those, confirm exact strings against the HWiNFO sensor documentation/forums (search for the literal label, e.g. `"GPU SoC Temperature" hwinfo`); anything you cannot confirm from a real log stays marked `provisional` in its comment. Do not delete `sample-headers.txt` checks into git — it is scratch.

Starting table (gaps only — the already-covered list in Design decision 1 is not re-added):

| New alias | Maps to | Why / provenance |
|---|---|---|
| `CPU CCD2 (Tdie)` | `cpu.tempCoreMax` (with `multi: 'max'`) | dual-CCD desktop Ryzen (5900X/7950X class); HWiNFO forum sensor list — provisional |
| `CPU Die (average)` | `cpu.tempCoreAvg` | desktop Ryzen wording — provisional |
| `GPU Temperature (Hot Spot)` | `gpu.hotspot` | Radeon wording variant — provisional |
| `GPU Hotspot Temperature` | `gpu.hotspot` | Radeon wording variant (older builds) — provisional |
| `GPU Memory Temperature` | `gpu.memJunction` | Radeon GDDR junction wording — provisional |
| `GPU SoC Temperature` | `gpu.socTempC` (NEW) | Radeon SoC die; no NVIDIA equivalent — provisional |
| `GPU ASIC Power` | `gpu.power` | Radeon total-chip power wording — provisional |
| `GPU Utilization`, `GPU Total Usage` | `gpu.usage` (moved from `igpu.usage`) | AMD wording used by BOTH Radeon dGPUs and APU iGPUs; the current direct-to-iGPU mapping misfiles every all-AMD desktop |

Considered and deferred (record in the commit message if you confirm and add any): `GPU D3D Usage` (appears on NVIDIA logs too; column-order claiming could shadow `GPU Core Load`), `GPU VR Temperature` (card VR vs motherboard `vrm.tempC` class mismatch), Arc-specific labels beyond the generic set — Arc logs largely reuse labels the registry already maps (`GPU Temperature`, `GPU Power`, `GPU Clock`, `GPU Memory Allocated`); add Arc aliases only if the research turns up a confirmed Arc-only string.

- [ ] **Step 2: Write failing registry tests** (append to the existing `describe('findSensor')` block in `src/sensors/registry.test.ts`; these tests are the provenance record — keep one `it` per hardware family)

```ts
  it('maps desktop Ryzen CPU temperature variants', () => {
    expect(key('CPU CCD2 (Tdie)')).toBe('cpu.tempCoreMax');
    expect(key('CPU Die (average)')).toBe('cpu.tempCoreAvg');
    // dual-CCD parts log both CCDs; the def aggregates elementwise max (plan #3 machinery)
    expect(findSensor('CPU CCD2 (Tdie)')?.multi).toBe('max');
  });
  it('maps Radeon discrete-GPU wording onto the NVIDIA-equivalent keys', () => {
    expect(key('GPU Temperature (Hot Spot)')).toBe('gpu.hotspot');
    expect(key('GPU Hotspot Temperature')).toBe('gpu.hotspot');
    expect(key('GPU Memory Temperature')).toBe('gpu.memJunction');
    expect(key('GPU ASIC Power')).toBe('gpu.power');
  });
  it('gives the Radeon SoC die its own key', () => {
    const def = findSensor('GPU SoC Temperature');
    expect(def?.key).toBe('gpu.socTempC');
    expect(def?.unit).toBe('°C');
  });
  it('routes AMD GPU usage through the ambiguous discrete key, not straight to the iGPU', () => {
    expect(key('GPU Utilization')).toBe('gpu.usage');
    expect(key('GPU Total Usage')).toBe('gpu.usage');
  });
```

- [ ] **Step 3: Run to verify failure**

Run: `npx vitest src/sensors/registry.test.ts` → the four new tests FAIL.

- [ ] **Step 4: Add the key and the defs**

`src/types.ts` — extend the discrete-GPU group of `CanonicalKey` (keep all existing members):

```ts
  // discrete (gaming) GPU
  | 'gpu.temp' | 'gpu.hotspot' | 'gpu.memJunction' | 'gpu.socTempC' | 'gpu.usage'
  | 'gpu.clock' | 'gpu.clockEff' | 'gpu.power' | 'gpu.powerLimit' | 'gpu.memUsagePct'
  | 'gpu.memControllerLoad'
```

`src/sensors/registry.ts` — change the existing defs in place (provenance comments are part of the deliverable; `// provisional:` means not yet seen in a real log):

```ts
  { key: 'cpu.tempCoreMax', domain: 'cpu', kind: 'numeric', label: 'CPU Core Max', unit: '°C',
    // CCD2: dual-CCD desktop Ryzen; provisional: HWiNFO forum sensor list, no dual-CCD log in repo.
    // multi: dual-CCD logs carry both CCDs — the hotter one is the core max.
    multi: 'max',
    match: eq('Core Max', 'CPU CCD1 (Tdie)', 'CPU CCD2 (Tdie)') },
  { key: 'cpu.tempCoreAvg', domain: 'cpu', kind: 'numeric', label: 'CPU Core Avg', unit: '°C',
    // CPU Die (average): desktop Ryzen wording; provisional.
    match: eq('Core Temperatures (avg)', 'CPU Core Temperatures (avg)', 'CPU Die (average)') },
```

```ts
  // discrete GPU temps — specific first
  { key: 'gpu.hotspot', domain: 'gpu', kind: 'numeric', label: 'GPU Hot Spot', unit: '°C',
    // Radeon wording variants; provisional: HWiNFO forum, no Radeon dGPU log in repo.
    match: eq('GPU Hot Spot Temperature', 'GPU Temperature (Hot Spot)', 'GPU Hotspot Temperature') },
  { key: 'gpu.memJunction', domain: 'gpu', kind: 'numeric', label: 'GPU Memory Junction', unit: '°C',
    // GPU Memory Temperature: Radeon GDDR junction wording; provisional.
    match: eq('GPU Memory Junction Temperature', 'GPU Memory Temperature') },
  // Radeon SoC die — no NVIDIA equivalent, so its own key; provisional.
  { key: 'gpu.socTempC', domain: 'gpu', kind: 'numeric', label: 'GPU SoC', unit: '°C',
    match: eq('GPU SoC Temperature') },
```

Replace the `gpu.usage` def and **delete** the `igpu.usage` def (the key stays in `CanonicalKey`; it is now populated only via normalize's `IGPU_FORM` reassignment):

```ts
  // discrete GPU usage. 'GPU Utilization'/'GPU Total Usage' are AMD wording used by BOTH
  // Radeon dGPUs and APU iGPUs — normalize assigns by section. (They used to resolve
  // straight to igpu.usage, which misfiled all-AMD desktops.)
  { key: 'gpu.usage', domain: 'gpu', kind: 'numeric', label: 'GPU Usage', unit: '%',
    match: eq('GPU Core Load', 'GPU Utilization', 'GPU Total Usage') },
```

And extend the power def:

```ts
  { key: 'gpu.power', domain: 'gpu', kind: 'numeric', label: 'GPU Power', unit: 'W',
    // GPU ASIC Power: Radeon total-chip power; provisional.
    match: eq('GPU Power', 'GPU ASIC Power') },
```

- [ ] **Step 5: Write failing normalize tests** (the registry move only works if normalize section-assigns the moved labels)

In `src/sensors/normalize.test.ts`, first fix the existing fixture in `describe('ambiguity for new keys')` — it used `GPU Utilization` as its iGPU anchor, which stops being an anchor in Step 6. Swap in the VDDCR_GFX rail as the anchor (everything else unchanged):

```ts
    const text =
      'Date,Time,"GPU Memory Allocated [MB]","Throttle Reason - Power [Yes/No]",' +
      '"GPU Hot Spot Temperature [°C]","GPU Core Voltage (VDDCR_GFX) [V]",' +
      '"GPU Memory Allocated [MB]","Throttle Reason - Power [Yes/No]"\n' +
      '9.6.2026,12:00:00.000,4000,No,80,0.7,2000,Yes\n';
```

(Mind the column order: the dGPU copies must stay nearer the Hot Spot anchor than the VDDCR_GFX anchor — put the anchor columns between the two copies as above, and update the row to match. Re-run this one test to confirm it still passes before moving on.)

Then append:

```ts
describe('AMD GPU usage section assignment', () => {
  it('claims gpu.usage for a Radeon dGPU block and igpu.usage for an APU block', () => {
    const text =
      'Date,Time,"GPU Temperature (Hot Spot) [°C]","GPU Utilization [%]",' +
      '"GPU Core Voltage (VDDCR_GFX) [V]","GPU Utilization [%]"\n' +
      '9.6.2026,12:00:00.000,85,97,0.7,3\n';
    const csv = parseCsv(text);
    const log = normalize(buildColumns(csv.headers), csv.rows, csv.decimal);
    expect(log.sensors['gpu.usage']!.values).toEqual([97]);
    expect(log.sensors['igpu.usage']!.values).toEqual([3]);
  });

  it('an iGPU-only log (no dGPU anchors) still lands on igpu.usage', () => {
    const text =
      'Date,Time,"GPU Core Voltage (VDDCR_GFX) [V]","GPU Total Usage [%]"\n' +
      '9.6.2026,12:00:00.000,0.7,12\n';
    const csv = parseCsv(text);
    const log = normalize(buildColumns(csv.headers), csv.rows, csv.decimal);
    expect(log.sensors['igpu.usage']!.values).toEqual([12]);
    expect(log.sensors['gpu.usage']).toBeUndefined();
  });

  it('drops an iGPU-section SoC temperature rather than letting it claim the dGPU key', () => {
    const text =
      'Date,Time,"GPU Temperature (Hot Spot) [°C]","GPU SoC Temperature [°C]",' +
      '"GPU Core Voltage (VDDCR_GFX) [V]","GPU SoC Temperature [°C]"\n' +
      '9.6.2026,12:00:00.000,85,70,0.7,55\n';
    const csv = parseCsv(text);
    const log = normalize(buildColumns(csv.headers), csv.rows, csv.decimal);
    expect(log.sensors['gpu.socTempC']!.values).toEqual([70]);
    expect(log.unknownColumns.filter((c) => c.includes('GPU SoC Temperature'))).toHaveLength(1);
  });
});
```

Run: `npx vitest src/sensors/normalize.test.ts` → new tests FAIL.

- [ ] **Step 6: Implement in `src/sensors/normalize.ts`**

Three edits at the top of the file; the main loop's ambiguity machinery already does the rest (`gpu.usage` is already in `AMBIGUOUS` with `IGPU_FORM['gpu.usage'] = 'igpu.usage'`).

(a) `GPU Utilization`/`GPU Total Usage` must stop being iGPU *anchors* (a Radeon dGPU's own usage column would otherwise anchor its whole section as iGPU), and the dGPU anchor set gains the Radeon hotspot variants:

```ts
// dGPU section markers (discrete Nvidia/Radeon) vs iGPU section markers (Intel/AMD APU).
// 'GPU Utilization'/'GPU Total Usage' are NOT iGPU anchors: Radeon dGPUs use the same
// labels, so they are section-assigned instead (see AMBIGUOUS).
const DGPU_ANCHOR = /(12VHPWR|Memory Junction Temperature|Hot Spot Temperature|Temperature \(Hot Spot\)|Hotspot Temperature|GPU Memory Temperature)/i;
const IGPU_ANCHOR = /(VDDCR_GFX|iGPU VID|STAPM|GPU Core Temperature)/i;
```

(b) `gpu.socTempC` joins the ambiguous set (Ryzen APUs also expose a SoC temperature; with no `IGPU_FORM` slot the iGPU-section copy is dropped, which is the existing dropped-not-shadowed behavior):

```ts
const AMBIGUOUS = new Set<CanonicalKey>([
  'gpu.temp', 'gpu.clock', 'gpu.clockEff', 'gpu.usage', 'gpu.memUsagePct', 'gpu.socTempC',
  'vram.allocatedMb', 'vram.availableMb', 'vram.d3dDedicatedMb', 'vram.d3dDynamicMb',
]);
```

(c) No change to `IGPU_FORM` — it already maps `gpu.usage → igpu.usage`.

- [ ] **Step 7: Run the full sensors + golden suites**

Run: `npx vitest src/sensors src/engine` → all PASS. The golden logs are the gate for the anchor change: every laptop sample's iGPU block must still resolve via the remaining anchors (`VDDCR_GFX`/`STAPM` for AMD APUs, `iGPU VID`/`GPU Core Temperature` for Intel). If a sample regresses, open `sample-headers.txt`, find a stable iGPU-only label in that sample's iGPU block, and add it to `IGPU_ANCHOR` with a provenance comment — do not re-add the usage labels.

- [ ] **Step 8: Commit**

```bash
git add src/types.ts src/sensors/registry.ts src/sensors/registry.test.ts src/sensors/normalize.ts src/sensors/normalize.test.ts
git commit -m "feat(sensors): desktop Ryzen, Radeon and Arc label aliases with section-aware AMD GPU usage"
```

---

### Task 2: `src/reference/tempRanges.ts` — class-level expected temp ranges

**Files:**
- Create: `src/reference/tempRanges.ts`
- Test: `src/reference/tempRanges.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
import { describe, it, expect } from 'vitest';
import { lookupTempRange } from './tempRanges';
import type { TempComponent } from './tempRanges';
import type { InferredSpecs } from '../types';

function specs(over: Partial<InferredSpecs> = {}): InferredSpecs {
  return {
    systemModel: null, cpuVendor: 'unknown', cpuModelGuess: null,
    gpuVendor: 'unknown', gpuModelGuess: null, igpuModelGuess: null,
    igpuPresent: false, isLaptop: false, ramMb: null, ramModelGuess: null, ramModules: null,
    ...over,
  };
}

describe('lookupTempRange — CPU classes', () => {
  it('desktop Ryzen X3D class has the lowered 89 °C limit', () => {
    const r = lookupTempRange('cpu', specs({ cpuVendor: 'amd', cpuModelGuess: 'AMD Ryzen 7 7800X3D' }));
    expect(r.badAt).toBe(89);
    expect(r.warnAt).toBe(80);
  });
  it('desktop Ryzen non-X3D class limits at 95 °C', () => {
    const r = lookupTempRange('cpu', specs({ cpuVendor: 'amd', cpuModelGuess: 'AMD Ryzen 9 5900X' }));
    expect(r.badAt).toBe(95);
  });
  it('mobile Ryzen class limits at 100 °C', () => {
    const r = lookupTempRange('cpu', specs({ cpuVendor: 'amd', cpuModelGuess: 'AMD Ryzen 9 8940HX', isLaptop: true }));
    expect(r.badAt).toBe(100);
  });
  it('Intel class limits at 100 °C and unknown vendor falls back to the generic 90/100', () => {
    expect(lookupTempRange('cpu', specs({ cpuVendor: 'intel' }))).toMatchObject({ warnAt: 90, badAt: 100 });
    expect(lookupTempRange('cpu', specs())).toMatchObject({ warnAt: 90, badAt: 100 });
  });
});

describe('lookupTempRange — GPU classes', () => {
  it('laptop GeForce throttle target is 87 °C; desktop keeps 90 °C', () => {
    expect(lookupTempRange('gpu', specs({ gpuVendor: 'nvidia', isLaptop: true }))).toMatchObject({ warnAt: 80, badAt: 87 });
    expect(lookupTempRange('gpu', specs({ gpuVendor: 'nvidia' }))).toMatchObject({ warnAt: 85, badAt: 90 });
  });
  it('Radeon edge runs hotter by design; the hotspot is the limiter at 110 °C', () => {
    expect(lookupTempRange('gpu', specs({ gpuVendor: 'amd' })).badAt).toBe(100);
    expect(lookupTempRange('gpu.hotspot', specs({ gpuVendor: 'amd' })).badAt).toBe(110);
  });
  it('unknown GPU vendor falls back to the previous hardcoded 85/90', () => {
    expect(lookupTempRange('gpu', specs())).toMatchObject({ warnAt: 85, badAt: 90 });
  });
});

describe('lookupTempRange — other components', () => {
  it('NVMe drives throttle around 70 °C and are at component limits by 80 °C', () => {
    expect(lookupTempRange('drive', specs())).toMatchObject({ warnAt: 70, badAt: 80 });
  });
  it('VRM and memory-junction entries exist for any vendor', () => {
    expect(lookupTempRange('vrm', specs()).badAt).toBeGreaterThan(lookupTempRange('vrm', specs()).warnAt);
    expect(lookupTempRange('gpu.memJunction', specs()).badAt).toBeGreaterThan(90);
  });
});

describe('lookupTempRange — table invariants', () => {
  const COMPONENTS: TempComponent[] = ['cpu', 'gpu', 'gpu.hotspot', 'gpu.memJunction', 'vrm', 'drive'];
  it('every reachable entry keeps warnAt < badAt and carries a sourced note', () => {
    for (const component of COMPONENTS)
      for (const cpuVendor of ['intel', 'amd', 'unknown'] as const)
        for (const gpuVendor of ['nvidia', 'amd', 'intel', 'unknown'] as const)
          for (const isLaptop of [false, true])
            for (const cpuModelGuess of [null, 'AMD Ryzen 7 7800X3D']) {
              const r = lookupTempRange(component, specs({ cpuVendor, gpuVendor, isLaptop, cpuModelGuess }));
              expect(r.warnAt, `${component}/${cpuVendor}/${gpuVendor}/${isLaptop}`).toBeLessThan(r.badAt);
              expect(r.note.length).toBeGreaterThan(0);
            }
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest src/reference/tempRanges.test.ts` → FAIL (module not found).

- [ ] **Step 3: Implement `src/reference/tempRanges.ts`**

```ts
import type { InferredSpecs } from '../types';

export interface TempRange { warnAt: number; badAt: number; note: string }
export type TempComponent = 'cpu' | 'gpu' | 'gpu.hotspot' | 'gpu.memJunction' | 'vrm' | 'drive';

// Class-level (vendor × form factor), never per-SKU. warnAt = "running close",
// badAt = the class's throttle/limit point. Unknown vendors fall back to the values
// the verdict hardcoded before this table existed, so behavior only changes where
// we actually know more about the hardware class.
export function lookupTempRange(component: TempComponent, specs: InferredSpecs): TempRange {
  switch (component) {
    case 'cpu': return cpuRange(specs);
    case 'gpu': return gpuEdgeRange(specs);
    case 'gpu.hotspot': return hotspotRange(specs);
    case 'gpu.memJunction':
      return { warnAt: 94, badAt: 104, note: 'GDDR6/6X junction TjMax is 105–110 °C; GDDR6X starts thermal management around 104 °C.' };
    case 'vrm':
      return { warnAt: 90, badAt: 105, note: 'Power-stage MOSFETs are rated 125 °C+, but sustained 90+ °C means weak airflow; 105+ °C risks protection throttling.' };
    case 'drive':
      return { warnAt: 70, badAt: 80, note: 'NVMe controllers begin thermal throttling around 70–75 °C; 80 °C is at component limits.' };
  }
}

function cpuRange(specs: InferredSpecs): TempRange {
  if (specs.cpuVendor === 'amd') {
    // X3D is a class test (the stacked-cache parts share the lowered limit), not a SKU lookup.
    if (!specs.isLaptop && /x3d/i.test(specs.cpuModelGuess ?? '')) {
      return { warnAt: 80, badAt: 89, note: 'Desktop Ryzen X3D class: TjMax lowered to 89 °C for the stacked cache.' };
    }
    if (specs.isLaptop) {
      return { warnAt: 90, badAt: 100, note: 'Mobile Ryzen class: Tctl limit 100 °C; sustained 90s are normal under load but near the limit.' };
    }
    return { warnAt: 85, badAt: 95, note: 'Desktop Ryzen class: Tctl limit 95 °C on Zen 3–5 non-X3D parts.' };
  }
  if (specs.cpuVendor === 'intel') {
    return { warnAt: 90, badAt: 100, note: 'Intel class: TjMax 100 °C across recent desktop and mobile parts.' };
  }
  return { warnAt: 90, badAt: 100, note: 'Generic CPU fallback: most consumer parts throttle at 95–100 °C.' };
}

function gpuEdgeRange(specs: InferredSpecs): TempRange {
  switch (specs.gpuVendor) {
    case 'nvidia':
      return specs.isLaptop
        ? { warnAt: 80, badAt: 87, note: 'Laptop GeForce class: the thermal throttle target is 87 °C.' }
        : { warnAt: 85, badAt: 90, note: 'Desktop GeForce class: slowdown begins in the low 90s °C edge.' };
    case 'amd':
      return { warnAt: 90, badAt: 100, note: 'Radeon class: edge runs hot by design; the 110 °C hotspot is the real limiter.' };
    case 'intel':
      return { warnAt: 90, badAt: 100, note: 'Arc class: 100 °C throttle point.' };
    default:
      return { warnAt: 85, badAt: 90, note: 'Generic GPU fallback (matches the previous hardcoded thresholds).' };
  }
}

function hotspotRange(specs: InferredSpecs): TempRange {
  if (specs.gpuVendor === 'amd') {
    return { warnAt: 100, badAt: 110, note: 'AMD specifies hotspot up to 110 °C as in-spec; throttle at 110 °C.' };
  }
  return { warnAt: 95, badAt: 105, note: 'GeForce hotspot throttles ~105 °C; sustained 95+ °C usually means core-contact or pad wear.' };
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest src/reference/tempRanges.test.ts` → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/reference/tempRanges.ts src/reference/tempRanges.test.ts
git commit -m "feat(reference): class-level expected temperature ranges with sourced notes"
```

---

### Task 3: `buildVerdict` — temp tiles use the reference DB

**Files:**
- Modify: `src/verdict/buildVerdict.ts`
- Test: `src/verdict/buildVerdict.test.ts`

- [ ] **Step 1: Write failing tests** (append a new describe block; `log_with` and `statsFor` already exist in the file)

```ts
describe('class-aware temp tiles', () => {
  it('a desktop Ryzen X3D at a 92 °C peak is over its 89 °C class limit', () => {
    const sensors = { 'cpu.tempPackage': [88, 92] };
    const log = log_with(sensors);
    log.specs = { ...log.specs, cpuVendor: 'amd', cpuModelGuess: 'AMD Ryzen 7 7800X3D', isLaptop: false };
    const v = buildVerdict(log, statsFor(sensors), [], makeWindowAnalysis([]));
    expect(v.hero.find((h) => h.key === 'cpu.temp')!.severity).toBe('bad');
  });

  it('the same 92 °C peak on a mobile Ryzen (100 °C class) is only warn', () => {
    const sensors = { 'cpu.tempPackage': [88, 92] };
    const log = log_with(sensors);
    log.specs = { ...log.specs, cpuVendor: 'amd', cpuModelGuess: 'AMD Ryzen 9 8940HX', isLaptop: true };
    const v = buildVerdict(log, statsFor(sensors), [], makeWindowAnalysis([]));
    expect(v.hero.find((h) => h.key === 'cpu.temp')!.severity).toBe('warn');
  });

  it('a laptop GeForce at an 88 °C peak crosses the 87 °C laptop class limit', () => {
    const sensors = { 'gpu.temp': [84, 88] };
    const log = log_with(sensors);
    log.specs = { ...log.specs, gpuVendor: 'nvidia', isLaptop: true };
    const v = buildVerdict(log, statsFor(sensors), [], makeWindowAnalysis([]));
    expect(v.hero.find((h) => h.key === 'gpu.temp')!.severity).toBe('bad');
  });

  it('unknown vendors keep the previous generic thresholds', () => {
    const sensors = { 'cpu.tempPackage': [88, 92], 'gpu.temp': [85, 86] };
    const v = buildVerdict(log_with(sensors), statsFor(sensors), [], makeWindowAnalysis([]));
    expect(v.hero.find((h) => h.key === 'cpu.temp')!.severity).toBe('warn'); // 90 ≤ 92 < 100
    expect(v.hero.find((h) => h.key === 'gpu.temp')!.severity).toBe('warn'); // 85 ≤ 86 < 90
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest src/verdict/buildVerdict.test.ts` → the X3D and laptop-GeForce tests FAIL (everything still uses 90/100 and 85/90).

- [ ] **Step 3: Implement in `src/verdict/buildVerdict.ts`**

Add the import:

```ts
import { lookupTempRange } from '../reference/tempRanges';
```

In `buildHero`, replace the return block. Old (the two hardcoded threshold pairs are the whole point of this task):

```ts
  return [
    fpsTile,
    usageTile('cpu.usageTotal', 'CPU usage', avgOf(stats, 'cpu.usageTotal')),
    tempTile('cpu.temp', 'CPU temp', cpuMain, maxOf(stats, ['cpu.tempPackage', 'cpu.tempCoreMax']), cpuSub, 90, 100),
    usageTile('gpu.usage', 'GPU usage', avgOf(stats, 'gpu.usage')),
    tempTile('gpu.temp', 'GPU temp', avgOf(stats, 'gpu.temp'), maxOf(stats, ['gpu.temp']), gpuSub, 85, 90),
  ];
```

New:

```ts
  const cpuRange = lookupTempRange('cpu', log.specs);
  const gpuRange = lookupTempRange('gpu', log.specs);
  return [
    fpsTile,
    usageTile('cpu.usageTotal', 'CPU usage', avgOf(stats, 'cpu.usageTotal')),
    tempTile('cpu.temp', 'CPU temp', cpuMain, maxOf(stats, ['cpu.tempPackage', 'cpu.tempCoreMax']), cpuSub,
      cpuRange.warnAt, cpuRange.badAt),
    usageTile('gpu.usage', 'GPU usage', avgOf(stats, 'gpu.usage')),
    tempTile('gpu.temp', 'GPU temp', avgOf(stats, 'gpu.temp'), maxOf(stats, ['gpu.temp']), gpuSub,
      gpuRange.warnAt, gpuRange.badAt),
  ];
```

Nothing else in the file changes (`tempTile`/`tempSeverity` keep their signatures).

- [ ] **Step 4: Run tests + golden severity review checkpoint**

Run: `npx vitest src/verdict src/engine` → PASS expected. The digest snapshot must NOT change in this task (tile severities are not in the digest). Then review — by hand, not by assertion — which hero severities shift on the real samples and confirm each is justified:

- Intel laptop CPUs: unchanged (Intel class == old 90/100).
- AMD laptop CPUs (A16 samples): unchanged (mobile Ryzen class == old 90/100).
- All NVIDIA laptop GPUs: thresholds tighten from 85/90 to 80/87 — a sample peaking 80–86 °C moves info→warn; ≥87 °C moves warn→bad. This is correct for the class (87 °C is the laptop GeForce throttle target), but eyeball at least the ItTakesTwo log (`GPU edge max ~86 °C` → stays warn) by temporarily logging `r.verdict.hero` from a scratch test or `npm run dev`.

Record the observed shifts and their justification in the commit body. If a shift looks wrong (e.g. a healthy 81 °C benchmark turning amber feels alarmist), the fix is to adjust the *class entry* in `tempRanges.ts` with an updated note — never to special-case `buildVerdict`.

- [ ] **Step 5: Commit**

```bash
git add src/verdict/buildVerdict.ts src/verdict/buildVerdict.test.ts
git commit -m "feat(verdict): temp tiles use class-level reference thresholds"
```

---

### Task 4: Digest — typical-range context line

**Files:**
- Modify: `src/digest/digest.ts`
- Test: `src/digest/digest.test.ts`
- Modify: `src/engine/__snapshots__/analyze.golden.test.ts.snap` (hand-reviewed)

- [ ] **Step 1: Write failing tests** (append to `src/digest/digest.test.ts`; `sampleResult` already builds an intel/nvidia log with `cpu.tempPackage` + `gpu.temp` stats)

```ts
  it('full digest carries one class-level typical-range line; compact stays lean', () => {
    const d = buildDigest(sampleResult());
    expect(d.full).toContain('Typical for this class of hardware:');
    expect(d.full).toMatch(/CPU load temps under \d+ °C are typical/);
    expect(d.full).toMatch(/GPU edge under \d+ °C is typical/);
    expect(d.compact).not.toContain('Typical for this class of hardware:');
  });

  it('omits the typical-range line when no temperature was logged', () => {
    const base = sampleResult();
    const stats = { ...base.stats };
    delete stats['cpu.tempPackage'];
    delete stats['gpu.temp'];
    const d = buildDigest({ ...base, stats });
    expect(d.full).not.toContain('Typical for this class of hardware:');
  });
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest src/digest/digest.test.ts` → both FAIL.

- [ ] **Step 3: Implement in `src/digest/digest.ts`**

Add the import:

```ts
import { lookupTempRange } from '../reference/tempRanges';
```

Add next to `frameTimesLine`:

```ts
// One class-level calibration line so the receiving LLM doesn't judge a laptop log
// against desktop expectations (or vice versa). Full mode only — compact stays lean.
function typicalRangeLine(log: NormalizedLog, stats: Partial<Record<CanonicalKey, Stats>>): string | null {
  const has = (k: CanonicalKey) => { const s = stats[k]; return !!s && s.count > 0; };
  const hasCpu = has('cpu.tempPackage') || has('cpu.tempCoreMax') || has('cpu.tempCoreAvg');
  const hasGpu = has('gpu.temp') || has('gpu.hotspot');
  if (!hasCpu && !hasGpu) return null;
  const parts: string[] = [];
  if (hasCpu) {
    const r = lookupTempRange('cpu', log.specs);
    parts.push(`CPU load temps under ${r.warnAt} °C are typical, throttling starts near ${r.badAt} °C`);
  }
  if (hasGpu) {
    const r = lookupTempRange('gpu', log.specs);
    parts.push(`GPU edge under ${r.warnAt} °C is typical, throttling near ${r.badAt} °C`);
  }
  return `Typical for this class of hardware: ${parts.join('; ')}.`;
}
```

Wire it into `render`'s full-only evidence list. Old:

```ts
  const evidence = [
    coverageLine(windows),
    timeSplitLine(windows),
    ...(mode === 'full' ? [frameTimesLine(log, stats), vramLine(log, stats)] : []),
  ].filter((l): l is string => l !== null);
```

New:

```ts
  const evidence = [
    coverageLine(windows),
    timeSplitLine(windows),
    ...(mode === 'full' ? [typicalRangeLine(log, stats), frameTimesLine(log, stats), vramLine(log, stats)] : []),
  ].filter((l): l is string => l !== null);
```

- [ ] **Step 4: Run tests, hand-review the snapshot diff, then update it**

Run: `npx vitest src/digest src/engine` → the digest tests PASS; the golden "digest format lock" snapshot FAILS. Read the reported diff: it must show **exactly one added line** (the `Typical for this class of hardware: …` line in the full digest) and nothing else. Confirm the numbers in that line match the Superposition log's class (Intel laptop CPU → 90/100; NVIDIA laptop GPU → 80/87). Only then:

Run: `npx vitest -u src/engine/analyze.golden.test.ts` → re-run `npx vitest src/engine` → PASS. If the diff showed anything beyond the one line, stop and fix the code instead of updating.

- [ ] **Step 5: Commit** (state the reviewed diff in the body)

```bash
git add src/digest/digest.ts src/digest/digest.test.ts src/engine/__snapshots__/analyze.golden.test.ts.snap
git commit -m "feat(digest): class-level typical-temperature context line in the full digest"
```

---

### Task 5: `src/report/` — parseReport + mergeSpecs

**Files:**
- Create: `src/report/parseReport.ts`, `src/report/mergeSpecs.ts`
- Create: `src/report/__fixtures__/report.txt`, `src/report/__fixtures__/report.htm`
- Test: `src/report/parseReport.test.ts`, `src/report/mergeSpecs.test.ts`

- [ ] **Step 1: FIXTURE BLOCKER — obtain real HWiNFO reports before writing any parser code**

The repo has **no** HWiNFO report file; the parser must not be finalized against an imagined format. Ask the user to produce both flavors from their machine: HWiNFO → Save Report → save once as TXT and once as HTML. Then:

1. Trim each file: keep the summary/Computer, Central Processor(s), Video Adapter, and Memory Modules sections; delete serial numbers, network adapters, and drive volume sections.
2. Preserve the original bytes — copy the files as-is; do **not** open-and-resave them as UTF-8 (the encoding path through `decodeBytes` is part of what the fixtures test).
3. Commit them:

```bash
git add "src/report/__fixtures__/report.txt" "src/report/__fixtures__/report.htm"
git commit -m "test(report): trimmed real HWiNFO save-report fixtures (TXT + HTM)"
```

**If the user cannot produce a report, STOP and ask how to proceed. Do not synthesize a fixture and pass it off as real.**

While trimming, note the exact field labels the real files use (e.g. whether the CPU line says `CPU Brand Name:` or something else). The synthetic strings and regexes in Steps 2–4 encode the documented format; **where the real fixture disagrees, the real fixture wins** — update both the regexes and the synthetic test strings to match it.

- [ ] **Step 2: Write failing tests — `src/report/parseReport.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseReport } from './parseReport';

const fixture = (name: string) => new Uint8Array(readFileSync(new URL(`./__fixtures__/${name}`, import.meta.url)));
const toBytes = (s: string) => new TextEncoder().encode(s);

// Synthetic report in the documented Save Report shape. Keeps the format tests
// deterministic; the fixture tests below prove the labels match what HWiNFO writes.
const TXT_REPORT = [
  '<<< HWiNFO v8.04 Report >>>',
  '',
  'Computer:',
  '  Computer Brand Name: ASUS ROG Strix G614JI',
  '',
  'Central Processor(s):',
  '  CPU Brand Name: 13th Gen Intel(R) Core(TM) i7-13650HX',
  '',
  'Video Adapter:',
  '  Video Chipset: NVIDIA GeForce RTX 4070 Laptop GPU',
  '  Video Card: ASUS GeForce RTX 4070 Laptop GPU',
  '',
  'Memory Modules:',
  '  Module Part Number: KF556S40-16',
  '',
  'Total Memory Size: 32 GBytes',
].join('\r\n');

describe('parseReport (TXT format)', () => {
  it('extracts exactly the authoritative spec fields', () => {
    const specs = parseReport(toBytes(TXT_REPORT));
    expect(specs).not.toBeNull();
    expect(specs!.cpuModelGuess).toBe('13th Gen Intel(R) Core(TM) i7-13650HX');
    expect(specs!.gpuModelGuess).toBe('NVIDIA GeForce RTX 4070 Laptop GPU'); // Video Chipset preferred over Video Card
    expect(specs!.systemModel).toBe('ASUS ROG Strix G614JI');
    expect(specs!.ramModelGuess).toBe('KF556S40-16');
    expect(specs!.ramMb).toBe(32 * 1024);
  });

  it('never emits fields the report does not state (vendor/topology stay with the CSV)', () => {
    const allowed = new Set(['cpuModelGuess', 'gpuModelGuess', 'ramMb', 'ramModelGuess', 'systemModel']);
    const specs = parseReport(toBytes(TXT_REPORT))!;
    expect(Object.keys(specs).every((k) => allowed.has(k))).toBe(true);
  });

  it('a CPU-only report still parses (partial is fine)', () => {
    const specs = parseReport(toBytes('CPU Brand Name: AMD Ryzen 7 7800X3D 8-Core Processor\n'));
    expect(specs).toEqual({ cpuModelGuess: 'AMD Ryzen 7 7800X3D 8-Core Processor' });
  });
});

describe('parseReport (HTM format)', () => {
  it('parses table-form HTML without a DOM', () => {
    const htm =
      '<html><head><style>td{color:red}</style></head><body><table>' +
      '<tr><td>Computer Brand Name</td><td>ASUS ROG Strix G614JI</td></tr>' +
      '<tr><td>CPU Brand Name</td><td>13th Gen Intel(R) Core(TM) i7-13650HX</td></tr>' +
      '<tr><td>Video Chipset</td><td>NVIDIA GeForce RTX 4070 Laptop GPU</td></tr>' +
      '<tr><td>Total Memory Size</td><td>32 GBytes</td></tr>' +
      '</table></body></html>';
    const specs = parseReport(toBytes(htm));
    expect(specs).not.toBeNull();
    expect(specs!.cpuModelGuess).toBe('13th Gen Intel(R) Core(TM) i7-13650HX');
    expect(specs!.gpuModelGuess).toBe('NVIDIA GeForce RTX 4070 Laptop GPU');
    expect(specs!.ramMb).toBe(32 * 1024);
  });
});

describe('parseReport (real fixtures)', () => {
  // After Step 1 commits the fixtures, tighten the truthy checks below to
  // toBe('<the exact strings the fixture contains>') — the exact-string form is the
  // provenance record proving the regexes match real HWiNFO output.
  it('TXT fixture yields the machine\'s exact hardware names', () => {
    const specs = parseReport(fixture('report.txt'));
    expect(specs).not.toBeNull();
    expect(specs!.cpuModelGuess).toBeTruthy();
    expect(specs!.gpuModelGuess).toBeTruthy();
  });
  it('HTM fixture parses to the same names as the TXT fixture', () => {
    const txt = parseReport(fixture('report.txt'))!;
    const htm = parseReport(fixture('report.htm'))!;
    expect(htm.cpuModelGuess).toBe(txt.cpuModelGuess);
    expect(htm.gpuModelGuess).toBe(txt.gpuModelGuess);
  });
});

describe('parseReport (rejection)', () => {
  it('returns null for garbage, an empty file, and an HWiNFO CSV log', () => {
    expect(parseReport(toBytes('not a report at all'))).toBeNull();
    expect(parseReport(new Uint8Array(0))).toBeNull();
    const csv = 'Date,Time,"GPU Temperature [°C]","Total CPU Usage [%]"\n9.6.2026,12:00:00.000,74.1,42\n';
    expect(parseReport(toBytes(csv))).toBeNull();
  });
});
```

And `src/report/mergeSpecs.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { mergeSpecs } from './mergeSpecs';
import type { InferredSpecs } from '../types';

const current: InferredSpecs = {
  systemModel: 'ASUS ROG Strix G614JI',
  cpuVendor: 'intel',
  cpuModelGuess: 'Intel hybrid (6P+8E)',
  gpuVendor: 'nvidia',
  gpuModelGuess: 'NVIDIA dGPU',
  igpuModelGuess: 'Intel UHD Graphics',
  igpuPresent: true,
  isLaptop: true,
  ramMb: 32768,
  ramModelGuess: null,
  ramModules: 2,
};

describe('mergeSpecs', () => {
  it('report fields win where present', () => {
    const merged = mergeSpecs(current, {
      cpuModelGuess: '13th Gen Intel(R) Core(TM) i7-13650HX',
      ramModelGuess: 'KF556S40-16',
    });
    expect(merged.cpuModelGuess).toBe('13th Gen Intel(R) Core(TM) i7-13650HX');
    expect(merged.ramModelGuess).toBe('KF556S40-16');
  });

  it('absent and null report fields preserve the current values', () => {
    const merged = mergeSpecs(current, { gpuModelGuess: 'NVIDIA GeForce RTX 4070 Laptop GPU', systemModel: null });
    expect(merged.systemModel).toBe('ASUS ROG Strix G614JI');
    expect(merged.cpuModelGuess).toBe('Intel hybrid (6P+8E)');
  });

  it('never touches fields the report cannot state (vendor, laptop, module count)', () => {
    const merged = mergeSpecs(current, { cpuModelGuess: 'AMD Ryzen 7 7800X3D' });
    expect(merged.cpuVendor).toBe('intel'); // vendor stays with the CSV fingerprint by design
    expect(merged.isLaptop).toBe(true);
    expect(merged.ramModules).toBe(2);
  });
});
```

- [ ] **Step 3: Run to verify failure**

Run: `npx vitest src/report` → FAIL (modules not found).

- [ ] **Step 4: Implement `src/report/parseReport.ts`**

```ts
import { decodeBytes } from '../parsing/decode';
import type { InferredSpecs } from '../types';

// Only fields the report states outright. Vendor flags, laptop detection and module
// counts stay with the CSV fingerprint — a report merge must never remove knowledge.
type ReportField = 'cpuModelGuess' | 'gpuModelGuess' | 'systemModel' | 'ramModelGuess';

// Labels per the HWiNFO Save Report format, confirmed against the committed fixtures.
// The separator alternation [:\t] covers both the TXT form ('Label: value') and the
// HTM form after tag-stripping ('Label\tvalue').
const FIELD_RES: Record<ReportField, RegExp[]> = {
  cpuModelGuess: [/^[ \t]*(?:CPU Brand Name|Processor Name)[ \t]*[:\t][ \t]*(.+)$/im],
  gpuModelGuess: [
    /^[ \t]*Video Chipset[ \t]*[:\t][ \t]*(.+)$/im,   // the GPU itself
    /^[ \t]*Video Card[ \t]*[:\t][ \t]*(.+)$/im,      // board-partner name, fallback only
  ],
  systemModel: [/^[ \t]*Computer Brand Name[ \t]*[:\t][ \t]*(.+)$/im],
  ramModelGuess: [/^[ \t]*Module Part Number[ \t]*[:\t][ \t]*(.+)$/im],
};
const MEM_RE = /^[ \t]*Total Memory Size[ \t]*[:\t][ \t]*([\d.,]+)[ \t]*([GM])Bytes/im;

// HWiNFO's HTM report is table soup; flatten it to 'Label\tvalue' lines so the same
// field regexes apply. Regex-based on purpose: no DOM keeps this node-testable.
function htmlToText(html: string): string {
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<(?:br|\/tr|\/p|\/div|\/h\d)[^>]*>/gi, '\n')
    .replace(/<\/t[dh]>/gi, '\t')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>');
}

export function parseReport(bytes: Uint8Array): Partial<InferredSpecs> | null {
  if (bytes.length === 0) return null;
  let text: string;
  try {
    text = decodeBytes(bytes);
  } catch {
    return null;
  }
  if (/<html[\s>]|<!doctype html/i.test(text.slice(0, 1024))) text = htmlToText(text);

  const out: Partial<InferredSpecs> = {};
  for (const [field, res] of Object.entries(FIELD_RES) as [ReportField, RegExp[]][]) {
    for (const re of res) {
      const m = re.exec(text);
      if (m) {
        out[field] = m[1].trim();
        break;
      }
    }
  }
  const mem = MEM_RE.exec(text);
  if (mem) {
    const size = Number(mem[1].replace(',', '.'));
    if (Number.isFinite(size) && size > 0) {
      out.ramMb = Math.round(mem[2].toUpperCase() === 'G' ? size * 1024 : size);
    }
  }

  // A "report" we can't name a CPU or GPU from isn't worth merging.
  if (out.cpuModelGuess === undefined && out.gpuModelGuess === undefined) return null;
  return out;
}
```

And `src/report/mergeSpecs.ts`:

```ts
import type { InferredSpecs } from '../types';

// Report fields are authoritative where present; everything else keeps the
// CSV-inferred value. Object.assign sidesteps the union-typed keyed write TS
// strict would otherwise reject.
export function mergeSpecs(current: InferredSpecs, fromReport: Partial<InferredSpecs>): InferredSpecs {
  const patch: Partial<InferredSpecs> = {};
  for (const key of Object.keys(fromReport) as (keyof InferredSpecs)[]) {
    const v = fromReport[key];
    if (v !== null && v !== undefined) Object.assign(patch, { [key]: v });
  }
  return { ...current, ...patch };
}
```

- [ ] **Step 5: Run tests, reconcile with the real fixtures**

Run: `npx vitest src/report` → PASS. If a fixture test fails because the real file uses different labels, update `FIELD_RES` **and** the synthetic `TXT_REPORT` string together (the format the synthetic tests encode must be the real one), then tighten the fixture assertions to exact strings as instructed in the test comment.

- [ ] **Step 6: Commit**

```bash
git add src/report/parseReport.ts src/report/parseReport.test.ts src/report/mergeSpecs.ts src/report/mergeSpecs.test.ts
git commit -m "feat(report): parse HWiNFO save-reports into authoritative spec overrides"
```

---

### Task 6: SpecsCard — report import target

**Files:**
- Modify: `src/ui/SpecsCard.tsx`, `src/ui/SpecsCard.css`
- Test: `src/ui/SpecsCard.test.tsx`

Read `src/ui/DESIGN.md` before touching anything here. The new target is part of the existing `<Card>` — no `<GlassCard>`, no new glow, tokens-only CSS.

- [ ] **Step 1: Write failing tests** (append to `src/ui/SpecsCard.test.tsx`; add `waitFor` to the existing `@testing-library/react` import)

```tsx
const REPORT_TXT = [
  'Computer Brand Name: Custom Desktop',
  'CPU Brand Name: AMD Ryzen 7 7800X3D 8-Core Processor',
  'Video Chipset: AMD Radeon RX 7800 XT',
  'Total Memory Size: 64 GBytes',
].join('\n');

function dropOnReportZone(content: string, name = 'report.txt') {
  const zone = screen.getByRole('group', { name: /hwinfo report/i });
  fireEvent.drop(zone, { dataTransfer: { files: [new File([content], name, { type: 'text/plain' })] } });
}

describe('SpecsCard report import', () => {
  it('dropping a HWiNFO report merges the exact names and persists them', async () => {
    const onChange = vi.fn();
    render(<SpecsCard specs={sampleSpecs} onChange={onChange} />);
    dropOnReportZone(REPORT_TXT);
    await waitFor(() => expect(onChange).toHaveBeenCalledWith(expect.objectContaining({
      cpuModelGuess: 'AMD Ryzen 7 7800X3D 8-Core Processor',
      gpuModelGuess: 'AMD Radeon RX 7800 XT',
      ramMb: 64 * 1024,
    })));
    expect(loadSpecs()?.cpuModelGuess).toBe('AMD Ryzen 7 7800X3D 8-Core Processor');
  });

  it('only patches what the report states — other fields survive', async () => {
    const onChange = vi.fn();
    render(<SpecsCard specs={sampleSpecs} onChange={onChange} />);
    dropOnReportZone('CPU Brand Name: AMD Ryzen 7 7800X3D 8-Core Processor\n');
    await waitFor(() => expect(onChange).toHaveBeenCalled());
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({
      cpuModelGuess: 'AMD Ryzen 7 7800X3D 8-Core Processor',
      gpuModelGuess: sampleSpecs.gpuModelGuess,
      ramModules: sampleSpecs.ramModules,
    }));
  });

  it('manual edits after a report import still win', async () => {
    const onChange = vi.fn();
    render(<SpecsCard specs={sampleSpecs} onChange={onChange} />);
    dropOnReportZone(REPORT_TXT);
    await waitFor(() => expect(onChange).toHaveBeenCalled());
    fireEvent.change(screen.getByLabelText('CPU model'), { target: { value: 'My Custom CPU' } });
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ cpuModelGuess: 'My Custom CPU' }));
  });

  it('a file that is not a report shows an inline note and changes nothing', async () => {
    const onChange = vi.fn();
    render(<SpecsCard specs={sampleSpecs} onChange={onChange} />);
    dropOnReportZone('definitely not a hwinfo report');
    expect(await screen.findByRole('alert')).toHaveTextContent(/couldn't read/i);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('a successful import clears a previous error note', async () => {
    render(<SpecsCard specs={sampleSpecs} onChange={vi.fn()} />);
    dropOnReportZone('garbage');
    await screen.findByRole('alert');
    dropOnReportZone(REPORT_TXT);
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
  });
});
```

If the installed jsdom lacks `File.prototype.arrayBuffer` (very old jsdom only), polyfill it in `src/test/setup.ts` from `Blob` via `FileReader` — but check first; current vitest+jsdom versions provide it.

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest src/ui/SpecsCard.test.tsx` → the five new tests FAIL (no report zone rendered).

- [ ] **Step 3: Implement in `src/ui/SpecsCard.tsx`**

New imports (note `Button` joins the existing primitives import):

```tsx
import { useRef, useState } from 'react';
import { Card, Button } from './primitives';
import { parseReport } from '../report/parseReport';
import { mergeSpecs } from '../report/mergeSpecs';
```

Inside the component, after `update`:

```tsx
  const reportInputRef = useRef<HTMLInputElement>(null);
  const [reportError, setReportError] = useState(false);

  async function importReport(file: File) {
    const parsed = parseReport(new Uint8Array(await file.arrayBuffer()));
    if (parsed === null) {
      setReportError(true);
      return;
    }
    setReportError(false);
    update(mergeSpecs(specs, parsed));
  }
```

JSX, after the closing `</div>` of `specs-card__fields`, still inside `<Card>`:

```tsx
      <div
        role="group"
        aria-label="HWiNFO report import"
        className="specs-card__report"
        onDrop={(e) => {
          e.preventDefault();
          const f = e.dataTransfer.files?.[0];
          if (f) void importReport(f);
        }}
        onDragOver={(e) => e.preventDefault()}
      >
        <span className="u-dim">Have a HWiNFO report? Drop it here for exact names —</span>
        <Button variant="ghost" onClick={() => reportInputRef.current?.click()}>
          Browse…
        </Button>
        <input
          ref={reportInputRef}
          type="file"
          accept=".txt,.htm,.html,.TXT,.HTM"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void importReport(f);
          }}
          style={{ display: 'none' }}
          aria-hidden="true"
        />
        {reportError && (
          <p role="alert" className="specs-card__report-error">
            Couldn't read that file — export it from HWiNFO via Save Report (TXT or HTML).
          </p>
        )}
      </div>
```

Append to `src/ui/SpecsCard.css` (tokens only, matching the file's existing style):

```css
.specs-card__report {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--s2);
  margin-top: var(--s4);
  padding: var(--s3);
  border: 1px dashed var(--border);
  border-radius: var(--r-md);
}

.specs-card__report-error {
  flex-basis: 100%;
  margin: 0;
  color: var(--bad);
}
```

- [ ] **Step 4: Run the UI suite + typecheck**

Run: `npx vitest src/ui/SpecsCard.test.tsx` → PASS, then `npm run test` and `npm run build` → all green. (The report module imports cleanly into jsdom; `parseReport` has no node-only dependencies.)

- [ ] **Step 5: Commit**

```bash
git add src/ui/SpecsCard.tsx src/ui/SpecsCard.css src/ui/SpecsCard.test.tsx
git commit -m "feat(ui): import a HWiNFO report from the specs card"
```

---

## Verification (end of item #4)

1. `npm run build` — strict typecheck green.
2. `npm run test` — full suite green, including the hand-reviewed golden snapshot (Task 4's single added line is the only digest change).
3. Manual pass (`npm run dev`):
   - Drop a sample CSV → verdict renders; temp tiles colored by class thresholds (Intel laptop CPU unchanged; NVIDIA laptop GPU now uses 80/87).
   - Open the specs card → drop the real HWiNFO report from Task 5 → the exact CPU/GPU/RAM names appear in the card fields **and** in the digest's "System" block (the DigestPanel re-renders from the edited specs).
   - Drop a random `.txt` on the report target → inline "Couldn't read that file" note; nothing else changes; dropping a valid report afterwards clears it.
   - Full digest contains the "Typical for this class of hardware: …" line; compact does not.
4. Registry provenance audit: every alias added in Task 1 has a comment, and every unverified one says `provisional`.

## Future / stretch

- **Per-SKU reference DB** — exact TjMax/boost behavior per model string, layered on top of (never replacing) the class table.
- **TDP-class auto-detection** — infer the power class from sustained `cpu.power`/`gpu.power` so a 55 W laptop part and a 170 W desktop part with the same name get different expectations.
- **Community-contributed label packs** — a JSON alias→key format so new HWiNFO labels ship without code changes; the provenance comments from Task 1 become pack metadata.
- **Fuzzy same-machine matching in `App.tsx`** — today the saved-specs guard compares `cpuModelGuess`/`gpuModelGuess` as exact strings, so a report-exact name ("… 8-Core Processor") won't match the next CSV's trailer name and the report-corrected specs get discarded on the next analysis. Normalize both sides (strip suffixes, casefold) before comparing.
- **Report-driven vendor refresh** — re-derive `cpuVendor`/`gpuVendor` from report model strings when the CSV fingerprint came up `unknown`.

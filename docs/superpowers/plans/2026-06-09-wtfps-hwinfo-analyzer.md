# WTFPS HWiNFO Analyzer — v1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a fully client-side web app that parses a HWiNFO CSV in-browser, shows a plain-language Easy/Nerd verdict with five hero numbers, and emits a token-efficient "Copy prompt for my LLM" digest.

**Architecture:** Pure-TypeScript analysis engine (decode → CSV parse → sensor normalize → stats → detectors → verdict → digest) that is fully unit-tested against the real sample logs, wrapped by a React + Vite UI that runs the engine in a Web Worker. No network, no backend; only `localStorage` for the editable specs card.

**Tech Stack:** React 18, Vite 5, TypeScript 5, Vitest (+ jsdom for UI), uPlot (Nerd-mode timelines, Phase 7). No data libraries beyond a hand-rolled CSV reader (HWiNFO's format is too quirky for off-the-shelf parsers).

**Phasing:** Phases 0–6 build and fully test the engine (each ends green and committed). Phase 7 builds the UI on the green engine and leans on the `frontend-design` skill for the visual system. Build smallest-useful-slice first; the engine alone already produces the digest text.

---

## Conventions

- **Test runner:** `npm run test` → `vitest run`. Single file: `npm run test -- src/parsing/decode.test.ts`.
- **Fixtures:** tiny hand-authored CSVs under `src/__fixtures__/` capture one quirk each (deterministic, fast). The 12 real logs in `HWINFO samples/` are used only by the Phase 6 golden integration test.
- **Commits:** conventional commits, one per task. Frequent.
- **No `any`** in committed code; model unknowns explicitly.
- **Encoding gotcha:** sample files are Windows-1252. In Node tests, read them as bytes (`fs.readFileSync(path)` → `Uint8Array`/`Buffer`), never as a utf-8 string.

---

## Agent-team execution & file ownership

Built for a **lead + 2 teammates**. The engine is a sequential spine with one clean parallel seam: once `src/types.ts` and `src/stats/percentiles.ts` are frozen, the ingest pipeline and the analysis/output modules depend only on that shared layer, not on each other's code. The rules below guarantee two agents never write the same file. A solo or subagent-driven run can ignore this section and execute the phases in order.

**Roles & exclusive write ownership** (no agent edits paths it does not own):

| Role | Owns (exclusive write access) | Tasks |
|---|---|---|
| **Lead** | `package.json`, `tsconfig*.json`, `vite.config.ts`, `vitest.config.ts`, `index.html`, `src/main.tsx`, `src/App.tsx`, **`src/types.ts`**, **`src/stats/percentiles.ts`**, `src/engine/**`, `src/engine/__fixtures__/` (golden refs), the golden test | 0, 2.1, 3.1, 6.2 |
| **Ingest** | `src/parsing/**`, `src/sensors/**`, `src/stats/fps.ts` (incl. each dir's `__fixtures__/`) | 1, 2.2–2.4, 3.2 |
| **Analysis** | `src/detect/**`, `src/verdict/**`, `src/digest/**` (incl. `src/detect/testkit.ts`) | 4, 5, 6.1 |

Both teammates may **import** `src/types.ts` and `src/stats/percentiles.ts` freely; neither may **edit** them.

**Sequencing (hard barriers):**
1. **Pre-fan-out — lead only, sequential, lands on `main`:** Task 0.1 (scaffold + install *all* engine deps) → Task 2.1 (`src/types.ts`) → Task 3.1 (`src/stats/percentiles.ts`, a pure dependency-free utility both streams need). Commit each. Then **announce the frozen `CanonicalKey`/`FlagKey`/interface names** to both teammates. No parallel work begins until this is committed.
2. **Parallel phase:** Ingest and Analysis run concurrently against the frozen shared layer. They do **not** import each other's modules. Analysis builds against synthetic logs from its own `src/detect/testkit.ts` (below) and computes stats with the shared `computeStats` — it never calls Ingest's `normalize`/`buildFps`.
3. **Join — lead only:** after both streams are green, Task 6.2 wires `analyze()` and runs the golden tests on the real logs. This is the **only** place ingest + analysis code meet.

**Conflict-avoidance rules:**
- **`package.json` and all configs are lead-only.** The lead installs every engine dependency in Phase 0, so teammates never touch `package.json`. Need a new dep? Ask the lead (SendMessage); the lead installs, commits, and re-announces.
- **`src/types.ts` is frozen after Task 2.1.** Import it; never edit it. If a type genuinely must change, post the proposed diff to the lead — the lead edits, commits, and re-announces. This kills the classic "two agents redefine the same interface" race.
- **No shared barrel file.** There is no `src/index.ts` everyone appends to; modules are imported by explicit path. The only cross-stream integration file is `src/engine/analyze.ts` (lead).
- **Fixtures live under the owning module** (`src/parsing/__fixtures__/`, `src/sensors/__fixtures__/`, `src/engine/__fixtures__/`). No stream writes into another's `__fixtures__/`.
- **Commits are scoped to owned paths.** Each `git add` lists only files inside the owning directories, so the two streams' commits never overlap. Run the whole suite (`npm run test`) before declaring a task done; because files are disjoint, one stream's red test can't block the other.

**Analysis-owned test helper — `src/detect/testkit.ts`** (lets Stream B build a `NormalizedLog` without the real pipeline):

```ts
import type { NormalizedLog, CanonicalKey, FlagKey } from '../types';

export function makeLog(over: {
  sensors?: Partial<Record<CanonicalKey, number[]>>;
  flags?: Partial<Record<FlagKey, boolean[]>>;
  fps?: Partial<NormalizedLog['fps']>;
  pollMs?: number;
}): NormalizedLog {
  const sensors: NormalizedLog['sensors'] = {};
  for (const [k, values] of Object.entries(over.sensors ?? {}))
    sensors[k as CanonicalKey] = { key: k as CanonicalKey, label: k, unit: null, values };
  const flags: NormalizedLog['flags'] = {};
  for (const [k, values] of Object.entries(over.flags ?? {}))
    flags[k as FlagKey] = { key: k as FlagKey, label: k, values };
  return {
    rowCount: over.sensors ? Object.values(over.sensors)[0]?.length ?? 0 : 0,
    pollMs: over.pollMs ?? 2000,
    specs: { cpuVendor: 'unknown', cpuModelGuess: null, gpuVendor: 'unknown', gpuModelGuess: null, igpuPresent: false, isLaptop: false, ramMb: null },
    sensors, flags,
    fps: { source: 'none', sourceLabel: '', clean: [], stats: null, presentedAvg: null, displayedAvg: null, capped: false, capValue: null, ...over.fps },
    unknownColumns: [],
  };
}
```

---

## Shared types — defined once in `src/types.ts` (Task 2.1), referenced everywhere

These names are authoritative. Later tasks must match them exactly.

```ts
export type Delimiter = ',' | ';';
export type Decimal = '.' | ',';

export interface ParsedCsv {
  headers: string[];        // raw header cells, order preserved, includes duplicates
  rows: string[][];         // data rows only (footers stripped), cells as raw strings
  delimiter: Delimiter;
  decimal: Decimal;
}

export interface ColumnMeta {
  raw: string;              // original header text e.g. 'GPU Hot Spot Temperature [°C]'
  name: string;             // without the unit, trimmed e.g. 'GPU Hot Spot Temperature'
  unit: string | null;      // '°C' | 'MHz' | '%' | 'W' | 'V' | 'FPS' | 'Yes/No' | ... | null
  index: number;            // position in headers
  dupIndex: number;         // 0 for first occurrence of `name`, 1 for second, ...
}

export type CanonicalKey =
  // CPU
  | 'cpu.tempPackage' | 'cpu.tempCoreMax' | 'cpu.usageTotal' | 'cpu.usageCoreMax'
  | 'cpu.clock' | 'cpu.clockEff' | 'cpu.power'
  // discrete (gaming) GPU
  | 'gpu.temp' | 'gpu.hotspot' | 'gpu.memJunction' | 'gpu.usage'
  | 'gpu.clock' | 'gpu.clockEff' | 'gpu.power' | 'gpu.powerLimit' | 'gpu.memUsagePct'
  // integrated GPU (laptops)
  | 'igpu.temp' | 'igpu.usage'
  // memory
  | 'ram.loadPct' | 'ram.usedMb' | 'pagefile.usagePct'
  // fps (filled via FpsData, not a plain series)
  ;

export type FlagKey =
  | 'flag.cpu.thermalThrottle' | 'flag.cpu.prochot' | 'flag.cpu.ratl' | 'flag.cpu.powerLimit'
  | 'flag.gpu.perfLimitPower' | 'flag.gpu.perfLimitThermal' | 'flag.gpu.perfLimitUtil';

export interface NumericSensor { key: CanonicalKey; label: string; unit: string | null; values: (number | null)[]; }
export interface FlagSensor { key: FlagKey; label: string; values: boolean[]; }

export type CpuVendor = 'intel' | 'amd' | 'unknown';
export type GpuVendor = 'nvidia' | 'amd' | 'intel' | 'unknown';

export interface InferredSpecs {
  cpuVendor: CpuVendor;
  cpuModelGuess: string | null;     // e.g. 'Intel hybrid (6P+8E)' — a guess, user-editable
  gpuVendor: GpuVendor;
  gpuModelGuess: string | null;
  igpuPresent: boolean;
  isLaptop: boolean;
  ramMb: number | null;
}

export interface Stats { count: number; avg: number; min: number; max: number; p5: number; p95: number; p99: number; p1Low: number; p5Low: number; }

export type FpsSource = 'displayed' | 'presented' | 'legacy' | 'none';
export interface FpsData {
  source: FpsSource;
  sourceLabel: string;              // e.g. 'Framerate Displayed (avg)'
  clean: number[];                  // post-cleaning samples used for stats
  stats: Stats | null;             // null when source === 'none'
  presentedAvg: number | null;      // exposed in Nerd mode
  displayedAvg: number | null;
  capped: boolean;
  capValue: number | null;          // detected ceiling, when capped
}

export interface NormalizedLog {
  rowCount: number;
  pollMs: number;                   // median sample interval
  specs: InferredSpecs;
  sensors: Partial<Record<CanonicalKey, NumericSensor>>;
  flags: Partial<Record<FlagKey, FlagSensor>>;
  fps: FpsData;
  unknownColumns: string[];
}

export type Severity = 'info' | 'warn' | 'bad';
export interface DiagEvent { id: string; type: string; severity: Severity; sentence: string; fix?: string; sampleCount: number; }

export type Health = 'good' | 'warn' | 'bad';
export type MascotMood = 'chill' | 'concerned' | 'panic';
export interface HeroNumber { key: string; label: string; value: string; severity: Severity; }
export interface Finding { severity: Severity; text: string; fix?: string; }
export interface Verdict { health: Health; mascotMood: MascotMood; headline: string; hero: HeroNumber[]; findings: Finding[]; }

export type DigestMode = 'compact' | 'full';
export interface Digest { compact: string; full: string; tokenEstimate: Record<DigestMode, number>; fpsSourceLabel: string; }

export interface AnalysisResult { log: NormalizedLog; stats: Partial<Record<CanonicalKey, Stats>>; events: DiagEvent[]; verdict: Verdict; digest: Digest; }
```

---

## Phase 0 — Scaffold & tooling

### Task 0.1: Create the project skeleton

**Files:**
- Create: `package.json`, `tsconfig.json`, `tsconfig.node.json`, `vite.config.ts`, `vitest.config.ts`, `index.html`, `src/main.tsx`, `src/App.tsx`, `.gitignore`
- Create: `src/sanity.test.ts`

> Scaffold manually rather than `npm create vite` — the working dir already contains
> `HWINFO samples/`, which makes create-vite prompt interactively.

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "wtfps",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "preview": "vite preview",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": { "react": "^18.3.1", "react-dom": "^18.3.1", "uplot": "^1.6.31" },
  "devDependencies": {
    "@types/react": "^18.3.3", "@types/react-dom": "^18.3.0",
    "@vitejs/plugin-react": "^4.3.1", "typescript": "^5.5.4",
    "vite": "^5.4.0", "vitest": "^2.0.5", "jsdom": "^24.1.1"
  }
}
```

- [ ] **Step 2: Create `tsconfig.json`, `tsconfig.node.json`, `vite.config.ts`, `vitest.config.ts`, `index.html`, `src/main.tsx`, `src/App.tsx`, `.gitignore`**

`tsconfig.json` — strict, bundler resolution, `noUnusedLocals`. `vite.config.ts` uses `@vitejs/plugin-react`. `vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';
export default defineConfig({ test: { environment: 'node', include: ['src/**/*.test.ts', 'src/**/*.test.tsx'] } });
```

`.gitignore`: `node_modules`, `dist`, `*.local`. `src/App.tsx`: a one-line placeholder component. `src/main.tsx`: mounts `<App/>`.

- [ ] **Step 3: Write the sanity test** — `src/sanity.test.ts`

```ts
import { describe, it, expect } from 'vitest';
describe('toolchain', () => { it('runs', () => { expect(1 + 1).toBe(2); }); });
```

- [ ] **Step 4: Install and verify**

Run: `npm install` then `npm run test`
Expected: `sanity.test.ts` PASS (1 passed).

- [ ] **Step 5: Initialize git and commit**

```bash
git init
git add -A
git commit -m "chore: scaffold vite + react + ts + vitest"
```

> Note: `HWINFO samples/` is committed too — those logs are golden test fixtures.

---

## Phase 1 — Parsing core

### Task 1.1: Byte decoding (`src/parsing/decode.ts`)

**Files:** Create `src/parsing/decode.ts`, `src/parsing/decode.test.ts`

- [ ] **Step 1: Failing test**

```ts
import { describe, it, expect } from 'vitest';
import { decodeBytes } from './decode';

describe('decodeBytes', () => {
  it('decodes Windows-1252 degree sign (0xB0) to °, not �', () => {
    // 'GPU [°C]' with 0xB0 for the degree sign (Win-1252)
    const bytes = new Uint8Array([0x47, 0x50, 0x55, 0x20, 0x5B, 0xB0, 0x43, 0x5D]);
    expect(decodeBytes(bytes)).toBe('GPU [°C]');
  });
  it('keeps valid UTF-8 intact', () => {
    const bytes = new TextEncoder().encode('GPU [°C]');
    expect(decodeBytes(bytes)).toBe('GPU [°C]');
  });
});
```

- [ ] **Step 2: Run — expect FAIL** (`decodeBytes is not a function`). Run: `npm run test -- src/parsing/decode.test.ts`

- [ ] **Step 3: Implement**

```ts
// HWiNFO writes CSVs in the OS code page (Windows-1252 here). We sniff for a UTF-8 BOM /
// valid UTF-8; otherwise fall back to Windows-1252 so '°C' doesn't become '�C'.
export function decodeBytes(bytes: Uint8Array): string {
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return new TextDecoder('utf-8').decode(bytes.subarray(3));
  }
  const utf8 = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
  if (!utf8.includes('�')) return utf8;          // clean utf-8
  return new TextDecoder('windows-1252').decode(bytes); // HWiNFO default
}
```

- [ ] **Step 4: Run — expect PASS.**
- [ ] **Step 5: Commit** — `git commit -am "feat(parsing): windows-1252 aware byte decoder"`

### Task 1.2: CSV reader (`src/parsing/csv.ts`)

Handles: delimiter detection (`,` vs `;`), decimal detection (`.` vs `,`), quoted fields containing the delimiter, trailing empty column, and stripping HWiNFO footer/summary rows (rows whose first cell is not a `D.M.YYYY`-style date).

**Files:** Create `src/parsing/csv.ts`, `src/parsing/csv.test.ts`, `src/parsing/__fixtures__/mini-comma.csv`, `src/parsing/__fixtures__/mini-semicolon.csv`

- [ ] **Step 1: Create fixtures.** `mini-comma.csv` (dot decimals, trailing comma, a quoted header with a comma, plus a trailing `Average,…` footer row):

```
Date,Time,"GPU Temperature [°C]","Framerate Displayed (avg) [FPS]",
9.6.2026,12:00:00.000,74.1,119.9,
9.6.2026,12:00:02.000,75.2,141.6,
Average,,74.7,130.8,
```

`mini-semicolon.csv` (EU export: `;` delimiter, comma decimals):

```
Date;Time;"GPU Temperature [°C]";"Core Clocks (avg) [MHz]";
9.6.2026;12:00:00,000;74,1;3976,0;
9.6.2026;12:00:02,000;75,2;3634,0;
```

- [ ] **Step 2: Failing test**

```ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseCsv } from './csv';
import { decodeBytes } from './decode';

const load = (p: string) => decodeBytes(readFileSync(new URL(p, import.meta.url)));

describe('parseCsv', () => {
  it('detects comma delimiter + dot decimal and strips the footer row', () => {
    const r = parseCsv(load('./__fixtures__/mini-comma.csv'));
    expect(r.delimiter).toBe(',');
    expect(r.decimal).toBe('.');
    expect(r.headers[2]).toBe('GPU Temperature [°C]');   // quotes removed
    expect(r.rows).toHaveLength(2);                       // 'Average' footer dropped
    expect(r.rows[0][2]).toBe('74.1');
  });
  it('detects semicolon delimiter + comma decimal', () => {
    const r = parseCsv(load('./__fixtures__/mini-semicolon.csv'));
    expect(r.delimiter).toBe(';');
    expect(r.decimal).toBe(',');
    expect(r.rows[0][2]).toBe('74,1');                    // raw; numeric parse happens later
  });
});
```

- [ ] **Step 3: Run — expect FAIL.**
- [ ] **Step 4: Implement `parseCsv`.** Sniff the delimiter from the header line (`;` if it has more `;` than `,`, else `,`). Decimal is `,` when delimiter is `;`, else `.`. Tokenize each line respecting double-quotes; drop a single trailing empty cell. A row is data iff its first cell matches `/^\d{1,2}\.\d{1,2}\.\d{4}$/` (HWiNFO date); everything else (footer `Average`/`Minimum`/`Maximum`, blank lines) is skipped. Return `ParsedCsv`.
- [ ] **Step 5: Run — expect PASS.**
- [ ] **Step 6: Commit** — `feat(parsing): quirk-tolerant CSV reader`

### Task 1.3: Column model (`src/parsing/columns.ts`)

Splits each header into `{ raw, name, unit, index, dupIndex }`. Unit is the trailing `[...]`; `dupIndex` counts repeats of the same `name`.

**Files:** Create `src/parsing/columns.ts`, `src/parsing/columns.test.ts`

- [ ] **Step 1: Failing test**

```ts
import { describe, it, expect } from 'vitest';
import { buildColumns } from './columns';

describe('buildColumns', () => {
  it('extracts unit and assigns dupIndex to repeated names', () => {
    const cols = buildColumns(['Date', 'GPU Temperature [°C]', 'GPU [RPM]', 'GPU Temperature [°C]']);
    expect(cols[1]).toMatchObject({ name: 'GPU Temperature', unit: '°C', index: 1, dupIndex: 0 });
    expect(cols[3]).toMatchObject({ name: 'GPU Temperature', unit: '°C', index: 3, dupIndex: 1 });
    expect(cols[0]).toMatchObject({ name: 'Date', unit: null });
  });
});
```

- [ ] **Step 2–5:** Run (FAIL) → implement (regex `/^(.*?)\s*\[([^\]]*)\]\s*$/`, trim, track a `Map<string,count>` for `dupIndex`) → run (PASS) → commit `feat(parsing): column metadata model`.

---

## Phase 2 — Sensor normalization (the hard part)

### Task 2.1: Shared types (`src/types.ts`) — FROZEN CONTRACT (lead, pre-fan-out)

> This is the shared contract for the whole engine. In a team run the lead writes and commits it **before** any teammate starts, then announces the final key/interface names. After this task it is frozen: teammates import it but never edit it (change requests go through the lead).

- [ ] **Step 1:** Create `src/types.ts` with the exact contents from the **Shared types** section above.
- [ ] **Step 2:** Add `src/types.test.ts` with a trivial compile/usage assertion (construct a minimal `NormalizedLog` literal and assert a field) so the file is covered and type drift is caught.
- [ ] **Step 3–4:** Run → PASS. **Step 5:** Commit `feat: shared engine types`.

### Task 2.2: Sensor registry (`src/sensors/registry.ts`)

A list of canonical sensor definitions, each with ordered matchers and a domain. Matchers run against `ColumnMeta.name`.

```ts
export interface SensorDef {
  key: CanonicalKey | FlagKey;
  domain: 'cpu' | 'gpu' | 'igpu' | 'ram' | 'flag';
  kind: 'numeric' | 'flag';
  label: string;
  unit: string | null;
  match: (name: string) => boolean;   // case-insensitive
}
```

- [ ] **Step 1: Failing test** asserts that representative real header names resolve to the right key, e.g. `'GPU Hot Spot Temperature' → gpu.hotspot`, `'CPU Package' → cpu.tempPackage`, `'Total CPU Usage' → cpu.usageTotal`, `'GPU Core Load' → gpu.usage`, `'GPU D3D Usage' (iGPU section) → igpu.usage` is resolved in normalize (registry just needs the gpu/igpu matchers), `'Physical Memory Load' → ram.loadPct`, `'Performance Limit - Utilization' → flag.gpu.perfLimitUtil`. Provide a `findSensor(name): SensorDef | null` helper and test it.
- [ ] **Step 2–5:** Run (FAIL) → implement the registry array + `findSensor` (first matching def wins) → run (PASS) → commit `feat(sensors): canonical sensor registry`.

> Disambiguating *which* GPU a duplicate belongs to is NOT the registry's job — it's done in `normalize` using section context (Task 2.4).

### Task 2.3: Hardware fingerprint (`src/sensors/fingerprint.ts`)

Infers `InferredSpecs` from the set of column names.

- [ ] **Step 1: Failing tests** (use the real headers via the loaded sample, or inline header arrays):
  - Headers containing `P-core 0 VID` and `E-core 6 VID` → `cpuVendor: 'intel'`, `cpuModelGuess` mentions `6P+8E`.
  - Headers containing `Core0 (CCD1)` and `Infinity Fabric Clock (FCLK)` → `cpuVendor: 'amd'`, guess mentions chiplet.
  - Headers containing `GPU 12VHPWR Voltage` or `GPU Memory Junction Temperature` → `gpuVendor: 'nvidia'`.
  - Headers containing `Battery Voltage` or `APU STAPM Limit` → `isLaptop: true`.
  - Headers containing `GPU Core Voltage (VDDCR_GFX)` or `iGPU VID` → `igpuPresent: true`.
- [ ] **Step 2–5:** Run (FAIL) → implement pattern checks → run (PASS) → commit `feat(sensors): hardware fingerprint inference`.

### Task 2.4: Normalize (`src/sensors/normalize.ts`)

Maps `ColumnMeta[]` + raw rows → `NormalizedLog` (minus stats/fps, which are filled in Phase 3 via the orchestrator; this task returns sensors+flags+specs+unknownColumns+pollMs). Core responsibilities:
1. Parse numeric cells using the detected decimal (`,`→`.` when needed); `''`/non-numeric → `null`.
2. Parse Yes/No cells → boolean.
3. **Disambiguate duplicate GPU columns by section:** walk columns left→right; the discrete-GPU block is the one containing `12VHPWR`/`Memory Junction`/`Hot Spot`; the iGPU block contains `VDDCR_GFX`/`iGPU VID`/`STAPM`. A duplicate `GPU Temperature` resolves to `gpu.temp` or `igpu.temp` based on which block its index falls in.
4. Compute `pollMs` as the median delta of parsed timestamps.
5. Collect unmatched columns into `unknownColumns`.

- [ ] **Step 1: Failing test** with a fixture that has two `GPU Temperature` columns in different sections:

```
Date,Time,"GPU Memory Junction Temperature [°C]","GPU Temperature [°C]","iGPU VID [V]","GPU Temperature [°C]",
9.6.2026,12:00:00.000,72.0,74.1,0.30,49.4,
9.6.2026,12:00:02.000,72.0,75.2,0.30,49.6,
```

Assert `log.sensors['gpu.temp']!.values` is `[74.1, 75.2]` (the one near Memory Junction) and `log.sensors['igpu.temp']!.values` is `[49.4, 49.6]` (the one near iGPU VID).

- [ ] **Step 2–5:** Run (FAIL) → implement section detection + numeric/flag parsing + dedup resolution → run (PASS) → commit `feat(sensors): normalize columns into canonical sensors`.

---

## Phase 3 — Stats & FPS cleaning

### Task 3.1: Percentiles (`src/stats/percentiles.ts`) — shared utility (lead, pre-fan-out)

> A pure, dependency-free utility that both streams import. In a team run the lead builds and freezes it alongside `types.ts` before fan-out; Analysis uses `computeStats` directly in its detector/verdict/digest tests, so it never depends on Ingest's pipeline.

`computeStats(values: (number|null)[]): Stats` — drops nulls, returns avg/min/max/p5/p95/p99 and p1Low/p5Low (the mean of the lowest 1%/5% of samples — the gamer "1% low" convention).

- [ ] **Step 1: Failing test** on a known array `[10,20,30,40,50,60,70,80,90,100]`: `avg=55`, `min=10`, `max=100`, `p95≈95` (document the interpolation method in the test), `p1Low`/`p5Low` equal the low-tail means. Include a nulls-ignored case and an all-null case (returns `count: 0` and zeros, never `NaN`).
- [ ] **Step 2–5:** Run (FAIL) → implement (sort once; linear-interpolated percentile; low-tail mean via `slice`) → run (PASS) → commit `feat(stats): percentile + 1%-low statistics`.

### Task 3.2: FPS pipeline (`src/stats/fps.ts`)

`buildFps(columns, rows, decimal): FpsData`. Rules (from the real data):
- Source priority: `Framerate Displayed (avg)` → `Framerate Presented (avg)` → legacy `Framerate [FPS]` → `none`.
- **Clean before stats:** drop `0`/blank samples (legacy column alternates `0→value`); drop implausible spikes (`> 1000` FPS, wrong-process capture).
- Compute `stats` on the cleaned series; expose `presentedAvg`/`displayedAvg` for Nerd mode; set `sourceLabel`.
- `source: 'none'` when no Framerate* columns exist → downstream shows "no framerate logged".
- Cap detection: `capped = true` when ≥80% of cleaned samples fall within ±1 FPS of a common ceiling (e.g. 60/120/141/144); record `capValue`.

- [ ] **Step 1: Failing tests:**
  - Given a `Framerate Displayed (avg)` column `[0, 119.9, 0, 141.6, 5000]` → cleaned `[119.9, 141.6]` (zeros + 5000 spike removed), `source: 'displayed'`.
  - Given only a legacy `Framerate [FPS]` column → `source: 'legacy'`.
  - Given no FPS columns → `source: 'none'`, `stats: null`.
  - Given `[60.1, 59.9, 60.0, 60.2, 60.0]` → `capped: true`, `capValue: 60`.
- [ ] **Step 2–5:** Run (FAIL) → implement → run (PASS) → commit `feat(stats): FPS cleaning, source selection, cap detection`.

---

## Phase 4 — Detectors

Each detector is `(log: NormalizedLog, stats) => DiagEvent[]`. Sentences are plain English with concrete numbers. `events.ts` defines a tiny helper to build/format events and a stable `id`.

### Task 4.1: Event helper (`src/detect/events.ts`)
- [ ] Failing test: `makeEvent({type, severity, sentence, fix, sampleCount})` returns a `DiagEvent` with a deterministic id (`type` + slug). Implement → PASS → commit `feat(detect): event constructor`.

### Task 4.2: Thermal throttling (`src/detect/throttling.ts`)
Fires when any of: `flag.cpu.thermalThrottle`/`flag.cpu.prochot`/`flag.cpu.ratl` true for ≥N samples, OR a correlation where `cpu.clock`/`gpu.clock` drops ≥X% within a window where `cpu.tempCoreMax`/`gpu.temp` is near its max.
- [ ] Failing test: a synthetic `NormalizedLog` with `flag.cpu.thermalThrottle = [false,true,true,true]` → one `bad`/`warn` event whose sentence names the count and peak temp; with a fix line ("improve cooling / lower power limit / undervolt"). Implement → PASS → commit.

### Task 4.3: FPS cap + cooling tips (`src/detect/fpsCap.ts`)
When `log.fps.capped` is true AND there is thermal/power headroom (GPU not at thermal/power limit, `gpu.usage` not pinned), emit an `info` event: "FPS is capped at ~`capValue`; you have thermal headroom — you can undervolt / lower the power limit to run cooler and quieter without losing FPS." (This is the feature the user flagged as important.)
- [ ] Failing test: fps `{capped:true, capValue:60}` + low gpu power-limit flag density → event present with the cooling-tip fix. If capped but already thermal-limited, suppress the "you have headroom" claim. Implement → PASS → commit.

### Task 4.4: CPU bottleneck (`src/detect/cpuBottleneck.ts`)
Fires when `gpu.usage` avg `< 90` (GPU starved) OR `flag.gpu.perfLimitUtil` true for a high fraction, OR a single core pinned near 100% while total CPU usage is moderate.
- [ ] Failing test: `gpu.usage` mostly `~70` with `flag.gpu.perfLimitUtil` mostly true → a `warn` event: "GPU averaged 70% — the CPU is likely holding it back." Implement → PASS → commit.

### Task 4.5: Power-limit / hotspot / RAM (`src/detect/powerHotspotRam.ts`)
Three independent checks emitting up to three events:
- Power-limit hits: `flag.cpu.powerLimit` / `flag.gpu.perfLimitPower` density high → "Hitting the power limit X% of the time."
- Hotspot delta: mean(`gpu.hotspot` − `gpu.temp`) `> 15°C` → "GPU hotspot ran 18°C hotter than core — possible poor thermal contact (repaste/pads)."
- RAM pressure: `ram.loadPct` p95 `> 90` or `pagefile.usagePct` high → "Memory was ~95% full — close apps or add RAM."
- [ ] Failing tests, one per check, each with a synthetic log. Implement → PASS → commit.

---

## Phase 5 — Verdict builder

### Task 5.1: `src/verdict/buildVerdict.ts`
`buildVerdict(log, stats, events): Verdict`. Produces:
- `health`: `bad` if any `bad` event, else `warn` if any `warn`, else `good`.
- `mascotMood`: `panic` ↔ bad, `concerned` ↔ warn, `chill` ↔ good (must agree with `health`).
- `hero`: the five tiles — FPS (`log.fps.stats?.avg` or "—" when `none`), CPU usage (`cpu.usageTotal` avg), CPU temp (`cpu.tempPackage`/`cpu.tempCoreMax` max), GPU usage (`gpu.usage` avg), GPU temp (`gpu.temp` max) — each with a per-tile `severity` from simple thresholds (e.g. GPU temp ≥85 → warn, ≥90 → bad).
- `headline`: one plain sentence summarizing the worst finding or "Everything looks healthy."
- `findings`: top 2–4 events mapped to `{severity, text, fix}`.

- [ ] **Step 1: Failing tests:** (a) all-good log → `health:'good'`, `mascotMood:'chill'`, hero has 5 entries, headline is the healthy line. (b) a log with a `bad` throttling event → `health:'bad'`, `mascotMood:'panic'`, GPU-temp tile severity `bad`. (c) `fps.source:'none'` → FPS hero value is `'—'` and not counted as bad.
- [ ] **Step 2–5:** Run (FAIL) → implement → run (PASS) → commit `feat(verdict): traffic-light verdict + hero numbers + mascot mood`.

---

## Phase 6 — Digest & engine orchestrator

### Task 6.1: Digest generator (`src/digest/digest.ts`)
`buildDigest(result-inputs): Digest`. Compact (default) and Full strings, both: a specs block, per-sensor lines (temps/clocks: `avg + p95 + p99 + max`; usage/FPS: `avg + p1/p5 lows`), a "Detected events" section (the event sentences), and an editable goal line placeholder. Full adds more sensors and the Presented-vs-Displayed FPS split. Never include raw rows. `tokenEstimate` ≈ `Math.ceil(text.length / 4)`. Always label the FPS source line, e.g. `FPS (source: Framerate Displayed (avg))`.

- [ ] **Step 1: Failing tests:**
  - Compact digest **contains** the specs line, a `GPU temp` line with `p95`/`p99`/`max`, an `FPS` line with `1% low`, the events section, and the goal line; and **does not** contain any raw CSV timestamp. Use a `toMatchInlineSnapshot` for the compact output on a small synthetic result for stability.
  - `tokenEstimate.compact < tokenEstimate.full`.
  - When `fps.source === 'none'`, the FPS line reads `no framerate logged`.
- [ ] **Step 2–5:** Run (FAIL) → implement → run (PASS) → commit `feat(digest): compact + full LLM digests with token estimate`.

### Task 6.2: Engine orchestrator (`src/engine/analyze.ts`) + golden test
`analyze(bytes: Uint8Array, opts?): AnalysisResult` chains decode → parseCsv → buildColumns → normalize → computeStats (per sensor) → buildFps → detectors → buildVerdict → buildDigest.

- [ ] **Step 1: Failing unit test** on a tiny synthetic CSV: returns an `AnalysisResult` with non-empty `verdict.hero` (5) and a non-empty `digest.compact`.
- [ ] **Step 2: Golden integration test** (`src/engine/analyze.golden.test.ts`) loading two real logs from `HWINFO samples/` as bytes:
  - `Intel + Nvidia/KaiC_NTE_undervolt-65_.CSV`: `specs.cpuVendor==='intel'`, `specs.gpuVendor==='nvidia'`, `specs.isLaptop===true`, `fps.source==='displayed'`, FPS avg within a plausible band (e.g. 60–200), and a CPU-bottleneck OR fps-cap event present (the GPU shows `Performance Limit - Utilization`).
  - `AMD + Nvidia/A16_superposition_1080extreme_2460MHz.CSV`: `specs.cpuVendor==='amd'`, `gpu.temp` max is a real number, digest compact is non-empty and contains the percentile lines.
  - Both: `analyze` does not throw, `unknownColumns` may be non-empty (fine), no hero value is `NaN`.
- [ ] **Step 3: Run — expect FAIL then implement `analyze` until PASS.** (The golden test is the real acceptance gate for the engine.)
- [ ] **Step 4: Run full suite** `npm run test` — all green.
- [ ] **Step 5: Commit** — `feat(engine): end-to-end analyze() + golden tests on real logs`.

**Phase 6 exit:** the engine is complete and proven on real data. The digest (the signature feature's content) already works headlessly.

---

## Phase 7 — UI, visual system, and wiring

> Build the visual system with the **frontend-design** skill (invoke it at the start of this
> phase). The tasks below fix structure, state, and acceptance criteria; frontend-design owns
> the pixel-level execution of the dark "control-room" aesthetic, the glass hero, the WTFPS
> wordmark, and the reactive mascot. Hard visual constraints from the spec: solid dark
> surfaces everywhere, frosted glass ONLY on the hero card (+ modals), single blue accent
> `#3b9eff`, semantic red/amber/green that never go blue (heat stays warm), respect
> `prefers-reduced-motion`, never animate large blurred surfaces, never put data on glass.

UI tests use `environment: 'jsdom'` (add a `// @vitest-environment jsdom` header or a config override) with `@testing-library/react` (add to devDeps in Task 7.1).

### Task 7.1: Worker + analysis hook
- Create `src/worker/analyze.worker.ts` (receives `ArrayBuffer`, posts back `AnalysisResult`) and `src/ui/useAnalysis.ts` (a hook that owns `{status, result, error}` and posts a dropped file's bytes to the worker).
- [ ] Test the hook's reducer/state transitions (idle → parsing → ready/error) with a mocked worker. Implement → PASS → commit.

### Task 7.2: Theme & primitives
- Create `src/ui/theme.css` (CSS variables: `--bg`, `--surface`, `--accent:#3b9eff`, `--good`, `--warn`, `--bad`, glass tokens) and primitive components (`Card`, `GlassCard`, `StatTile`, `Button`).
- [ ] Smoke-render each primitive in jsdom; assert the accent button renders with dark navy text (class/style check). Implement → PASS → commit.

### Task 7.3: DropZone + TopBar (logo + Easy/Nerd toggle)
- `src/ui/DropZone.tsx` (drag-drop + file input; rejects non-`.CSV`), `src/ui/TopBar.tsx` (WTFPS wordmark with blue "F", Easy/Nerd toggle that flips a mode in app state).
- [ ] Test: dropping a file calls the analysis hook; toggle switches mode. Implement → PASS → commit.

### Task 7.4: HeroVerdict + Mascot (the single glass element)
- `src/ui/HeroVerdict.tsx` (the one `GlassCard`: headline + mascot), `src/ui/Mascot.tsx` (inline SVG with `chill` / `concerned` / `panic` states; panic shows worried brows + orange flame; mood prop comes from `verdict.mascotMood`). Plus a `peeking-eyes` favicon asset.
- [ ] Test: `mascotMood='panic'` renders the panic SVG and the verdict color is `--bad`; mood always matches `verdict.health`. Implement → PASS → commit.

### Task 7.5: HeroStats (5 tiles) + FindingsList
- `src/ui/HeroStats.tsx` (renders `verdict.hero` as 5 solid high-contrast tiles, color by tile `severity`; FPS tile shows "no framerate logged" when source is none), `src/ui/FindingsList.tsx` (Easy-mode findings with one-line fixes).
- [ ] Test: renders 5 tiles from a sample verdict; a `bad` GPU-temp tile gets the bad color class; missing-FPS path shows the fallback copy. Implement → PASS → commit.

### Task 7.6: SpecsCard (editable, persisted)
- `src/ui/SpecsCard.tsx` + `src/storage/specsStore.ts` (localStorage). Pre-fills from `log.specs` (the inference), lets the user edit CPU/GPU/RAM strings, persists, and feeds the digest's specs block.
- [ ] Test: edits persist via a mocked `localStorage`; pre-fill comes from inferred specs. Implement → PASS → commit.

### Task 7.7: DigestPanel (the signature feature)
- `src/ui/DigestPanel.tsx`: compact/full toggle, editable goal `<textarea>` (default "help me lower temps without losing FPS"), live token-estimate, and a "Copy prompt for my LLM" button using `navigator.clipboard.writeText`. Rebuilds the digest when specs/goal/mode change.
- [ ] Test: clicking Copy writes the current digest (mock clipboard); switching compact↔full changes the shown token estimate; editing the goal updates the digest text. Implement → PASS → commit.

### Task 7.8: NerdView + app assembly
- `src/ui/NerdView.tsx` (full per-sensor stats table, Presented vs Displayed FPS, effective vs core clocks, raw flag counts, dual-GPU breakdown; uPlot timelines with event markers — a basic timeline is enough for v1), and `src/App.tsx` wiring: DropZone → useAnalysis → TopBar + (Easy: HeroVerdict + HeroStats + FindingsList + DigestPanel + SpecsCard) / (Nerd: + NerdView). A `CompareToggle` is rendered but disabled with a "coming soon" tooltip (compare is v2).
- [ ] Test: with a stubbed `AnalysisResult`, Easy mode shows hero+findings+digest; toggling to Nerd reveals the stats table; toggling back hides it. Implement → PASS → commit.

### Task 7.9: Build & manual acceptance
- [ ] **Step 1:** `npm run build` — TypeScript + Vite succeed; `dist/` produced.
- [ ] **Step 2:** `npm run preview`, then manually load **each** of the 12 sample logs; confirm 5 hero numbers, a sensible verdict, the four detection groups firing where warranted, and a clean copied digest (the `-65`/`-25UV` undervolt logs should read cooler/healthier than stock).
- [ ] **Step 3:** In DevTools, confirm the Network tab is empty after load (no uploads) and that only `localStorage` is written.
- [ ] **Step 4: Commit** — `feat(ui): complete v1 diagnose + copy-prompt UI`.

---

## Definition of done (v1) — acceptance checklist

- [ ] `npm run test` fully green, including the golden tests on real logs.
- [ ] All 12 sample logs load with no errors and no `NaN`/invented numbers.
- [ ] Five hero numbers, a traffic-light verdict + matching mascot mood, all four detection groups.
- [ ] Copy-prompt yields a compact digest (percentiles + plain-English events + editable goal, FPS source labeled, token-efficient); Full toggle works; never dumps raw CSV.
- [ ] Easy/Nerd toggle works; "no framerate logged" path is graceful.
- [ ] `npm run build` produces static files; no network calls at runtime; only `localStorage` persistence.

---

## v2 Roadmap (next plans, post-v1)

Each becomes its own brainstorm → spec → plan cycle. **Re-shaped 2026-06-10** (session history
folded into #1; share link / Tauri / live-tail demoted to stretch). Priority order:

1. **Before/after comparison + lightweight session history** — auto-saved runs in localStorage
   (named/timestamped/deletable, 20-run cap); pick any two; plain-language diff engine
   ("avg GPU temp −6°C, avg FPS +2, throttle 12→0"); tiered diff (Easy side-by-side hero deltas /
   Nerd full delta table); stacked BEFORE/AFTER compare digest; warn-but-allow mismatch guardrails.
   → Design spec: [`specs/2026-06-10-wtfps-before-after-compare-design.md`](../specs/2026-06-10-wtfps-before-after-compare-design.md).
   *(Originally items #1 + #6; merged because both rest on one localStorage "saved run" foundation.)*
2. **Interactive timelines & windowing** — uPlot timelines with event markers; brush-to-select a window and recompute stats; auto-segment idle/load/benchmark phases. (Needs raw samples — does not read from saved runs, which only hold summary stats.)
3. **Deeper diagnostics** — frame-pacing/micro-stutter (frame-time variance, GPU-busy vs CPU-busy, animation error); VRM/mem-junction/drive temps; fan-vs-temp; per-core detail; confidence levels.
4. **Specs & normalization breadth** — optional HWiNFO report-file parsing; broaden the registry (desktop Ryzen/Intel, Radeon dGPU, Arc); small reference DB of expected temp ranges.
5. **Digest & profiles** — goal presets; multiple LLM output profiles; local HTML/PNG report card.
6. **Packaging & a11y** — PWA/offline; full a11y pass.

**Stretch / maybe-later:** Tauri Windows app · live mode tailing a running HWiNFO CSV ·
privacy-preserving share link (compact digest encoded in URL). Richer history management (search,
tags, pinning, bulk ops) is a later polish pass on item #1.

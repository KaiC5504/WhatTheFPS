# WTFPS v2 #5 — Digest Goal Presets, LLM Output Profiles & HTML Report Card Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the user shape the LLM digest for its destination — three output profiles (Detailed / Terse / Forum post) rendered by one parameterized renderer, one-click goal presets above the goal textarea, and a downloadable, fully self-contained HTML report card that opens offline in any browser.

**Architecture:** `src/digest/digest.ts` keeps its single `render()` function but takes a `DigestProfile` (new `src/digest/profiles.ts`) instead of the binary `DigestMode` — each profile toggles the digest's real blocks (extra sensors, evidence tags, worst moments, guidance, context) and picks plain vs markdown formatting. `Digest.compact` keeps today's compact rendering byte-for-byte; `Digest.full` becomes "the active profile's text" and the default `detailed` profile reproduces today's full output byte-for-byte. Goal presets are pure data (`src/digest/goals.ts`) rendered as chips in `DigestPanel`. A new `src/export/` layer builds the report-card HTML string (`reportCard.ts`) and triggers the browser download (`download.ts`); colors/fonts are snapshotted from the live `theme.css` tokens at export time.

**Tech Stack:** TypeScript 5 strict, React 18, Vitest (digest tests run under node; `src/export/**` and `src/ui/**` under jsdom). **No new dependencies.**

**Baseline:** This plan assumes WTFPS v2 plans #1–#4 are merged. The only v2 contract it extends is plan #1's `src/digest/compareDigest.ts` with signature `buildCompareDigest(before: SavedRun, after: SavedRun, comparison: Comparison, opts?: { goal?: string }): Digest`. **That file may not exist in the working tree yet — plan #1 creates it.** Task 6 therefore writes the compare modification against the signature above and guards on file existence; everything else this plan touches exists today. There is no separate design spec for this item — the Design decisions section below is the spec.

**Out of scope:** PNG/image export (see Design decision 6), a report card for *comparisons* (Future note in Task 6), user-defined custom profiles, any change to the analysis engine, verdict, or `analyze()` signature.

---

## Design decisions

**1. One renderer, profile-parameterized — no separate render functions.**
`digest.ts` already renders everything through one `render(mode, …)` function; forking it per profile would triple the byte-compat surface. Instead a `DigestProfile` (new `src/digest/profiles.ts`) carries flags named after the digest's *actual* blocks, discovered by reading `render()`:

| Real block in `digest.ts` | Profile flag that gates it |
|---|---|
| `FULL_EXTRA_SENSORS` lines + `- FPS split:` line + `frameTimesLine` + `vramLine` (everything currently gated `mode === 'full'`) | `extraSensors` |
| `[measured]`/`[inferred]` tags on events, `timeSplitLine`, `worstBlock` | `includeEvidenceTags` |
| `worstBlock` ("Worst moments:") | `includeWorst` |
| `guidanceBlock` ("Missing data that would sharpen this:") | `includeGuidance` |
| `contextBlock` ("Context (fill in for better advice):") | `includeContext` |
| heading style + header line | `format: 'plain' \| 'markdown'` |
| the closing `Goal: …` line | `framing(goal)` |

Blocks that are *always* rendered (specs, compact sensors, FPS line, coverage, time split, detected events + cleared negatives) stay unconditional in every profile. One extra field beyond the obvious flags: `headerLabel` — the pre-profile header literally reads `HWiNFO session summary (full):`, and back-compat (decision 2) pins that byte, so the `detailed` profile must carry `headerLabel: 'full'` rather than `'detailed'`.

`DigestProfileId = 'detailed' | 'terse' | 'forum'` lives in `src/types.ts` (the cross-module contract — `Digest` gains `profileId: DigestProfileId`) and is re-exported from `profiles.ts` so digest-side imports stay local.

**2. Back-compat is pinned FIRST.**
Task 1 — before any refactor — freezes the current compact **and** full output as inline snapshots for two fixtures (the existing simple one, plus a rich one exercising every block). The refactor must then keep `Digest { compact, full, tokenEstimate, fpsSourceLabel }` byte-for-byte: `buildDigest(input)` with no opts ≡ today, `'detailed'` ≡ today's full, and `Digest.compact` is *always* the legacy compact rendering regardless of profile (an internal `COMPACT_RENDER` profile in `digest.ts`; compare digests and existing tests rely on it even though the panel no longer shows it). New signature: `buildDigest(input, opts?: { profile?: DigestProfileId })`, default `'detailed'`. `DigestMode` stays in `types.ts` — `tokenEstimate` keeps its `compact`/`full` keys.

**3. Profile semantics.**
`terse` drops evidence tags, worst moments, guidance, context, and the extra sensors — what remains is specs, compact sensors, FPS, coverage, time split, events, goal — and must come out ≥30% shorter than `detailed` on the rich fixture (asserted). `forum` is written for a human Reddit/forum reader, not an LLM: markdown `#`/`##` headings, no `[measured]` jargon tags, no fill-in-the-blanks context stub, worst moments kept (the interesting part of a help post), and a human sign-off (`**What I'm trying to do:** …`) instead of `Goal: …`.

**4. Goal presets are data, not logic.**
`src/digest/goals.ts` exports `GOAL_PRESETS: { label: string; goal: string }[]` — lower temps / more FPS / fix stutter / quieter fans / diagnose a crash. The crash preset includes "look for power or thermal events just before the log ends" so the LLM looks at the right end of the log. The first preset's text equals `DigestPanel`'s `DEFAULT_GOAL`, so the panel opens with one chip already active. Chips set the textarea value; the textarea stays freely editable; a chip shows active only while the textarea text exactly matches its goal (`aria-pressed`).

**5. DigestPanel migration: profile chips REPLACE the Compact/Full toggle.**
This changes a tested surface — `DigestPanel.test.tsx`'s copy-prompt and Full-toggle tests assert the old behavior, and Task 4 migrates them explicitly (copy now copies the active profile's text, i.e. `digest.full`; the token estimate shows `tokenEstimate.full` and changes per profile). The engine `DigestMode` type is untouched.

**6. HTML report card IN, PNG OUT.**
A DOM-screenshot PNG needs an html2canvas-class dependency (~150 KB) in a zero-dependency-pride app, fights web-font and CORS/canvas-taint issues, and duplicates what an OS screenshot already does. A self-contained HTML file keeps selectable text, zero deps, and prints fine. `src/export/reportCard.ts` → `buildReportCard(input: { result: AnalysisResult; specs: InferredSpecs; goal: string }): string` returns ONE self-contained HTML string: no `<script>`, no external URLs/fonts (font stacks degrade to system faces offline). Its inline `<style>` declares a `:root { --… }` block whose ~15 color/font values are snapshotted from the live tokens via `getComputedStyle(document.documentElement)` at export time — `theme.css` stays the single source of truth, satisfying DESIGN.md's token rule; a literal fallback table only guards against a missing token emitting an empty CSS value. Layout metrics (paddings, font sizes) are local literals — the artifact is not component CSS and is not bound by the `var(--…)`-only rule, but every *color and font* is. Contents: headline + mascot mood as text, hero tiles, findings, time split, worst moments, the detailed digest in `<pre>`, generated-by footer with date. `src/export/download.ts` → `downloadText(filename, mime, text)` is a tiny Blob+anchor helper kept separate so UI tests can mock it. Filename: `wtfps-report-<yyyy-mm-dd>.html`.

**7. Compare-aware — honestly limited.**
`buildCompareDigest` opts gain `profile?: DigestProfileId`. But plan #1 persists saved runs as `SlimResult` with *already-rendered* digest strings — a saved run **cannot be re-rendered under a different profile**, because only the text was stored. So the profile affects only what `buildCompareDigest` renders fresh: its delta-summary block follows the profile's `format` (markdown headings for `forum`), and the stored BEFORE/AFTER digest blocks are embedded exactly as stored. The returned `Digest.profileId` reflects the chosen profile. A compare *report card* is deferred (Future note).

---

## File map

| File | Action | Responsibility |
|---|---|---|
| `src/digest/digest.test.ts` | modify | Task 1 back-compat pins; profile behavior tests |
| `src/types.ts` | modify | `DigestProfileId`; `Digest.profileId` |
| `src/digest/profiles.ts` | create | `DigestProfile` + `PROFILES` table |
| `src/digest/digest.ts` | modify | Profile-parameterized `render()`; export `LIMITER_LABEL` |
| `src/digest/goals.ts` | create | `GOAL_PRESETS` data |
| `src/digest/goals.test.ts` | create | Preset wording pins |
| `src/ui/DigestPanel.tsx` | modify | Preset chips, profile chips, download button |
| `src/ui/DigestPanel.test.tsx` | modify | Chip RTL tests; migrate toggle/copy assertions |
| `src/ui/DigestPanel.css` | modify | Chip + footer-actions styles (tokens only) |
| `src/export/reportCard.ts` | create | Self-contained HTML report card |
| `src/export/reportCard.test.ts` | create | Self-containment, token snapshot, escaping |
| `src/export/download.ts` | create | `downloadText` Blob+anchor helper |
| `src/export/download.test.ts` | create | Blob type, filename, revoke |
| `vitest.config.ts` | modify | `src/export/**` → jsdom |
| `src/digest/compareDigest.ts` | modify (if present) | `opts.profile` pass-through (plan #1 file) |
| `src/digest/compareDigest.test.ts` | modify (if present) | Pass-through test |

Run all tests with `npm run test`; single file with `npx vitest src/digest/digest.test.ts`. Typecheck via `npm run build`.

---

### Task 1: Pin the pre-profile digest output

**Files:**
- Modify: `src/digest/digest.test.ts`

This task intentionally deviates from fail-first TDD: it freezes *current* behavior so the Task 2 refactor cannot drift a byte. The existing test `'produces a stable compact digest'` already pins compact for the simple fixture; this task adds the full pin and a rich fixture that exercises every block the profiles will later toggle.

- [ ] **Step 1: Hoist a rich fixture and add the pin tests**

Append to `src/digest/digest.test.ts`, at file scope (after `sampleResult`) so later tasks reuse it. It reuses the file's existing `statsFor` helper and imports (`makeLog`, `makeWindow`, `makeWindowAnalysis`, `makeEvent`, `computeStats`):

```ts
// Exercises every digest block: extra sensors, FPS split, frame times, VRAM,
// coverage, time split, worst moments, evidence tags, guidance, cap context.
function richResult() {
  const wa = makeWindowAnalysis([
    makeWindow(0, { limiter: 'gpu', metrics: { fpsAvg: 100, frameTimeMs: 10, gpuBusyMs: 9.6, gpuUsage: 99 } }),
    makeWindow(1, { limiter: 'gpu', metrics: { fpsAvg: 100, frameTimeMs: 10, gpuBusyMs: 9.6, gpuUsage: 99 } }),
    makeWindow(2, { limiter: 'cpu', tier: 'measured', metrics: { fpsAvg: 55, frameTimeMs: 18, gpuBusyMs: 11, cpuMaxThread: 97 } }),
    makeWindow(3, { limiter: 'gpu', metrics: { fpsAvg: 60, frameTimeMs: 16, gpuUsage: 99 } }),
  ]);
  const sensors = {
    'cpu.tempPackage': [70, 72, 71, 73, 74],
    'cpu.usageTotal': [40, 42, 41, 43, 44],
    'gpu.temp': [80, 82, 81, 83, 84],
    'gpu.clock': [2600, 2610, 2605, 2615, 2620],
    'gpu.usage': [95, 96, 97, 96, 98],
    'gpu.power': [140, 150, 145, 155, 160],
    'cpu.power': [45, 55, 50, 60, 65],
    'gpu.coreVoltage': [0.875, 0.9, 0.88, 0.92, 0.91],
    'cpu.coreVoltage': [1.15, 1.2, 1.18, 1.22, 1.25],
    'fan.cpuRpm': [3200, 3400, 3300, 3500, 3600],
    'fan.gpuRpm': [2800, 2900, 2850, 2950, 3000],
    'pm.frameTimeMs': [10, 10, 18, 16, 10],
    'vram.allocatedMb': [7900, 7900, 7900, 7900, 7900],
    'vram.availableMb': [292, 292, 292, 292, 292],
    'vram.d3dDedicatedMb': [7000, 7100, 7200, 7100, 7000],
  };
  const log = makeLog({
    sensors,
    flags: { 'flag.cpu.thermalThrottle': [false, false, false, false, false] },
    fps: {
      source: 'displayed',
      sourceLabel: 'Framerate Displayed (avg)',
      stats: computeStats([100, 100, 55, 60, 100]),
      displayedAvg: 83,
      presentedAvg: 85,
      capped: true,
      capValue: 100,
      series: [100, 100, 55, 60, 100],
      presented1PctLow: 48,
    },
  });
  log.specs = { ...log.specs, cpuVendor: 'intel', cpuModelGuess: 'Intel hybrid (6P+8E)', gpuVendor: 'nvidia', gpuModelGuess: 'NVIDIA dGPU', ramMb: 32768 };
  const events = [
    makeEvent({ type: 'gpu-bound', severity: 'warn', sentence: 'GPU-bound for most of the session.', sampleCount: 4, evidence: { tier: 'measured', basis: ['pm'] } }),
  ];
  const guidance = [
    { what: 'per-core CPU usage', how: 'enable per-core sensors in HWiNFO' },
    { what: 'RTSS frame times', how: 'run RTSS alongside HWiNFO' },
  ];
  return { log, stats: statsFor(sensors), events, windows: wa, guidance };
}

describe('pre-profile output pin', () => {
  it('freezes the full digest for the simple fixture', () => {
    const d = buildDigest(sampleResult());
    expect(d.full).toMatchInlineSnapshot();
  });

  it('freezes compact and full for the rich fixture', () => {
    const d = buildDigest(richResult());
    expect(d.compact).toMatchInlineSnapshot();
    expect(d.full).toMatchInlineSnapshot();
  });
});
```

- [ ] **Step 2: Fill the snapshots**

Run: `npx vitest run src/digest/digest.test.ts` — vitest writes the empty inline snapshots into the file on first run. Review the filled snapshots before accepting; each must contain:
- `HWiNFO session summary (full):` header (full pins) / `(compact)` (compact pin)
- the rich full pin: `FPS split: presented avg 85, displayed avg 83 (capped ~100)`, `Frame times (PresentMon):`, `session-wide per-frame 1% low 48 FPS`, `VRAM: D3D dedicated p95`, `Coverage: analyzed`, `Time split (gameplay only):`, `Worst moments:`, `[measured]`, `Checked, not detected: CPU thermal throttle`, `Missing data that would sharpen this:`, `FPS cap source (in-game / RTSS / VSync): cap measured at ~100 — intended?`, `GPU core voltage: avg 0.897 V`, `Goal: help me lower temps without losing FPS`
- the rich compact pin: NO `FPS split`, NO `core voltage`, NO `Frame times`, NO `VRAM:` — but YES coverage/time split/worst/guidance/context.

If any marker is missing, the fixture is wrong — fix the fixture, not the snapshot.

- [ ] **Step 3: Verify stable**

Run: `npx vitest run src/digest/digest.test.ts` again (no `-u`) → PASS, snapshots stable.

- [ ] **Step 4: Commit**

```bash
git add src/digest/digest.test.ts
git commit -m "test(digest): pin pre-profile output"
```

---

### Task 2: `profiles.ts` + profile-parameterized renderer

**Files:**
- Modify: `src/types.ts`
- Create: `src/digest/profiles.ts`
- Modify: `src/digest/digest.ts`
- Modify: `src/digest/digest.test.ts`
- Modify (only if it exists): `src/digest/compareDigest.ts` — mechanical compile fix

- [ ] **Step 1: Write failing tests** (append to `src/digest/digest.test.ts`; add `import { PROFILES } from './profiles';` to the imports)

```ts
describe('profiles', () => {
  it('detailed is the default and matches the pinned full output byte-for-byte', () => {
    const def = buildDigest(sampleResult());
    const detailed = buildDigest(sampleResult(), { profile: 'detailed' });
    expect(detailed.full).toBe(def.full);
    expect(detailed.compact).toBe(def.compact);
    expect(def.profileId).toBe('detailed');
  });

  it('terse drops evidence tags, worst, guidance, context, extra sensors — and is ≥30% shorter', () => {
    const detailed = buildDigest(richResult(), { profile: 'detailed' });
    const terse = buildDigest(richResult(), { profile: 'terse' });
    expect(terse.profileId).toBe('terse');
    expect(terse.full).toContain('HWiNFO session summary (terse):');
    expect(terse.full).not.toMatch(/\[measured\]|\[inferred\]/);
    expect(terse.full).not.toMatch(/Worst moments/);
    expect(terse.full).not.toMatch(/Missing data/);
    expect(terse.full).not.toMatch(/Context \(fill in/);
    expect(terse.full).not.toMatch(/core voltage|FPS split|Frame times|VRAM:/);
    // what survives: specs, compact sensors, FPS, coverage, time split, events, goal
    expect(terse.full).toMatch(/Time split \(gameplay only\):/);
    expect(terse.full).toMatch(/Detected events:/);
    expect(terse.full).toMatch(/Goal: /);
    expect(terse.full.length).toBeLessThanOrEqual(detailed.full.length * 0.7);
  });

  it('forum renders markdown headings and human framing instead of an LLM goal line', () => {
    const d = buildDigest(richResult(), { profile: 'forum' });
    expect(d.profileId).toBe('forum');
    expect(d.full).toMatch(/^# HWiNFO session summary$/m);
    expect(d.full).toMatch(/^## Sensors$/m);
    expect(d.full).toMatch(/^## Detected events$/m);
    expect(d.full).toMatch(/^## Worst moments$/m);
    expect(d.full).not.toMatch(/^Goal: /m);
    expect(d.full).not.toMatch(/\[measured\]|\[inferred\]/);
    expect(d.full).toContain("What I'm trying to do:");
  });

  it('compact stays the legacy compact rendering regardless of profile', () => {
    const a = buildDigest(richResult(), { profile: 'forum' });
    const b = buildDigest(richResult());
    expect(a.compact).toBe(b.compact);
  });

  it('PROFILES table covers exactly the three ids with UI labels', () => {
    expect(Object.keys(PROFILES).sort()).toEqual(['detailed', 'forum', 'terse']);
    expect(PROFILES.detailed.label).toBe('Detailed');
    expect(PROFILES.terse.label).toBe('Terse');
    expect(PROFILES.forum.label).toBe('Forum post');
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest src/digest/digest.test.ts` → new tests FAIL (no `./profiles` module; `buildDigest` ignores the second argument).

- [ ] **Step 3: Add the contract to `src/types.ts`**

Replace:

```ts
export type DigestMode = 'compact' | 'full';
export interface Digest { compact: string; full: string; tokenEstimate: Record<DigestMode, number>; fpsSourceLabel: string; }
```

with:

```ts
export type DigestMode = 'compact' | 'full';
export type DigestProfileId = 'detailed' | 'terse' | 'forum';
export interface Digest {
  compact: string;                       // legacy compact rendering, profile-independent
  full: string;                          // active-profile rendering ('detailed' ≡ pre-profile full)
  profileId: DigestProfileId;
  tokenEstimate: Record<DigestMode, number>;
  fpsSourceLabel: string;
}
```

- [ ] **Step 4: Create `src/digest/profiles.ts`**

```ts
import type { DigestProfileId } from '../types';

export type { DigestProfileId } from '../types';

// One renderer, parameterized — a profile picks blocks, not a separate render
// function. Flags are named after the digest's actual sections (see render()
// in digest.ts).
export interface DigestProfile {
  id: DigestProfileId;
  label: string;                      // chip text in DigestPanel
  headerLabel: string;                // plain-format header suffix
  extraSensors: boolean;              // FULL_EXTRA_SENSORS + FPS split + frame-time/VRAM lines
  includeEvidenceTags: boolean;       // [measured]/[inferred] on events, time split, worst moments
  includeWorst: boolean;              // 'Worst moments' block
  includeGuidance: boolean;           // 'Missing data that would sharpen this' block
  includeContext: boolean;            // 'Context (fill in for better advice)' block
  format: 'plain' | 'markdown';
  framing: (goal: string) => string;  // closing lines: LLM goal vs human sign-off
}

export const PROFILES: Record<DigestProfileId, DigestProfile> = {
  detailed: {
    id: 'detailed',
    label: 'Detailed',
    // 'full', not 'detailed': keeps the output byte-for-byte with the
    // pre-profile full digest (pinned in digest.test.ts).
    headerLabel: 'full',
    extraSensors: true,
    includeEvidenceTags: true,
    includeWorst: true,
    includeGuidance: true,
    includeContext: true,
    format: 'plain',
    framing: (goal) => `Goal: ${goal}`,
  },
  terse: {
    id: 'terse',
    label: 'Terse',
    headerLabel: 'terse',
    extraSensors: false,
    includeEvidenceTags: false,
    includeWorst: false,
    includeGuidance: false,
    includeContext: false,
    format: 'plain',
    framing: (goal) => `Goal: ${goal}`,
  },
  forum: {
    id: 'forum',
    label: 'Forum post',
    headerLabel: 'forum',
    extraSensors: false,
    includeEvidenceTags: false,
    includeWorst: true,
    includeGuidance: false,
    includeContext: false,
    format: 'markdown',
    framing: (goal) =>
      `**What I'm trying to do:** ${goal}\n\nAny pointers appreciated — happy to log more sensors if something is missing.`,
  },
};
```

- [ ] **Step 5: Refactor `src/digest/digest.ts`**

Replace the whole file with the version below. It is the current file with: a `Heading` formatter threaded into every block that owns a section heading, evidence tags made conditional, the `mode === 'full'` gates renamed to `profile.extraSensors`, block gates for worst/guidance/context, `LIMITER_LABEL` exported (the report card reuses it in Task 5), and the new `buildDigest` signature. Nothing else about any line's text changes — the Task 1 pins enforce that.

```ts
import type {
  NormalizedLog, CanonicalKey, FlagKey, Stats, DiagEvent,
  Digest, DigestMode, DigestProfileId, InferredSpecs,
  WindowAnalysis, SensorGuidance, Limiter, EvidenceTier,
} from '../types';
import { FLAG_LABELS } from '../windows/snapshot';
import { PROFILES, type DigestProfile } from './profiles';

const DEFAULT_GOAL = 'help me lower temps without losing FPS';

// Section headings render as 'Title:' (plain) or '## Title' (markdown).
type Heading = (title: string) => string;

function n(x: number): string {
  return Number.isInteger(x) ? String(x) : x.toFixed(1);
}

interface SensorLine {
  key: CanonicalKey;
  label: string;
  unit: string;
  kind: 'level' | 'usage'; // level → avg/p95/p99/max; usage → avg/p1/p5 lows
  digits?: number;         // fixed decimal places (voltages need mV precision)
}

// Compact set: the sensors a tuning conversation usually needs first.
const COMPACT_SENSORS: SensorLine[] = [
  { key: 'cpu.tempPackage', label: 'CPU temp', unit: '°C', kind: 'level' },
  { key: 'cpu.tempCoreMax', label: 'CPU core temp (max)', unit: '°C', kind: 'level' },
  { key: 'gpu.temp', label: 'GPU temp', unit: '°C', kind: 'level' },
  { key: 'gpu.hotspot', label: 'GPU hotspot', unit: '°C', kind: 'level' },
  { key: 'gpu.clock', label: 'GPU clock', unit: 'MHz', kind: 'level' },
  { key: 'fan.cpuRpm', label: 'CPU fan', unit: 'RPM', kind: 'level', digits: 0 },
  { key: 'fan.gpuRpm', label: 'GPU fan', unit: 'RPM', kind: 'level', digits: 0 },
  { key: 'cpu.usageTotal', label: 'CPU usage', unit: '%', kind: 'usage' },
  { key: 'gpu.usage', label: 'GPU usage', unit: '%', kind: 'usage' },
];

// Extra set: everything in compact plus the lower-level detail.
const FULL_EXTRA_SENSORS: SensorLine[] = [
  { key: 'cpu.clock', label: 'CPU clock', unit: 'MHz', kind: 'level' },
  { key: 'gpu.memJunction', label: 'GPU mem junction', unit: '°C', kind: 'level' },
  { key: 'gpu.power', label: 'GPU power', unit: 'W', kind: 'level' },
  { key: 'cpu.power', label: 'CPU power', unit: 'W', kind: 'level' },
  { key: 'gpu.coreVoltage', label: 'GPU core voltage', unit: 'V', kind: 'level', digits: 3 },
  { key: 'cpu.coreVoltage', label: 'CPU core voltage', unit: 'V', kind: 'level', digits: 3 },
  { key: 'gpu.memUsagePct', label: 'GPU mem usage', unit: '%', kind: 'usage' },
  { key: 'ram.loadPct', label: 'RAM load', unit: '%', kind: 'usage' },
  { key: 'cpu.usageCoreMax', label: 'CPU core usage (max)', unit: '%', kind: 'usage' },
];

function sensorLine(def: SensorLine, stats: Partial<Record<CanonicalKey, Stats>>): string | null {
  const s = stats[def.key];
  if (!s || s.count === 0) return null;
  const u = def.unit === '%' ? '%' : ` ${def.unit}`;
  const f = (x: number) => (def.digits !== undefined ? x.toFixed(def.digits) : n(x));
  if (def.kind === 'level') {
    return `- ${def.label}: avg ${f(s.avg)}${u}, p95 ${f(s.p95)}${u}, p99 ${f(s.p99)}${u}, max ${f(s.max)}${u}`;
  }
  return `- ${def.label}: avg ${f(s.avg)}${u}, 1% low ${f(s.p1Low)}${u}, 5% low ${f(s.p5Low)}${u}`;
}

function fpsLine(log: NormalizedLog): string {
  if (log.fps.source === 'none' || log.fps.stats === null) return '- FPS: no framerate logged';
  const label = log.fps.sourceLabel || log.fps.source;
  const s = log.fps.stats;
  return `- FPS (source: ${label}): avg ${n(s.avg)}, 1% low ${n(s.p1Low)}, 5% low ${n(s.p5Low)}`;
}

function specsBlock(specs: InferredSpecs, h: Heading): string {
  const kit = specs.ramModelGuess
    ? ` (${specs.ramModelGuess}${specs.ramModules ? ` ×${specs.ramModules}` : ''})`
    : '';
  const ram = specs.ramMb !== null ? `${Math.round(specs.ramMb / 1024)} GB${kit}` : 'unknown';
  const cpu = specs.cpuModelGuess ?? specs.cpuVendor;
  const gpu = specs.gpuModelGuess ?? specs.gpuVendor;
  const form = specs.isLaptop ? 'laptop' : 'desktop';
  const lines = [h('System (inferred, edit if wrong)')];
  if (specs.systemModel) lines.push(`- Machine: ${specs.systemModel}`);
  lines.push(`- CPU: ${cpu}`);
  lines.push(`- GPU: ${gpu}`);
  if (specs.igpuPresent && specs.igpuModelGuess) lines.push(`- iGPU: ${specs.igpuModelGuess}`);
  lines.push(`- RAM: ${ram}`);
  lines.push(`- Form factor: ${form}`);
  return lines.join('\n');
}

// Health flags worth reporting as explicit negatives (perfLimitUtil is a limiter
// classifier, not a health signal, so it stays out of this list).
const NEGATIVE_FLAGS: FlagKey[] = [
  'flag.cpu.thermalThrottle', 'flag.cpu.prochot', 'flag.cpu.ratl', 'flag.cpu.powerLimit',
  'flag.gpu.perfLimitThermal', 'flag.gpu.perfLimitPower', 'flag.gpu.perfLimitCurrent',
  'flag.gpu.perfLimitVRel', 'flag.gpu.perfLimitVOp',
];

function eventsBlock(events: DiagEvent[], log: NormalizedLog, h: Heading, tags: boolean): string {
  const lines = events.length === 0
    ? ['- none — nothing notable flagged.']
    : events.map((e) => `- [${e.severity}]${tags && e.evidence ? ` ${TIER_TAG[e.evidence.tier]}` : ''} ${e.sentence}`);
  // "Not detected" only counts when the flag was actually in the log; absent columns
  // stay silent (the guidance block covers what wasn't logged).
  const cleared = NEGATIVE_FLAGS
    .filter((k) => log.flags[k] !== undefined && !log.flags[k]!.values.some(Boolean))
    .map((k) => FLAG_LABELS[k]);
  if (cleared.length > 0) lines.push(`- Checked, not detected: ${cleared.join(', ')}`);
  return [h('Detected events'), ...lines].join('\n');
}

function contextBlock(log: NormalizedLog, h: Heading): string {
  const lines = [h('Context (fill in for better advice)'), '- Game, settings & resolution:'];
  if (log.fps.capped && log.fps.capValue !== null) {
    lines.push(`- FPS cap source (in-game / RTSS / VSync): cap measured at ~${n(log.fps.capValue)} — intended?`);
  }
  lines.push('- Power profile & cooling (performance mode, cooling pad, plugged in):');
  return lines.join('\n');
}

const TIER_TAG: Record<EvidenceTier, string> = { measured: '[measured]', inferred: '[inferred]' };
export const LIMITER_LABEL: Record<Limiter, string> = {
  gpu: 'GPU-bound', cpu: 'CPU-bound', capped: 'capped', underutilized: 'GPU-underutilized',
  ambiguous: 'ambiguous', unknown: 'unclassified',
};

const mins = (ms: number) => (ms / 60_000).toFixed(1);

function coverageLine(wa: WindowAnalysis): string | null {
  if (wa.timeSplit.gameplayMs <= 0) return null;
  const word = wa.activityKind === 'gameplay' ? 'gameplay' : 'active workload';
  let line = `Coverage: analyzed ${mins(wa.timeSplit.gameplayMs)} min of ${word} out of ${mins(wa.timeSplit.totalMs)} min logged (${Math.round(wa.windowMs / 1000)} s windows${wa.lowConfidence ? ', low confidence — short log' : ''})`;
  // When logging paused (sleep, HWiNFO paused), summed window time undershoots the
  // wall-clock span and worst-moment offsets look like they exceed the log length.
  const first = wa.windows[0], last = wa.windows[wa.windows.length - 1];
  if (first && last) {
    const spanMs = last.window.endMs - first.window.startMs;
    const gapMs = spanMs - wa.timeSplit.totalMs;
    if (gapMs > 60_000 && gapMs > 0.02 * spanMs) {
      line += `; log spans ${mins(spanMs)} min wall-clock (~${mins(gapMs)} min of logging gaps) — time offsets count from log start`;
    }
  }
  return line;
}

function timeSplitLine(wa: WindowAnalysis, tags: boolean): string | null {
  if (wa.timeSplit.gameplayMs <= 0) return null;
  const word = wa.activityKind === 'gameplay' ? 'gameplay' : 'workload';
  const parts = (Object.entries(wa.timeSplit.shares) as [Limiter, number][])
    .filter(([, v]) => v >= 0.005)
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => {
      const ws = wa.windows.filter((w) => w.activity === 'gameplay' && w.limiter === k);
      // majority rule: tag measured only when ≥50% of this limiter's windows have measured-tier coverage
      const measured = ws.length > 0 && ws.filter((w) => w.tier === 'measured').length * 2 >= ws.length;
      const tag = tags && ws.some((w) => w.tier !== null) ? ` ${TIER_TAG[measured ? 'measured' : 'inferred']}` : '';
      return `${LIMITER_LABEL[k]} ${Math.round(v * 100)}%${tag}`;
    });
  return parts.length ? `Time split (${word} only): ${parts.join(', ')}` : null;
}

function frameTimesLine(log: NormalizedLog, stats: Partial<Record<CanonicalKey, Stats>>): string | null {
  const ft = stats['pm.frameTimeMs'];
  if (!ft || ft.count === 0) return null;
  const low = log.fps.presented1PctLow;
  // HWiNFO's PresentMon 1% low is cumulative over the whole session, so it can sit far
  // below the windowed FPS lows — label it so an LLM doesn't build a stutter story on it.
  return `Frame times (PresentMon): avg ${n(ft.avg)} ms, p99 ${n(ft.p99)} ms${low !== null ? `; session-wide per-frame 1% low ${n(low)} FPS (cumulative — includes loading/menus)` : ''}`;
}

function vramLine(log: NormalizedLog, stats: Partial<Record<CanonicalKey, Stats>>): string | null {
  const ded = stats['vram.d3dDedicatedMb'];
  if (!ded || ded.count === 0) return null;
  const alloc = log.sensors['vram.allocatedMb']?.values ?? [];
  const avail = log.sensors['vram.availableMb']?.values ?? [];
  let capacity = 0;
  for (let i = 0; i < Math.min(alloc.length, avail.length); i++) {
    const a = alloc[i], b = avail[i];
    if (a !== null && b !== null) capacity = Math.max(capacity, a + b);
  }
  if (capacity <= 0) return `VRAM: D3D dedicated p95 ${Math.round(ded.p95).toLocaleString('en-US')} MB`;
  const headroom = Math.max(0, Math.round(capacity - ded.p95));
  return `VRAM: D3D dedicated p95 ${Math.round(ded.p95).toLocaleString('en-US')} MB of ${Math.round(capacity).toLocaleString('en-US')} MB (~${headroom.toLocaleString('en-US')} MB headroom)`;
}

function worstBlock(wa: WindowAnalysis, logStartMs: number, h: Heading, tags: boolean): string | null {
  if (wa.worst.length === 0) return null;
  const lines = wa.worst.map((wm) => {
    const c = wm.classification;
    const offset = c.window.startMs - logStartMs;
    const mm = Math.floor(offset / 60_000);
    const ss = Math.round((offset % 60_000) / 1000);
    const snap = wm.snapshot.map((s) => `${s.label} ${s.value}${s.unit ? ` ${s.unit}` : ''}`).join(', ');
    const tag = tags && c.tier !== null ? ` ${TIER_TAG[c.tier]}` : '';
    return `- +${mm}m${String(ss).padStart(2, '0')}s: −${Math.round(wm.fpsDropPct)}% vs median (${LIMITER_LABEL[c.limiter]}) — ${snap}${tag}`;
  });
  return [h('Worst moments'), ...lines].join('\n');
}

function guidanceBlock(guidance: SensorGuidance[], h: Heading): string | null {
  if (guidance.length === 0) return null;
  return [h('Missing data that would sharpen this'), ...guidance.map((g) => `- ${g.what} — ${g.how}`)].join('\n');
}

// Digest.compact predates profiles; this internal rendering keeps it stable while
// Digest.full follows the active profile. id/label are never read for it.
const COMPACT_RENDER: DigestProfile = {
  id: 'detailed',
  label: 'Compact',
  headerLabel: 'compact',
  extraSensors: false,
  includeEvidenceTags: true,
  includeWorst: true,
  includeGuidance: true,
  includeContext: true,
  format: 'plain',
  framing: (goal) => `Goal: ${goal}`,
};

function render(
  p: DigestProfile,
  log: NormalizedLog,
  stats: Partial<Record<CanonicalKey, Stats>>,
  events: DiagEvent[],
  goal: string,
  windows: WindowAnalysis,
  guidance: SensorGuidance[],
): string {
  const h: Heading = (title) => (p.format === 'markdown' ? `## ${title}` : `${title}:`);
  const defs = p.extraSensors ? [...COMPACT_SENSORS, ...FULL_EXTRA_SENSORS] : COMPACT_SENSORS;
  const sensorLines = defs.map((d) => sensorLine(d, stats)).filter((l): l is string => l !== null);

  const parts: string[] = [];
  parts.push(p.format === 'markdown' ? '# HWiNFO session summary' : `HWiNFO session summary (${p.headerLabel}):`);
  parts.push('');
  parts.push(specsBlock(log.specs, h));
  parts.push('');
  parts.push(h('Sensors'));
  parts.push(...sensorLines);
  parts.push(fpsLine(log));

  if (p.extraSensors && log.fps.source !== 'none') {
    parts.push(
      `- FPS split: presented avg ${log.fps.presentedAvg !== null ? n(log.fps.presentedAvg) : 'n/a'}, displayed avg ${log.fps.displayedAvg !== null ? n(log.fps.displayedAvg) : 'n/a'}${log.fps.capped && log.fps.capValue !== null ? ` (capped ~${n(log.fps.capValue)})` : ''}`,
    );
  }

  const logStartMs = windows.windows.length > 0 ? windows.windows[0].window.startMs : 0;
  // coverage + time split in EVERY profile (they are the point of the digest);
  // frame-time + VRAM detail rides with the extra sensors.
  const evidence = [
    coverageLine(windows),
    timeSplitLine(windows, p.includeEvidenceTags),
    ...(p.extraSensors ? [frameTimesLine(log, stats), vramLine(log, stats)] : []),
  ].filter((l): l is string => l !== null);
  if (evidence.length) {
    parts.push('');
    parts.push(...evidence);
  }
  if (p.includeWorst) {
    const worst = worstBlock(windows, logStartMs, h, p.includeEvidenceTags);
    if (worst) { parts.push(''); parts.push(worst); }
  }

  parts.push('');
  parts.push(eventsBlock(events, log, h, p.includeEvidenceTags));

  if (p.includeGuidance) {
    const g = guidanceBlock(guidance, h);
    if (g) { parts.push(''); parts.push(g); }
  }

  if (p.includeContext) {
    parts.push('');
    parts.push(contextBlock(log, h));
  }

  parts.push('');
  parts.push(p.framing(goal));

  return parts.join('\n');
}

export function buildDigest(
  input: {
    log: NormalizedLog;
    stats: Partial<Record<CanonicalKey, Stats>>;
    events: DiagEvent[];
    windows: WindowAnalysis;
    guidance: SensorGuidance[];
    goal?: string;
  },
  opts?: { profile?: DigestProfileId },
): Digest {
  const goal = input.goal ?? DEFAULT_GOAL;
  const profile = PROFILES[opts?.profile ?? 'detailed'];
  const compact = render(COMPACT_RENDER, input.log, input.stats, input.events, goal, input.windows, input.guidance);
  const full = render(profile, input.log, input.stats, input.events, goal, input.windows, input.guidance);

  return {
    compact,
    full,
    profileId: profile.id,
    tokenEstimate: {
      compact: Math.ceil(compact.length / 4),
      full: Math.ceil(full.length / 4),
    } as Record<DigestMode, number>,
    fpsSourceLabel: input.log.fps.source === 'none' ? '' : input.log.fps.sourceLabel,
  };
}
```

- [ ] **Step 6: Mechanical compile fixes**

`Digest.profileId` is required, so every place that constructs a `Digest` literal must set it. `buildDigest` is covered above. If `src/digest/compareDigest.ts` exists (plan #1 merged), add `profileId: 'detailed',` to its returned `Digest` object — Task 6 makes it honor `opts.profile` properly. `npm run build` will flag any other literal (e.g. a UI test fixture); set `profileId: 'detailed'` there too.

- [ ] **Step 7: Run tests + typecheck**

Run: `npx vitest run src/digest/digest.test.ts` → ALL pass, including the Task 1 pins (byte-for-byte) and every pre-existing assertion. Then `npm run test` and `npm run build` → green (golden snapshots are unaffected because the default profile is byte-identical).

- [ ] **Step 8: Commit**

```bash
git add src/types.ts src/digest/profiles.ts src/digest/digest.ts src/digest/digest.test.ts
git commit -m "feat(digest): profile-parameterized renderer with detailed/terse/forum profiles"
```

(If `compareDigest.ts` got the compile fix, `git add src/digest/compareDigest.ts` too.)

---

### Task 3: `goals.ts` + goal preset chips in DigestPanel

**Files:**
- Create: `src/digest/goals.ts`
- Create: `src/digest/goals.test.ts`
- Modify: `src/ui/DigestPanel.tsx`
- Modify: `src/ui/DigestPanel.test.tsx`
- Modify: `src/ui/DigestPanel.css`

- [ ] **Step 1: Write failing tests**

`src/digest/goals.test.ts` (node env):

```ts
import { describe, it, expect } from 'vitest';
import { GOAL_PRESETS } from './goals';

describe('GOAL_PRESETS', () => {
  it('offers the five presets in display order', () => {
    expect(GOAL_PRESETS.map((p) => p.label)).toEqual([
      'Lower temps', 'More FPS', 'Fix stutter', 'Quieter fans', 'Diagnose a crash',
    ]);
  });

  it('first preset matches the panel default goal so one chip starts active', () => {
    expect(GOAL_PRESETS[0].goal).toBe('help me lower temps without losing FPS');
  });

  it('the crash preset points the LLM at the end of the log', () => {
    expect(GOAL_PRESETS[4].goal).toContain('look for power or thermal events just before the log ends');
  });
});
```

Append to `src/ui/DigestPanel.test.tsx` (jsdom; reuses the file's `result`/`specs` fixtures):

```tsx
describe('goal preset chips', () => {
  it('clicking a chip fills the textarea and the digest goal line', () => {
    render(<DigestPanel result={result} specs={specs} />);
    fireEvent.click(screen.getByRole('button', { name: 'More FPS' }));
    expect(screen.getByRole('textbox')).toHaveValue('help me get more FPS out of this machine');
    expect(document.querySelector('pre')?.textContent).toContain('help me get more FPS out of this machine');
  });

  it('a chip is active only while the textarea matches its goal exactly', () => {
    render(<DigestPanel result={result} specs={specs} />);
    const lower = screen.getByRole('button', { name: 'Lower temps' });
    expect(lower).toHaveAttribute('aria-pressed', 'true');   // default goal === first preset
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'my own goal' } });
    expect(lower).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(screen.getByRole('button', { name: 'Quieter fans' }));
    expect(screen.getByRole('button', { name: 'Quieter fans' })).toHaveAttribute('aria-pressed', 'true');
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest src/digest/goals.test.ts src/ui/DigestPanel.test.tsx` → FAIL (no `./goals` module; no chips in the DOM).

- [ ] **Step 3: Create `src/digest/goals.ts`**

```ts
export const GOAL_PRESETS: { label: string; goal: string }[] = [
  // First entry must equal DigestPanel's DEFAULT_GOAL so the panel opens with an active chip.
  { label: 'Lower temps', goal: 'help me lower temps without losing FPS' },
  { label: 'More FPS', goal: 'help me get more FPS out of this machine' },
  { label: 'Fix stutter', goal: 'help me find and fix the stutter in this session' },
  { label: 'Quieter fans', goal: 'help me make this machine quieter under load without overheating' },
  {
    label: 'Diagnose a crash',
    goal: 'the game crashed during this session — look for power or thermal events just before the log ends',
  },
];
```

- [ ] **Step 4: Render the chips in `src/ui/DigestPanel.tsx`**

Add imports:

```tsx
import { GOAL_PRESETS } from '../digest/goals';
import { cx } from './cx';
```

Insert between the goal `<label>` and the `<textarea>`:

```tsx
      <div className="digest-panel__presets" role="group" aria-label="Goal presets">
        {GOAL_PRESETS.map((p) => (
          <button
            key={p.label}
            type="button"
            aria-pressed={goal === p.goal}
            className={cx('digest-panel__chip', goal === p.goal && 'digest-panel__chip--active')}
            onClick={() => setGoal(p.goal)}
          >
            {p.label}
          </button>
        ))}
      </div>
```

- [ ] **Step 5: Chip styles in `src/ui/DigestPanel.css`** (tokens only, solid-tier surface, no glow — per DESIGN.md)

```css
.digest-panel__presets {
  display: flex;
  flex-wrap: wrap;
  gap: var(--s2);
}

.digest-panel__chip {
  font-family: var(--font-body);
  font-size: var(--text-xs);
  font-weight: 600;
  color: var(--text-dim);
  background: var(--surface-3);
  border: 1px solid transparent;
  border-radius: var(--r-pill);
  padding: var(--s1) var(--s3);
  cursor: pointer;
  transition:
    background var(--dur-fast) var(--ease),
    color var(--dur-fast) var(--ease),
    border-color var(--dur-fast) var(--ease);
}

.digest-panel__chip:hover {
  background: var(--surface-hover);
  color: var(--text);
}

.digest-panel__chip:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

.digest-panel__chip--active {
  color: var(--accent-bright);
  border-color: var(--accent-line);
  background: var(--accent-dim);
}
```

- [ ] **Step 6: Run tests**

Run: `npx vitest src/digest/goals.test.ts src/ui/DigestPanel.test.tsx` → PASS (all pre-existing DigestPanel tests included — nothing they assert has changed yet).

- [ ] **Step 7: Commit**

```bash
git add src/digest/goals.ts src/digest/goals.test.ts src/ui/DigestPanel.tsx src/ui/DigestPanel.test.tsx src/ui/DigestPanel.css
git commit -m "feat(ui): goal preset chips above the digest goal textarea"
```

---

### Task 4: Profile chips replace the Compact/Full toggle

**Files:**
- Modify: `src/ui/DigestPanel.tsx`
- Modify: `src/ui/DigestPanel.test.tsx`

This migrates a tested surface: the old `'clicking Full toggle…'` test is **replaced**, and the copy-prompt test's expected header changes from `(compact)` to `(full)` because copy now copies the active profile's text and the default profile renders the full digest.

- [ ] **Step 1: Migrate the tests** (in `src/ui/DigestPanel.test.tsx`; add `within` to the `@testing-library/react` import)

Replace the body of `'clicking "Copy prompt" calls writeText with a string containing the compact header'` — rename it and change the assertion:

```tsx
  it('clicking "Copy prompt" copies the active profile text (detailed by default)', () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });

    render(<DigestPanel result={result} specs={specs} />);
    fireEvent.click(screen.getByRole('button', { name: /copy prompt/i }));

    expect(writeText).toHaveBeenCalledOnce();
    expect(writeText.mock.calls[0][0]).toContain('HWiNFO session summary (full)');
  });
```

Delete the test `'clicking Full toggle changes the token estimate and the digest text contains "(full)"'` and add:

```tsx
  it('renders three profile chips; Terse changes the token estimate and the rendered digest', () => {
    render(<DigestPanel result={result} specs={specs} />);

    const group = screen.getByRole('group', { name: /digest profile/i });
    expect(within(group).getAllByRole('button').map((b) => b.textContent)).toEqual([
      'Detailed', 'Terse', 'Forum post',
    ]);

    const detailedTokens = screen.getByText(/~\d+ tokens/).textContent;
    fireEvent.click(screen.getByRole('button', { name: 'Terse' }));

    expect(screen.getByText(/~\d+ tokens/).textContent).not.toBe(detailedTokens);
    expect(document.querySelector('pre')?.textContent).toContain('HWiNFO session summary (terse)');
  });

  it('copy copies the Forum profile text when Forum is active', () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });

    render(<DigestPanel result={result} specs={specs} />);
    fireEvent.click(screen.getByRole('button', { name: 'Forum post' }));
    fireEvent.click(screen.getByRole('button', { name: /copy prompt/i }));

    expect(writeText.mock.calls[0][0]).toContain('# HWiNFO session summary');
    expect(writeText.mock.calls[0][0]).toContain("What I'm trying to do:");
  });
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest src/ui/DigestPanel.test.tsx` → the three new/changed tests FAIL (panel still renders Compact/Full).

- [ ] **Step 3: Rewire `src/ui/DigestPanel.tsx`**

Replace:

```tsx
import { useState, useMemo } from 'react';
import type { AnalysisResult, DigestMode, InferredSpecs } from '../types';
```

with:

```tsx
import { useState, useMemo } from 'react';
import type { AnalysisResult, DigestProfileId, InferredSpecs } from '../types';
import { PROFILES } from '../digest/profiles';
```

Add below `DEFAULT_GOAL`:

```tsx
const PROFILE_IDS: DigestProfileId[] = ['detailed', 'terse', 'forum'];
```

Replace:

```tsx
  const [mode, setMode] = useState<DigestMode>('compact');
```

with:

```tsx
  const [profile, setProfile] = useState<DigestProfileId>('detailed');
```

Replace the `useMemo` call and copy handler:

```tsx
  const digest = useMemo(
    () =>
      buildDigest({
        log: { ...result.log, specs },
        stats: result.stats,
        events: result.events,
        windows: result.windows,
        guidance: result.verdict.guidance,
        goal,
      }),
    [result.log, result.stats, result.events, result.windows, result.verdict.guidance, specs, goal],
  );

  function handleCopy() {
    navigator.clipboard.writeText(digest[mode]);
  }
```

with:

```tsx
  const digest = useMemo(
    () =>
      buildDigest(
        {
          log: { ...result.log, specs },
          stats: result.stats,
          events: result.events,
          windows: result.windows,
          guidance: result.verdict.guidance,
          goal,
        },
        { profile },
      ),
    [result.log, result.stats, result.events, result.windows, result.verdict.guidance, specs, goal, profile],
  );

  function handleCopy() {
    navigator.clipboard.writeText(digest.full);
  }
```

Replace the toggle JSX:

```tsx
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
```

with:

```tsx
        <div className="digest-panel__toggle" role="group" aria-label="Digest profile">
          {PROFILE_IDS.map((id) => (
            <Button
              key={id}
              variant={profile === id ? 'accent' : 'subtle'}
              onClick={() => setProfile(id)}
            >
              {PROFILES[id].label}
            </Button>
          ))}
        </div>
```

Replace `{digest[mode]}` with `{digest.full}` in the `<pre>`, and `~{digest.tokenEstimate[mode]} tokens` with `~{digest.tokenEstimate.full} tokens` in the footer. (The `.digest-panel__toggle` CSS class is reused unchanged.)

- [ ] **Step 4: Run tests**

Run: `npx vitest src/ui/DigestPanel.test.tsx` → PASS (including the Task 3 chip tests and the untouched goal-textarea test). Run `npm run build` → no unused `DigestMode` import remains.

- [ ] **Step 5: Commit**

```bash
git add src/ui/DigestPanel.tsx src/ui/DigestPanel.test.tsx
git commit -m "feat(ui): digest profile chips replace the compact/full toggle"
```

---

### Task 5: `reportCard.ts` — self-contained HTML report card

**Files:**
- Modify: `vitest.config.ts` (`src/export/**` needs a DOM for `getComputedStyle`)
- Create: `src/export/reportCard.ts`
- Create: `src/export/reportCard.test.ts`

- [ ] **Step 1: Give `src/export/**` a jsdom environment**

In `vitest.config.ts`, extend `environmentMatchGlobs`:

```ts
    environmentMatchGlobs: [
      ['src/ui/**', 'jsdom'],
      ['src/storage/**', 'jsdom'],
      ['src/worker/**', 'jsdom'],
      ['src/export/**', 'jsdom'],
    ],
```

- [ ] **Step 2: Write failing tests** — `src/export/reportCard.test.ts`

```ts
import { describe, it, expect, vi, afterEach } from 'vitest';
import { buildReportCard } from './reportCard';
import { makeLog, makeWindowAnalysis } from '../causes/testkit';
import { buildDigest } from '../digest/digest';
import type { AnalysisResult, Verdict } from '../types';

function makeResult(over: Partial<Verdict> = {}): AnalysisResult {
  const log = makeLog({ sensors: { 'gpu.temp': [70, 72, 84] } });
  log.specs = { ...log.specs, cpuVendor: 'intel', cpuModelGuess: 'Intel hybrid (6P+8E)', gpuVendor: 'nvidia', gpuModelGuess: 'NVIDIA dGPU', ramMb: 32768 };
  const windows = makeWindowAnalysis([]);
  const verdict: Verdict = {
    health: 'warn',
    mascotMood: 'concerned',
    headline: 'Your GPU is running hot',
    hero: [
      { key: 'fps', label: 'Avg FPS', value: '—', severity: 'info' },
      { key: 'gpu-temp', label: 'GPU temp', value: '84', severity: 'warn', sub: 'max °C' },
    ],
    findings: [{ severity: 'warn', text: 'GPU temps climbed past 80 °C.', fix: 'Raise the fan curve.' }],
    timeSplit: null,
    worst: [],
    primaryFix: null,
    coverage: null,
    guidance: [],
    ...over,
  };
  const digest = buildDigest({ log, stats: {}, events: [], windows, guidance: [] });
  return { log, stats: {}, events: [], verdict, digest, windows };
}

const card = (over: Partial<Verdict> = {}) => {
  const result = makeResult(over);
  return buildReportCard({ result, specs: result.log.specs, goal: 'lower temps' });
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe('buildReportCard', () => {
  it('is fully self-contained: no scripts, no external URLs', () => {
    const html = card();
    expect(html.toLowerCase()).not.toContain('<script');
    expect(html).not.toMatch(/https?:\/\//);
    expect(html).not.toContain('@import');
    expect(html).not.toContain('url(');
  });

  it('contains headline, mood, hero tiles, findings, the digest, and the goal', () => {
    const html = card();
    expect(html).toContain('Your GPU is running hot');
    expect(html).toContain('mascot is concerned');
    expect(html).toContain('Avg FPS');
    expect(html).toContain('—');                              // missing values stay "—", never invented
    expect(html).toContain('GPU temps climbed past 80 °C.');
    expect(html).toContain('HWiNFO session summary (full):'); // detailed digest in the <pre>
    expect(html).toContain('Goal: lower temps');
    expect(html).toContain('Intel hybrid (6P+8E)');
  });

  it('escapes user-influenced text', () => {
    const html = card({ headline: 'Temps <b>hot</b> & rising' });
    expect(html).toContain('Temps &lt;b&gt;hot&lt;/b&gt; &amp; rising');
    expect(html).not.toContain('<b>hot</b>');
  });

  it('snapshots live theme tokens and falls back per-token when one is missing', () => {
    vi.spyOn(window, 'getComputedStyle').mockReturnValue({
      getPropertyValue: (name: string) => (name === '--accent' ? '#abcdef' : ''),
    } as unknown as CSSStyleDeclaration);
    const html = card();
    expect(html).toContain('--accent: #abcdef;'); // live token wins
    expect(html).toContain('--bg: #07090f;');     // missing token falls back
  });
});
```

- [ ] **Step 3: Run to verify failure**

Run: `npx vitest src/export/reportCard.test.ts` → FAIL (module not found).

- [ ] **Step 4: Implement `src/export/reportCard.ts`**

```ts
import type { AnalysisResult, Health, InferredSpecs, Limiter, MascotMood } from '../types';
import { buildDigest, LIMITER_LABEL } from '../digest/digest';

// The report is ONE self-contained HTML string: no <script>, no external URLs or
// fonts (the font stacks degrade to system faces offline). Colors/fonts are
// snapshotted from the live theme.css tokens at export time so theme.css stays the
// source of truth; the literals below only guard against a missing token leaving an
// empty CSS value.
const TOKEN_FALLBACKS: Record<string, string> = {
  '--bg': '#07090f',
  '--surface': '#12161d',
  '--inset': '#0c1016',
  '--border': 'rgba(255, 255, 255, 0.06)',
  '--text': '#e6ebf2',
  '--text-dim': '#97a3b4',
  '--text-mute': '#5d697a',
  '--accent': '#3b9eff',
  '--good': '#4fd394',
  '--warn': '#ffb43b',
  '--bad': '#ff5d5d',
  '--font-display': "'Chakra Petch', system-ui, sans-serif",
  '--font-body': "'Hanken Grotesk Variable', system-ui, sans-serif",
  '--font-mono': "'JetBrains Mono', ui-monospace, monospace",
  '--r-lg': '16px',
};

function tokenSnapshot(): string {
  const live = getComputedStyle(document.documentElement);
  return Object.entries(TOKEN_FALLBACKS)
    .map(([name, fallback]) => {
      const v = live.getPropertyValue(name).trim();
      return `  ${name}: ${v !== '' ? v : fallback};`;
    })
    .join('\n');
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

const MOOD_LABEL: Record<MascotMood, string> = {
  chill: 'mascot is chill',
  concerned: 'mascot is concerned',
  panic: 'mascot is panicking',
};

const HEALTH_VAR: Record<Health, string> = { good: '--good', warn: '--warn', bad: '--bad' };

export function buildReportCard(input: {
  result: AnalysisResult;
  specs: InferredSpecs;
  goal: string;
}): string {
  const { result, specs, goal } = input;
  const v = result.verdict;
  const date = new Date().toISOString().slice(0, 10);

  // Same spec injection as DigestPanel: user-edited specs flow into the prompt.
  const digest = buildDigest({
    log: { ...result.log, specs },
    stats: result.stats,
    events: result.events,
    windows: result.windows,
    guidance: result.verdict.guidance,
    goal,
  }).full;

  const specLine = [
    specs.cpuModelGuess ?? specs.cpuVendor,
    specs.gpuModelGuess ?? specs.gpuVendor,
    specs.ramMb !== null ? `${Math.round(specs.ramMb / 1024)} GB RAM` : null,
    specs.isLaptop ? 'laptop' : 'desktop',
  ].filter((x): x is string => x !== null).join(' · ');

  const tiles = v.hero.map((t) => `
      <div class="tile tile--${t.severity}">
        <div class="label">${esc(t.label)}</div>
        <div class="value mono">${esc(t.value)}</div>${t.sub ? `
        <div class="sub">${esc(t.sub)}</div>` : ''}
      </div>`).join('');

  const findings = v.findings.map((f) => `
        <li class="finding finding--${f.severity}">${esc(f.text)}${f.fix ? ` <span class="fix">Fix: ${esc(f.fix)}</span>` : ''}</li>`).join('');

  const split = v.timeSplit
    ? (Object.entries(v.timeSplit.shares) as [Limiter, number][])
        .filter(([, share]) => share >= 0.005)
        .sort((a, b) => b[1] - a[1])
        .map(([k, share]) => `${esc(LIMITER_LABEL[k])} ${Math.round(share * 100)}%`)
        .join(' · ')
    : '';

  // Mirrors the digest's worstBlock formatting so both artifacts read the same.
  const logStartMs = result.windows.windows.length > 0 ? result.windows.windows[0].window.startMs : 0;
  const worstRows = v.worst.map((wm) => {
    const c = wm.classification;
    const offset = c.window.startMs - logStartMs;
    const mm = Math.floor(offset / 60_000);
    const ss = Math.round((offset % 60_000) / 1000);
    const snap = wm.snapshot.map((s) => `${s.label} ${s.value}${s.unit ? ` ${s.unit}` : ''}`).join(', ');
    return `
        <li>+${mm}m${String(ss).padStart(2, '0')}s: −${Math.round(wm.fpsDropPct)}% vs median (${esc(LIMITER_LABEL[c.limiter])}) — ${esc(snap)}</li>`;
  }).join('');

  const sections: string[] = [];
  sections.push(`
    <header class="panel">
      <h1>WTFPS report card</h1>
      <p class="headline" style="color: var(${HEALTH_VAR[v.health]})">${esc(v.headline)}</p>
      <p class="dim">${MOOD_LABEL[v.mascotMood]} · ${esc(specLine)}</p>
    </header>`);
  if (v.hero.length > 0) sections.push(`
    <div class="tiles">${tiles}
    </div>`);
  if (v.findings.length > 0) sections.push(`
    <section class="panel">
      <h2>Findings</h2>
      <ul>${findings}
      </ul>
    </section>`);
  if (split !== '') sections.push(`
    <section class="panel">
      <h2>Time split</h2>
      <p class="mono">${split}</p>
    </section>`);
  if (worstRows !== '') sections.push(`
    <section class="panel">
      <h2>Worst moments</h2>
      <ul class="mono small">${worstRows}
      </ul>
    </section>`);
  sections.push(`
    <section class="panel">
      <h2>LLM digest</h2>
      <pre>${esc(digest)}</pre>
    </section>`);
  sections.push(`
    <footer class="dim">Generated by WhatTheFPS on ${date} — analyzed locally, nothing was uploaded.</footer>`);

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>WTFPS report — ${date}</title>
<style>
:root {
${tokenSnapshot()}
}
* { box-sizing: border-box; }
body { margin: 0; padding: 32px 16px; background: var(--bg); color: var(--text); font-family: var(--font-body); font-size: 15px; line-height: 1.5; }
main { max-width: 760px; margin: 0 auto; display: flex; flex-direction: column; gap: 16px; }
h1 { font-family: var(--font-display); font-size: 22px; margin: 0 0 8px; }
h2 { font-family: var(--font-display); font-size: 13px; letter-spacing: 0.1em; text-transform: uppercase; color: var(--text-mute); margin: 0 0 8px; }
.mono { font-family: var(--font-mono); font-variant-numeric: tabular-nums; }
.panel { background: var(--surface); border: 1px solid var(--border); border-radius: var(--r-lg); padding: 20px; }
.headline { font-size: 18px; margin: 0 0 4px; }
.dim, .sub, .fix { color: var(--text-dim); font-size: 13px; }
.tiles { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 12px; }
.tile { background: var(--surface); border: 1px solid var(--border); border-left: 3px solid var(--accent); border-radius: 10px; padding: 12px 14px; }
.tile .label { font-size: 11px; letter-spacing: 0.1em; text-transform: uppercase; color: var(--text-mute); }
.tile .value { font-size: 24px; font-weight: 600; }
.tile--warn { border-left-color: var(--warn); }
.tile--warn .value { color: var(--warn); }
.tile--bad { border-left-color: var(--bad); }
.tile--bad .value { color: var(--bad); }
ul { margin: 0; padding-left: 18px; }
li { margin: 4px 0; }
.small { font-size: 12px; }
.finding--info::marker { color: var(--accent); }
.finding--warn::marker { color: var(--warn); }
.finding--bad::marker { color: var(--bad); }
pre { margin: 0; padding: 16px; background: var(--inset); border: 1px solid var(--border); border-radius: 10px; font-family: var(--font-mono); font-size: 12px; line-height: 1.55; white-space: pre-wrap; word-break: break-word; color: var(--text-dim); }
footer { text-align: center; }
</style>
</head>
<body>
<main>${sections.join('\n')}
</main>
</body>
</html>
`;
}
```

- [ ] **Step 5: Run tests**

Run: `npx vitest src/export/reportCard.test.ts` → PASS. Run `npm run test` → green (the config change must not break any existing suite). Run `npm run build`.

- [ ] **Step 6: Commit**

```bash
git add vitest.config.ts src/export/reportCard.ts src/export/reportCard.test.ts
git commit -m "feat(export): self-contained HTML report card with live token snapshot"
```

---

### Task 6: Download wiring + compare-digest profile pass-through

**Files:**
- Create: `src/export/download.ts`
- Create: `src/export/download.test.ts`
- Modify: `src/ui/DigestPanel.tsx`, `src/ui/DigestPanel.test.tsx`, `src/ui/DigestPanel.css`
- Modify (only if it exists): `src/digest/compareDigest.ts` + `src/digest/compareDigest.test.ts`

- [ ] **Step 1: Write failing tests**

`src/export/download.test.ts` (jsdom via the Task 5 config glob):

```ts
import { describe, it, expect, vi, afterEach } from 'vitest';
import { downloadText } from './download';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('downloadText', () => {
  it('clicks a temporary anchor at a blob URL with the filename, then revokes it', () => {
    const createObjectURL = vi.fn(() => 'blob:wtfps');
    const revokeObjectURL = vi.fn();
    Object.assign(URL, { createObjectURL, revokeObjectURL });

    let anchor: HTMLAnchorElement | undefined;
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      anchor = this;
    });

    downloadText('wtfps-report-2026-06-11.html', 'text/html', '<!doctype html>');

    expect(createObjectURL).toHaveBeenCalledOnce();
    const blob = createObjectURL.mock.calls[0][0] as Blob;
    expect(blob.type).toBe('text/html');
    expect(anchor?.download).toBe('wtfps-report-2026-06-11.html');
    expect(anchor?.href).toContain('blob:wtfps');
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:wtfps');
  });
});
```

Append to `src/ui/DigestPanel.test.tsx` — module mock at the top of the file, directly after the existing imports (vitest hoists it):

```tsx
import { downloadText } from '../export/download';

vi.mock('../export/download', () => ({ downloadText: vi.fn() }));
```

and the test:

```tsx
describe('report card download', () => {
  it('downloads a dated text/html report card', () => {
    render(<DigestPanel result={result} specs={specs} />);
    fireEvent.click(screen.getByRole('button', { name: /download report card/i }));

    expect(downloadText).toHaveBeenCalledOnce();
    const [filename, mime, html] = vi.mocked(downloadText).mock.calls[0];
    expect(filename).toMatch(/^wtfps-report-\d{4}-\d{2}-\d{2}\.html$/);
    expect(mime).toBe('text/html');
    expect(html).toContain('<!doctype html>');
    expect(html).toContain('WTFPS report card');
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest src/export/download.test.ts src/ui/DigestPanel.test.tsx` → FAIL.

- [ ] **Step 3: Implement `src/export/download.ts`**

```ts
// Blob+anchor download, isolated in its own module so UI tests can mock it.
export function downloadText(filename: string, mime: string, text: string): void {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
```

- [ ] **Step 4: Wire the button into `src/ui/DigestPanel.tsx`**

Add imports:

```tsx
import { buildReportCard } from '../export/reportCard';
import { downloadText } from '../export/download';
```

Add next to `handleCopy`:

```tsx
  function handleDownload() {
    const date = new Date().toISOString().slice(0, 10);
    downloadText(`wtfps-report-${date}.html`, 'text/html', buildReportCard({ result, specs, goal }));
  }
```

Replace the footer's lone button:

```tsx
        <Button variant="accent" onClick={handleCopy}>
          Copy prompt
        </Button>
```

with:

```tsx
        <div className="digest-panel__actions">
          <Button variant="ghost" onClick={handleDownload}>
            Download report card
          </Button>
          <Button variant="accent" onClick={handleCopy}>
            Copy prompt
          </Button>
        </div>
```

and append to `src/ui/DigestPanel.css`:

```css
.digest-panel__actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--s2);
}
```

- [ ] **Step 5: Run tests**

Run: `npx vitest src/export/download.test.ts src/ui/DigestPanel.test.tsx` → PASS.

- [ ] **Step 6: Commit the export wiring**

```bash
git add src/export/download.ts src/export/download.test.ts src/ui/DigestPanel.tsx src/ui/DigestPanel.test.tsx src/ui/DigestPanel.css
git commit -m "feat(export): download report card button in the digest panel"
```

- [ ] **Step 7: Compare-digest profile pass-through — GUARDED on plan #1**

If `src/digest/compareDigest.ts` does **not** exist in the working tree, v2 plan #1 has not landed yet: **skip steps 7–9** and note "compare profile pass-through pending plan #1" in the PR/branch notes. The contract below is what to implement once it lands.

Append to `src/digest/compareDigest.test.ts`, reusing that file's existing before/after/comparison fixture builders (plan #1 creates them — adapt the builder names to what is actually there):

```ts
it('threads the profile into the comparison framing but embeds stored run digests verbatim', () => {
  const d = buildCompareDigest(before, after, comparison, { profile: 'forum' });
  expect(d.profileId).toBe('forum');
  // the freshly rendered delta-summary block follows the profile format…
  expect(d.full).toMatch(/^## /m);
  // …while the BEFORE/AFTER blocks are the stored strings, untouched (SlimResult
  // persisted rendered text — a saved run cannot be re-rendered under a new profile).
});

it('defaults to the detailed profile', () => {
  const d = buildCompareDigest(before, after, comparison);
  expect(d.profileId).toBe('detailed');
});
```

- [ ] **Step 8: Implement in `src/digest/compareDigest.ts`**

Run `npx vitest src/digest/compareDigest.test.ts` first → new tests FAIL. Then:

1. Widen the opts type: `opts?: { goal?: string; profile?: DigestProfileId }` (import `DigestProfileId` from `../types`).
2. `const profile = PROFILES[opts?.profile ?? 'detailed'];` (import `PROFILES` from `./profiles`).
3. Wherever the function emits its own delta-summary section headings, route them through the same rule as `digest.ts`: `profile.format === 'markdown' ? `## ${title}` : `${title}:``.
4. The embedded BEFORE/AFTER digest blocks keep using the stored rendered strings from each `SavedRun` exactly as stored — do **not** attempt to re-render them; only the rendered text was persisted (decision 7).
5. Set `profileId: profile.id` on the returned `Digest` (replacing the Task 2 hardcoded `'detailed'`).

- [ ] **Step 9: Run + commit**

Run: `npx vitest src/digest/compareDigest.test.ts`, then `npm run test` and `npm run build` → green.

```bash
git add src/digest/compareDigest.ts src/digest/compareDigest.test.ts
git commit -m "feat(digest): profile pass-through for compare digests"
```

> **Future note:** a compare *report card* (before/after side-by-side HTML) is deliberately deferred — it needs layout decisions the single-run card doesn't answer.

---

## Verification (end of plan)

1. `npm run test` — full suite green, including the Task 1 byte-pins.
2. `npm run build` — strict typecheck green (`DigestMode` no longer imported by the panel; no unused symbols).
3. Manual sweep (`npm run dev`, drop a sample log from `HWINFO samples/`):
   - Switch Detailed / Terse / Forum post — token estimate changes each time; Terse is visibly shorter; Forum shows `#`/`##` headings and the human sign-off.
   - Copy each profile and paste somewhere — the copied text matches the visible `<pre>`.
   - Click each goal preset — textarea fills, the goal line in the digest updates, the chip lights; type a custom goal — all chips deactivate.
   - Click "Download report card", then open the downloaded `wtfps-report-<date>.html` **offline in a browser** (disconnect or use devtools offline mode): dark themed, headline/tiles/findings/digest all present, selectable text, no console errors, no network requests in the Network tab.

## Future / stretch

- **Compare report card** — before/after side-by-side HTML export once plan #1's compare view stabilizes.
- **Custom user-defined profiles** — a profile editor persisted to `localStorage` (`wtfps.profiles.v1`), seeded from `PROFILES`; the `DigestProfile` shape was kept JSON-serializable-except-`framing` on purpose (framing would become a template string).
- **PNG export** — stays out; if users ask, ship a "how to screenshot the report card" hint instead of an html2canvas dependency.

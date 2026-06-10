# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

WhatTheFPS (WTFPS) is a 100% client-side web app: the user drops an HWiNFO sensor-log CSV
into the browser and gets a plain-language verdict on what is bottlenecking their FPS, plus a
token-efficient "copy prompt for my LLM" digest. No backend, no network calls — the only
persistence is `localStorage` for the editable specs card. React 18 + Vite 5 + TypeScript 5
(strict), tested with Vitest.

## Commands

```sh
npm run dev          # Vite dev server
npm run build        # tsc -b (typecheck, all tsconfig projects) THEN vite build
npm run preview      # serve the production build
npm run test         # vitest run (all tests once)
npm run test:watch   # vitest watch mode
npx vitest src/detect/fpsCap.test.ts   # run a single test file
npx vitest -t "name of test"           # run tests matching a name
```

There is no separate lint/format/typecheck script — typechecking happens inside `npm run build`
via `tsc -b`. TS is strict with `noUnusedLocals`/`noUnusedParameters`; `any` is avoided by
convention (model unknowns explicitly).

## Architecture

The whole analysis is a fixed, linear pipeline assembled at one seam:
**`src/engine/analyze.ts` → `analyze(bytes: Uint8Array): AnalysisResult`**. Read this file
first — it shows the entire data flow in ~45 lines:

```
bytes ─► decodeBytes (parsing/decode) ─► parseCsv (parsing/csv) ─► buildColumns (parsing/columns)
      ─► normalize (sensors/normalize)  ─► buildFps (stats/fps) ─► computeStats (stats/percentiles)
      ─► [detectThrottling, detectFpsCap, detectCpuBottleneck, detectPowerHotspotRam] (detect/*)
      ─► buildVerdict (verdict/buildVerdict) ─► buildDigest (digest/digest) ─► AnalysisResult
```

Layer responsibilities:
- **`src/parsing/`** — bytes→`ParsedCsv`. Detects delimiter (`,`/`;`) and decimal (`.`/`,`),
  strips footer rows, and extracts HWiNFO's per-column device "source" trailer.
- **`src/sensors/`** — `registry.ts` maps raw HWiNFO column names to canonical sensor keys;
  `normalize.ts` wires columns→`NormalizedLog`; `fingerprint.ts` infers CPU/GPU/RAM specs.
- **`src/stats/`** — `percentiles.ts` (avg, p5/p95/p99, 1%/5% lows) and `fps.ts` (FPS source
  selection + cap detection). `percentiles.ts` is a dependency-free utility.
- **`src/detect/`** — four independent detectors, each returns `DiagEvent[]`.
- **`src/verdict/`** — ranks events into health/mascot-mood/hero-tiles/top findings.
- **`src/digest/`** — renders compact + full markdown LLM prompts.

### Types are the contract

`src/types.ts` defines every cross-module type (`ParsedCsv`, `ColumnMeta`, `CanonicalKey`,
`FlagKey`, `NormalizedLog`, `Stats`, `FpsData`, `DiagEvent`, `Verdict`, `Digest`,
`AnalysisResult`). Modules communicate only through these shapes — change a type here and
expect to touch multiple layers. Treat it as the central interface; read it before adding or
moving data between stages.

### UI and threading

- React entry: `src/main.tsx` → `src/App.tsx` (top-level state is plain React hooks: status,
  result, inferred/overridden specs, easy/nerd `mode`, settings modal — no Redux/Zustand).
- Heavy parsing runs off the main thread: `src/worker/analyze.worker.ts` is a thin wrapper
  around `analyze()`, driven by the `src/ui/useAnalysis.ts` hook (spawns the worker once,
  posts the file as bytes, receives `AnalysisResult`).
- `src/storage/specsStore.ts` persists the specs card to `localStorage` (key `wtfps.specs.v1`),
  and only restores saved specs when the CPU+GPU models match the new log.

## HWiNFO domain gotchas

These are the things that bite when changing the ingest/normalize layers:
- **Encoding:** logs are often Windows-1252, not UTF-8. Always read as bytes (`Uint8Array`) and
  decode via `parsing/decode`; never read sample files as UTF-8 strings (including in tests).
- **Locale variance:** delimiter may be `,` or `;` and decimals `.` or `,`; both are detected.
- **No hardware database.** Specs (CPU/GPU/RAM models, laptop vs desktop) are *inferred* from
  HWiNFO's trailer rows (`dGPU [#1]: NVIDIA ...`) and column-label heuristics in
  `sensors/fingerprint.ts`, falling back to a topology guess from core counts.
- **dGPU vs iGPU:** column names collide between discrete and integrated GPUs; `normalize.ts`
  uses section anchors to assign each column, and the first column to claim a key wins.
- **Midnight crossing:** HWiNFO timestamps reset at midnight, so `normalize.ts` adds 24h to a
  negative time delta.
- **FPS cap detection:** treats FPS as capped when ~80% of cleaned samples sit within ±1 of a
  candidate ceiling (common caps + the highest measured value).

## Tests

- Vitest runs in `node` by default, but `vitest.config.ts` overrides `src/ui/**`,
  `src/storage/**`, and `src/worker/**` to `jsdom`. Setup file: `src/test/setup.ts`.
- Tests are colocated (`*.test.ts` / `*.test.tsx`).
- Golden integration tests under `src/engine/` run real logs from the `HWINFO samples/`
  directory; the bar is: every sample loads with no errors and no `NaN`.

## UI design contract

Before editing anything under `src/ui/`, read `src/ui/DESIGN.md`. Key rules:
- **Style only through tokens and primitives.** Every color/font/space/radius/shadow/duration
  is a CSS variable in `src/ui/theme.css`; component CSS may reference only `var(--…)` — never
  a hardcoded hex, px font-size, or raw color.
- **Do not edit `theme.css`, `cx.ts`, the `primitives/`, or `Mascot.tsx`** — import them.
- One accent only (`--accent`, `#3b9eff`); semantic colors `--good`/`--warn`/`--bad` stay warm.
- Frosted glass (`<GlassCard>`) is used on the hero card and modals **only**; everything else is
  solid `<Card>`/`<StatTile>`. Numbers/tables always go in solid surfaces, rendered in mono
  with tabular figures (`.mono`).
- Easy mode = short, plain, reassuring, one fix; Nerd mode = dense and exact. Never invent
  numbers the engine didn't produce — show "—" / "no framerate logged".

## Reference docs

- `docs/superpowers/specs/2026-06-09-wtfps-hwinfo-analyzer-design.md` — product/design spec.
- `docs/superpowers/plans/2026-06-09-wtfps-hwinfo-analyzer.md` — original implementation plan
  (note: its "team write-ownership" split was build-time scaffolding, not an ongoing rule).

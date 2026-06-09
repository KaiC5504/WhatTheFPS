# WTFPS — HWiNFO Log Analyzer (Design Spec)

> Approved design. The detailed, test-first implementation plan lives in
> `docs/superpowers/plans/2026-06-09-wtfps-hwinfo-analyzer.md`.

## Context

Gamers and tinkerers run HWiNFO sensor logging during a game or benchmark and end up
with a giant, unreadable CSV (hundreds of columns, thousands of rows, messy headers).
They can't easily tell what's healthy, what's throttling, or whether a tweak (e.g. an
undervolt) actually helped.

**WTFPS** is a fully client-side static web app that ingests a HWiNFO CSV in the browser
and produces a plain-language verdict, with an Easy/Nerd toggle. Its signature feature is
a **"Copy prompt for my LLM"** button that emits a compact, token-efficient digest (specs
+ percentile stats + plain-English detected events + an editable goal line) — never the
raw CSV — so any LLM can give sharp, personalized tuning advice.

**Privacy is a literal fact, not a promise:** nothing is ever uploaded. No server, no
database, no accounts. Parsing and all computation happen in-browser; the only persistence
is `localStorage` (specs card + optional comparison baseline). Hosted as static files
behind Caddy on the user's Hetzner VPS.

Verified directly against the 12 real sample logs in `HWINFO samples/` (Intel+NVIDIA and
AMD+NVIDIA gaming laptops): Latin-1 (`°C` → `�C`) encoding; comma-separated with dot
decimals (EU exports use `;` + decimal comma); `D.M.YYYY` dates; ~2s polling; duplicate
column headers (`GPU Temperature`, `GPU [RPM]`, `Drive Temperature`, `SPD Hub Temperature`
each appear 2+ times); both PresentMon column sets present (`Framerate Displayed (avg)`
populated every row, legacy `Framerate [FPS]` alternates `0→value`); rich Yes/No throttle
flags; every sample a dual-GPU (iGPU + NVIDIA dGPU) laptop.

## Decisions (locked in interview)

| Topic | Decision |
|---|---|
| Specs input | Infer from the log's sensor-name fingerprints, pre-fill an **editable** specs card, persist to localStorage. No separate report file in v1. |
| Compare UX | Single-log diagnose is the **default**; compare is **opt-in via a toggle**. Baseline saved to localStorage. (Compare is v2.) |
| Easy hero row | Five key numbers: **FPS, CPU usage, CPU temp, GPU usage, GPU temp**. Rest kept simple. |
| Target rigs | Auto-detect laptop vs desktop. On laptops the iGPU is *always* present even when gaming on the dGPU → pick the gaming GPU by **fingerprint**, not by iGPU absence. |
| v1 slice | **Diagnose one log + Copy-prompt digest.** Compare is the fast-follow. |
| Detections in v1 | **All four groups:** thermal throttling, FPS-cap + cooling tips, CPU-bottleneck, power-limit/hotspot/RAM. |
| Stack | React + Vite + TypeScript. Client-side only. Tauri-wrappable later. |
| Visual | Dark "control-room/diagnostic instrument." Solid dark surfaces as the primary language; frosted glass **only** on the hero/verdict card (+ modals). Single blue accent `#3b9eff`; semantic red/amber/green never go blue (heat stays warm). WTFPS wordmark, shared "F" tinted blue. Reactive monitor mascot (panic / chill / peeking-eyes favicon). Respect `prefers-reduced-motion`; never animate big blurred surfaces; never put data on glass. |

## Architecture

Static SPA. Heavy work (decode → parse → normalize → stats) runs in a **Web Worker**.
One-way data flow:

```
File ─▶ decode (win-1252) ─▶ CSV parse ─▶ column model ─▶ sensor normalize
     ─▶ hardware fingerprint ─▶ FPS clean + per-sensor stats ─▶ detectors
     ─▶ verdict builder ─▶ { hero numbers, traffic-light, findings, mascot mood }
     └▶ digest generator (compact/full) ─▶ clipboard
```

Module map, Easy vs Nerd content, build order, definition of done, and the full v2
roadmap are reproduced in the implementation plan. This file is the frozen design intent;
the plan is the executable breakdown.

## Definition of done (v1)

- Loads all 12 sample logs (Intel & AMD laptops) with no errors and no invented numbers.
- Correct 5 hero numbers, a sensible traffic-light verdict, and all four detection groups
  firing where the data warrants.
- Copy-prompt yields a compact digest with percentiles + plain-English events + editable
  goal, FPS source labeled, comfortably token-efficient; Full toggle works.
- Easy/Nerd toggle works; graceful "no framerate logged" path; entirely client-side;
  builds to static files servable behind Caddy.

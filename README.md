# <img src="public/wtfps-icon.svg" width="38" alt="" align="top" /> WTFPS — what the FPS is going on?

Drop a [HWiNFO](https://www.hwinfo.com/) sensor-log CSV into your browser and get a
plain-language verdict on what's bottlenecking your FPS — plus a token-efficient
**"copy prompt for my LLM"** digest so any chatbot can give you sharp, personalized
tuning advice without ever seeing the raw CSV.

**Nothing is uploaded. Ever.** There is no server, no database, no accounts, no network
calls. Parsing and analysis run entirely in your browser (in a Web Worker), and the only
thing persisted is your editable specs card in `localStorage`. Privacy here is a literal
fact of the architecture, not a policy promise.

## Why

Gamers and tinkerers run HWiNFO logging during a game or benchmark and end up with a
giant, unreadable CSV: hundreds of columns, thousands of rows, messy headers. It's hard
to tell what's healthy, what's throttling, or whether that undervolt actually helped.

WTFPS reads the log and answers the question you actually have: *why isn't my FPS
higher?*

## What it does

- **Plain-language verdict** — a traffic-light health summary, five hero numbers
  (FPS, CPU usage, CPU temp, GPU usage, GPU temp), top findings, and a reactive mascot
  whose mood tracks how your rig is doing.
- **Four detection groups:**
  - thermal throttling (CPU and GPU)
  - FPS caps (V-Sync / frame limiters) and cooling headroom
  - CPU bottlenecks
  - power limits, hotspot deltas, and RAM pressure
- **Easy / Nerd toggle** — Easy mode is short, plain, and reassuring with one suggested
  fix; Nerd mode is dense and exact, with percentiles and 1%/5% lows.
- **Copy prompt for my LLM** — the signature feature. One click copies a compact
  markdown digest (your specs + percentile stats + detected events in plain English +
  an editable goal line) sized to paste into any LLM. Compact and full variants.
- **Specs inferred, not looked up** — there's no hardware database. CPU/GPU/RAM models
  and laptop-vs-desktop are fingerprinted from the log itself, pre-filled into an
  editable specs card, and remembered for the next log from the same machine.
- **Honest about missing data** — if the log has no framerate column, it says so.
  Numbers the engine didn't produce are never invented.

## Getting started

```sh
npm install
npm run dev        # Vite dev server
```

Then open the local URL, drop in a HWiNFO CSV, and read the verdict.

Other scripts:

```sh
npm run build      # typecheck (tsc -b) + production build
npm run preview    # serve the production build
npm run test       # run all tests once (vitest)
npm run test:watch # vitest watch mode
```

The build output in `dist/` is plain static files — host it anywhere that can serve
HTML (Caddy, nginx, GitHub Pages, a USB stick).

### Logging with HWiNFO

In HWiNFO (Sensors window), start logging before your game/benchmark session and stop
it after. For FPS data, HWiNFO needs to see a framerate source such as PresentMon /
RTSS. Then drop the resulting `.CSV` into WTFPS — no cleanup needed, the messy headers
and footer rows are handled.

## How it works

The whole analysis is one fixed pipeline, assembled in
[`src/engine/analyze.ts`](src/engine/analyze.ts):

```
bytes ─▶ decode (Windows-1252 aware) ─▶ CSV parse ─▶ column model ─▶ sensor normalize
      ─▶ hardware fingerprint ─▶ FPS cleaning + per-sensor stats ─▶ four detectors
      ─▶ verdict builder ─▶ digest generator ─▶ result
```

| Layer | Responsibility |
|---|---|
| `src/parsing/` | bytes → parsed CSV: encoding, delimiter (`,`/`;`) and decimal (`.`/`,`) detection, footer stripping, device-trailer extraction |
| `src/sensors/` | map HWiNFO's raw column names to canonical sensor keys; fingerprint the hardware |
| `src/stats/` | percentiles, 1%/5% lows, FPS source selection and cap detection |
| `src/detect/` | the four independent detectors |
| `src/verdict/` | rank events into health, findings, hero tiles, mascot mood |
| `src/digest/` | render the compact/full LLM prompts |

`src/types.ts` is the contract between all layers. Heavy work runs off the main thread
in `src/worker/analyze.worker.ts`.

### HWiNFO quirks it survives

Real logs are messier than you'd hope, and the parser is built around the mess:

- Windows-1252 encoding (the `°` in `°C` breaks naive UTF-8 readers)
- EU exports with `;` delimiters and decimal commas
- Duplicate column headers (`GPU Temperature` appears once per GPU)
- Laptops where the iGPU is always present even when the game runs on the dGPU —
  the gaming GPU is picked by fingerprint, not by guessing
- Timestamps that wrap at midnight
- Legacy PresentMon columns that alternate `0 → value` every other row

## Tech

React 18 · Vite 5 · TypeScript 5 (strict) · Vitest · [uPlot](https://github.com/leeoniya/uPlot)
for charts. No state library, no CSS framework — design tokens live in
[`src/ui/theme.css`](src/ui/theme.css) and the UI contract in
[`src/ui/DESIGN.md`](src/ui/DESIGN.md).

Tests are colocated with the code; golden integration tests in `src/engine/` run real
sample logs end-to-end with a simple bar: every sample loads with no errors and no
`NaN`.

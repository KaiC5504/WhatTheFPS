# WTFPS "Ambient Glass" Restyle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restyle the WTFPS UI from "flat dark dashboard" to the user-approved **Ambient Glass** direction — a fixed blue aurora + film grain behind everything, translucent floating panels, rationed glow — without touching engine code, fonts, the mascot, or the motion language.

**Architecture:** Pure CSS-token work. All components style themselves through `var(--…)` tokens and four primitive classes defined in `src/ui/theme.css`, so Task 1 (tokens + primitives) migrates ~80% of the app in one atomic commit. Remaining tasks retouch chrome, hero, and findings, then rewrite the design contract. One 1-line TSX edit total (removing a hero blob `<span>`).

**Tech Stack:** React 18, Vite 5, TypeScript 5 strict, plain CSS with custom properties, Vitest (jsdom for `src/ui/**`). No new dependencies.

**Reference mockup (the approved visual contract):** `.superpowers/brainstorm/566-1781099946/content/results-b.html` — open it in a browser if unsure what "done" looks like.

**Commit style:** conventional commits as shown in each task. Do **not** add `Co-Authored-By` or any trailer to commit messages (repo owner preference).

---

## Design contract for this restyle (read before coding)

**Surface hierarchy (4 tiers):**

1. **Atmosphere** — `--bg #07090f` + fixed aurora (`body::before`) + film grain (`body::after`). Static, never animated. The teal `--aurora-2` exists ONLY in the atmosphere; it must never appear on any interactive element or content surface.
2. **Panel** (translucent, floating) — `--panel-bg rgba(18,24,34,.62)` + `--panel-border`. Used by `.card`, `.stat-tile`, finding rows, dropzone. **No backdrop blur** — see perf policy.
3. **Glass** (real backdrop blur) — exactly three surfaces ever: the hero `.glass-card`, the sticky `.topbar`, the settings-modal backdrop. Never more than 3 active at once.
4. **Solid** (`--surface*` / `--inset`, unchanged values) — anything with dense data: nerd cards, tables, code wells, chips, form inputs.

**Perf policy (the reason panels don't blur):** behind ordinary panels there is only a smooth fixed gradient + 5% grain; blurring a smooth gradient returns the same gradient, so alpha alone is visually identical and free. Real blur on 10–15 panels would force per-frame re-filtering during the `rise` entrance animation → jank. `--panel-blur: 10px` is defined as documentation of intent but applied nowhere.

**The closed glow list (nothing else may glow, ever):**

1. Wordmark "F" (`.wordmark__f` text-shadow)
2. Active mode tab (`.topbar__toggle .btn--accent` box-shadow)
3. Severity metric in the hero headline (`.hero-verdict__metric` text-shadow)
4. StatTile severity edge bars, warn/bad tiers only (`::before` box-shadow)
5. Primary accent button (`--shadow-btn-accent`)

Explicit rulings: drag-over feedback on the dropzone is *transient interaction feedback*, exempt and kept. Finding dots and time-split segments do **not** glow (the dots glow today — Task 4 removes that). The `good` tier's tile bars never bloom; the hero headline metric is the only place green may glow (when the verdict is good, that number *is* the verdict).

**Unchanged by design:** fonts (Chakra Petch / Hanken Grotesk / JetBrains Mono), single blue accent `#3b9eff`, warm semantic colors, `Mascot.tsx`, `cx.ts`, all entrance animations and delays, reduced-motion handling, all engine/analysis code.

---

### Task 1: Tokens, atmosphere, primitives + the solid-data guard

**Files:**
- Modify: `src/ui/theme.css`
- Modify: `src/ui/NerdView.css`
- Tests (existing, must stay green): `src/ui/primitives/primitives.test.tsx`, `src/ui/NerdView.test.tsx`

These two files ship in ONE commit so Nerd mode never passes through a translucent state.

- [ ] **Step 1: Rewrite the theme.css header comment** (currently lines 1–6)

Old:
```css
/*
 * WTFPS — "diagnostic control room" theme.
 * Solid dark instrument surfaces; a single frosted hero; one blue accent (#3b9eff);
 * warm semantic colors for heat that never drift blue. All visual decisions live as
 * tokens here so the component layer stays cohesive. See DESIGN.md for the contract.
 */
```

New:
```css
/*
 * WTFPS — "ambient glass" theme: a lit instrument room at night.
 * A fixed blue aurora + film grain behind everything; translucent panels floating
 * over it; real frosted glass only where it earns its cost (hero, top bar, modal
 * overlay); dense data on solid surfaces; one blue accent (#3b9eff); warm semantic
 * colors for heat that never drift blue. All visual decisions live as tokens here.
 * See DESIGN.md for the contract.
 */
```

- [ ] **Step 2: Update the surfaces block and add atmosphere/panel tokens**

Old:
```css
  /* Surfaces — near-black, faintly cool, with a stepped elevation scale */
  --bg: #0a0d12;
  --surface: #12161d;
  --surface-2: #181d26;
  --surface-3: #212834;
  --inset: #0c1016;
```

New:
```css
  /* Surfaces. --surface*/--inset are the SOLID tier (dense data, wells, chips);
     --panel-* is the translucent floating tier that sits over the aurora. */
  --bg: #07090f;
  --surface: #12161d;
  --surface-2: #181d26;
  --surface-3: #212834;
  --surface-hover: #2c3543;
  --inset: #0c1016;

  /* Atmosphere — fixed aurora + film grain, painted by body::before/::after.
     Teal --aurora-2 is atmosphere-ONLY: never on interactive elements. */
  --aurora-1: rgba(59, 158, 255, 0.16);
  --aurora-2: rgba(45, 212, 191, 0.08);
  --aurora-3: rgba(59, 158, 255, 0.07);
  --grain-opacity: 0.05;

  /* Panels — translucent tier. No backdrop blur by default (alpha over the smooth
     fixed aurora reads identically and avoids re-filtering during entrances);
     --panel-blur records the intended depth for a future opt-in. */
  --panel-bg: rgba(18, 24, 34, 0.62);
  --panel-border: rgba(255, 255, 255, 0.08);
  --panel-blur: 10px;
  --fill-faint: rgba(255, 255, 255, 0.05);
```

- [ ] **Step 3: Add semantic glow colors** (after the `--bad-dim` line)

Old:
```css
  --good-dim: rgba(79, 211, 148, 0.13);
  --warn-dim: rgba(255, 180, 59, 0.13);
  --bad-dim: rgba(255, 93, 93, 0.13);
```

New:
```css
  --good-dim: rgba(79, 211, 148, 0.13);
  --warn-dim: rgba(255, 180, 59, 0.13);
  --bad-dim: rgba(255, 93, 93, 0.13);
  --good-glow: rgba(79, 211, 148, 0.5);
  --warn-glow: rgba(255, 180, 59, 0.5);
  --bad-glow: rgba(255, 93, 93, 0.5);
```

- [ ] **Step 4: Retune the glass tokens and add bar/overlay tokens**

Old:
```css
  /* Glass — hero + modals ONLY */
  --glass-bg: rgba(20, 27, 38, 0.55);
  --glass-border: rgba(255, 255, 255, 0.1);
  --glass-blur: 22px;
```

New:
```css
  /* Glass — real backdrop blur on hero, top bar and modal overlay ONLY (≤3 active) */
  --glass-bg: rgba(16, 22, 32, 0.5);
  --glass-border: rgba(255, 255, 255, 0.12);
  --glass-blur: 16px;
  --glass-saturate: 140%;
  --bar-bg: rgba(10, 13, 18, 0.6);
  --bar-blur: 14px;
  --overlay-bg: rgba(0, 0, 0, 0.55);
  --overlay-blur: 8px;
```

- [ ] **Step 5: Add the two new shadow/glow composites** (after `--shadow-header`)

Old:
```css
  --shadow-pop: 0 16px 48px rgba(0, 0, 0, 0.5);
  --shadow-header: 0 8px 24px -16px rgba(0, 0, 0, 0.8);
```

New:
```css
  --shadow-pop: 0 16px 48px rgba(0, 0, 0, 0.5);
  --shadow-header: 0 8px 24px -16px rgba(0, 0, 0, 0.8);
  --shadow-btn-accent: 0 6px 24px rgba(59, 158, 255, 0.35), inset 0 0 0 1px rgba(107, 182, 255, 0.4);
  --glow-accent: 0 0 16px rgba(59, 158, 255, 0.4);
```

- [ ] **Step 6: Replace the body background stack with flat bg + aurora pseudo-element**

Old:
```css
body {
  margin: 0;
  font-family: var(--font-body);
  font-size: 15px;
  line-height: 1.5;
  color: var(--text);
  /* atmosphere stack: two horizon glows over a faint engineering grid */
  background:
    radial-gradient(1200px 620px at 72% -12%, rgba(59, 158, 255, 0.1), transparent 60%),
    radial-gradient(900px 520px at 8% 112%, rgba(255, 140, 60, 0.045), transparent 55%),
    linear-gradient(rgba(255, 255, 255, 0.017) 1px, transparent 1px),
    linear-gradient(90deg, rgba(255, 255, 255, 0.017) 1px, transparent 1px),
    var(--bg);
  background-size: auto, auto, 36px 36px, 36px 36px, auto;
  background-attachment: fixed;
  -webkit-font-smoothing: antialiased;
  text-rendering: optimizeLegibility;
}
```

New (the old `background-attachment: fixed` stack repainted on scroll; the replacement layers are genuinely fixed-position and composite once — also note the warm orange radial dies here, warm is semantics-only now, and the engineering grid dies with it):
```css
body {
  margin: 0;
  font-family: var(--font-body);
  font-size: 15px;
  line-height: 1.5;
  color: var(--text);
  background: var(--bg);
  -webkit-font-smoothing: antialiased;
  text-rendering: optimizeLegibility;
}

/* Aurora — fixed, static, composited once; never animated */
body::before {
  content: '';
  position: fixed;
  inset: 0;
  z-index: 0;
  pointer-events: none;
  background:
    radial-gradient(60% 42% at 15% -8%, var(--aurora-1), transparent 70%),
    radial-gradient(45% 38% at 90% 12%, var(--aurora-2), transparent 70%),
    radial-gradient(55% 50% at 55% 115%, var(--aurora-3), transparent 70%);
}
```

- [ ] **Step 7: Move the grain from `body::before` to `body::after`** (the aurora took `::before`)

Old:
```css
/* Static film grain — never animated (large blurred-surface motion is banned) */
body::before {
  content: '';
  position: fixed;
  inset: 0;
  z-index: 0;
  pointer-events: none;
  opacity: 0.028;
  mix-blend-mode: overlay;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
}
```

New (same data-URI, plain opacity instead of blend mode — cheaper to composite, identical at 5%):
```css
/* Static film grain — never animated (large blurred-surface motion is banned) */
body::after {
  content: '';
  position: fixed;
  inset: 0;
  z-index: 0;
  pointer-events: none;
  opacity: var(--grain-opacity);
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
}
```

`#root` already has `position: relative; z-index: var(--z-base);` so content stacks above both layers — no change needed there.

- [ ] **Step 8: Tokenize the scrollbar hover** (inside `::-webkit-scrollbar-thumb:hover`)

Old:
```css
::-webkit-scrollbar-thumb:hover {
  background: #2c3543;
  background-clip: content-box;
}
```

New:
```css
::-webkit-scrollbar-thumb:hover {
  background: var(--surface-hover);
  background-clip: content-box;
}
```

- [ ] **Step 9: Give the wordmark F its glow** (glow list item 1)

Old:
```css
.wordmark__f {
  color: var(--accent);
}
```

New:
```css
.wordmark__f {
  color: var(--accent);
  text-shadow: 0 0 18px var(--accent-glow);
}
```

- [ ] **Step 10: Float the Card primitive**

Old:
```css
.card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--r-lg);
  padding: var(--s5);
  box-shadow: var(--shadow-card);
}
```

New (`.card--inset` directly below stays exactly as is — it re-overrides to opaque `--inset`, which is what keeps code wells/snapshot wells solid):
```css
.card {
  background: var(--panel-bg);
  border: 1px solid var(--panel-border);
  border-radius: var(--r-lg);
  padding: var(--s5);
  box-shadow: var(--shadow-card);
}
```

- [ ] **Step 11: Retune the GlassCard primitive**

Old:
```css
  -webkit-backdrop-filter: blur(var(--glass-blur)) saturate(140%);
  backdrop-filter: blur(var(--glass-blur)) saturate(140%);
```

New:
```css
  -webkit-backdrop-filter: blur(var(--glass-blur)) saturate(var(--glass-saturate));
  backdrop-filter: blur(var(--glass-blur)) saturate(var(--glass-saturate));
```

And the sheen — old:
```css
.glass-card::after {
  content: '';
  position: absolute;
  inset: 0 0 auto 0;
  height: 1px;
  background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.25), transparent);
}
```

New (inset from the edges so it reads as a highlight on the glass, not a border):
```css
.glass-card::after {
  content: '';
  position: absolute;
  inset: 0 10% auto 10%;
  height: 1px;
  background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.3), transparent);
}
```

- [ ] **Step 12: Float the StatTile primitive and retune its severity blooms**

Old:
```css
  background: linear-gradient(180deg, var(--surface-2), var(--surface));
  border: 1px solid var(--border);
```

New:
```css
  background: var(--panel-bg);
  border: 1px solid var(--panel-border);
```

And the blooms — old:
```css
.stat-tile--warn::before {
  box-shadow: 0 0 18px -2px var(--warn);
}
.stat-tile--bad::before {
  box-shadow: 0 0 18px -2px var(--bad);
}
```

New:
```css
.stat-tile--warn::before {
  box-shadow: 0 0 10px var(--warn-glow);
}
.stat-tile--bad::before {
  box-shadow: 0 0 10px var(--bad-glow);
}
```

- [ ] **Step 13: Button polish — accent bloom (glow list item 5) and the subtle-hover hardcode**

Old:
```css
.btn--accent {
  background: var(--accent);
  color: var(--on-accent);
  box-shadow: 0 6px 18px rgba(59, 158, 255, 0.28);
}
```

New:
```css
.btn--accent {
  background: var(--accent);
  color: var(--on-accent);
  box-shadow: var(--shadow-btn-accent);
}
```

Old:
```css
.btn--subtle:hover:not(:disabled) {
  background: #2a3340;
}
```

New:
```css
.btn--subtle:hover:not(:disabled) {
  background: var(--surface-hover);
}
```

- [ ] **Step 14: Pin Nerd mode to the solid tier** — in `src/ui/NerdView.css`

Old:
```css
.nerd-card {
  padding: var(--s5);
}
```

New:
```css
/* Nerd mode is the instrument bench; it sits on solid metal. Dense data never
   goes translucent — this overrides the panel background .card now carries. */
.nerd-card {
  padding: var(--s5);
  background: var(--surface);
}
```

- [ ] **Step 15: Verify**

Run: `npm run build`
Expected: clean exit (tsc strict + vite build, no errors).

Run: `npx vitest run src/ui`
Expected: all UI test files pass — they assert class names (`.stat-tile--bad`, `.glass-card`, `btn--accent`…), none of which changed.

Run: `npm run dev`, drop a sample log from `HWINFO samples/`, eyeball: aurora glow top-left + teal top-right + grain on the page; cards visibly let the aurora through; **Nerd mode cards stay opaque**; digest code well stays near-black.

- [ ] **Step 16: Commit**

```bash
git add src/ui/theme.css src/ui/NerdView.css
git commit -m "feat(ui): ambient glass — aurora atmosphere, panel tier, glass retune"
```

---

### Task 2: Chrome — blurred top bar, tokenized overlay, floating dropzone

**Files:**
- Modify: `src/ui/TopBar.css`
- Modify: `src/ui/App.css` (settings overlay block)
- Modify: `src/ui/DropZone.css`
- Tests (existing, must stay green): `src/ui/TopBar.css` has `src/ui/TopBar.test.tsx`, `src/ui/DropZone.test.tsx`

- [ ] **Step 1: Make the top bar translucent glass** — in `src/ui/TopBar.css`

Old:
```css
  background: var(--bg);
  border-bottom: 1px solid var(--border);
  box-shadow: var(--shadow-header);
```

New (this is one of the three sanctioned blur surfaces — scrolling content under a sticky bar is the one place blur genuinely pays):
```css
  background: var(--bar-bg);
  -webkit-backdrop-filter: blur(var(--bar-blur));
  backdrop-filter: blur(var(--bar-blur));
  border-bottom: 1px solid var(--border);
  box-shadow: var(--shadow-header);
```

- [ ] **Step 2: Lighten the mode-toggle track** — same file

Old:
```css
.topbar__toggle {
  display: flex;
  align-items: center;
  gap: var(--s1);
  margin-left: auto;
  background: var(--surface);
  padding: var(--s1);
  border-radius: var(--r-pill);
  border: 1px solid var(--border);
}
```

New:
```css
.topbar__toggle {
  display: flex;
  align-items: center;
  gap: var(--s1);
  margin-left: auto;
  background: var(--fill-faint);
  padding: var(--s1);
  border-radius: var(--r-pill);
  border: 1px solid var(--panel-border);
}
```

- [ ] **Step 3: Light the active mode tab** (glow list item 2) — append at the end of `src/ui/TopBar.css`:

```css
/* the live mode lamp — one of the five sanctioned glows (see DESIGN.md) */
.topbar__toggle .btn--accent {
  box-shadow: var(--glow-accent);
}
```

- [ ] **Step 4: Tokenize the settings backdrop** — in `src/ui/App.css`

Old:
```css
.settings-overlay__backdrop {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.55);
  backdrop-filter: blur(2px);
}
```

New (stronger blur than before because the page behind is busier now; third sanctioned blur surface, only exists while the modal is open):
```css
.settings-overlay__backdrop {
  position: absolute;
  inset: 0;
  background: var(--overlay-bg);
  -webkit-backdrop-filter: blur(var(--overlay-blur));
  backdrop-filter: blur(var(--overlay-blur));
}
```

- [ ] **Step 5: Float the dropzone** — in `src/ui/DropZone.css`

Old:
```css
  background:
    radial-gradient(120% 120% at 50% 0%, var(--accent-wash), transparent 60%),
    var(--surface);
```

New (the drag-over glow further down the file is transient interaction feedback — keep it untouched):
```css
  background:
    radial-gradient(120% 120% at 50% 0%, var(--accent-wash), transparent 60%),
    var(--panel-bg);
```

- [ ] **Step 6: Verify**

Run: `npx vitest run src/ui/TopBar.test.tsx src/ui/DropZone.test.tsx`
Expected: PASS.

Run: `npm run dev` — scroll the results page: top bar blurs the content sliding under it; active mode tab has a soft blue bloom; open Specs: backdrop dims + blurs the page; landing dropzone floats over the aurora.

- [ ] **Step 7: Commit**

```bash
git add src/ui/TopBar.css src/ui/App.css src/ui/DropZone.css
git commit -m "feat(ui): translucent chrome — blurred top bar, tokenized overlay, floating dropzone"
```

---

### Task 3: Hero — single severity blob, mono glowing metric

**Files:**
- Modify: `src/ui/HeroVerdict.tsx` (remove one line)
- Modify: `src/ui/HeroVerdict.css`
- Modify: `src/ui/HeroStats.css`
- Tests: `src/ui/HeroVerdict.test.tsx`, `src/ui/HeroStats.test.tsx`

Why: the new aurora puts a blue radial exactly where the hero sits (top-left), so the hero's own blue blob (`--cool`) now double-stacks blue-on-blue. Remove it; keep `--signal`, the verdict-colored blob — the aurora is verdict-agnostic and can't do that job. Bonus: halves the `blur(64px)` paint cost.

- [ ] **Step 1: Remove the cool blob span** — in `src/ui/HeroVerdict.tsx`

Old:
```tsx
      <div className="hero__ambient" aria-hidden="true">
        <span className="hero__blob hero__blob--cool" />
        <span className="hero__blob hero__blob--signal" />
      </div>
```

New:
```tsx
      <div className="hero__ambient" aria-hidden="true">
        <span className="hero__blob hero__blob--signal" />
      </div>
```

- [ ] **Step 2: Update the blob CSS** — in `src/ui/HeroVerdict.css`

Old (the file-top comment plus the two blob variants):
```css
/* The hero is a frosted readout floating over two soft color blobs — the blur has
   real color to refract instead of sitting on flat gray. Blobs use only sanctioned
   hues: the blue accent plus the run's severity tint (warm = heat/warning only). */
```

New:
```css
/* The hero is a frosted readout floating over one soft severity blob — the page
   aurora already supplies the blue; the blob adds the run's verdict tint so the
   glass refracts the call it's announcing (warm = heat/warning only). */
```

Old:
```css
.hero__blob--cool {
  left: -6%;
  background: var(--accent);
  opacity: 0.22;
}
.hero__blob--signal {
  right: -4%;
  background: var(--signal, var(--accent));
  opacity: 0.18;
}
```

New:
```css
.hero__blob--signal {
  right: -4%;
  background: var(--signal, var(--accent));
  opacity: 0.16;
}
```

- [ ] **Step 3: Make the headline metric mono and glowing** (glow list item 3) — same file

Old:
```css
.hero-verdict__metric {
  font-weight: 600;
}
.hero-verdict--good .hero-verdict__metric {
  color: var(--good);
}
.hero-verdict--warn .hero-verdict__metric {
  color: var(--warn);
}
.hero-verdict--bad .hero-verdict__metric {
  color: var(--bad);
}
```

New:
```css
.hero-verdict__metric {
  font-family: var(--font-mono);
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}
.hero-verdict--good .hero-verdict__metric {
  color: var(--good);
  text-shadow: 0 0 18px var(--good-glow);
}
.hero-verdict--warn .hero-verdict__metric {
  color: var(--warn);
  text-shadow: 0 0 18px var(--warn-glow);
}
.hero-verdict--bad .hero-verdict__metric {
  color: var(--bad);
  text-shadow: 0 0 18px var(--bad-glow);
}
```

(The good-tier metric glow is the one exception to "good stays calm": when the verdict
is good there is no other glow on screen and the single green number IS the verdict.
The good-tier *tile bars* still don't bloom — next step keeps that.)

- [ ] **Step 4: Retune the hero-stats tier blooms** — in `src/ui/HeroStats.css`

Old:
```css
.hero-stats .stat-tile--warn::before {
  background: var(--warn);
  box-shadow: 0 0 18px -4px var(--warn);
}
```

New:
```css
.hero-stats .stat-tile--warn::before {
  background: var(--warn);
  box-shadow: 0 0 10px var(--warn-glow);
}
```

Old:
```css
.hero-stats .stat-tile--bad::before {
  background: var(--bad);
  box-shadow: 0 0 18px -4px var(--bad);
}
```

New:
```css
.hero-stats .stat-tile--bad::before {
  background: var(--bad);
  box-shadow: 0 0 10px var(--bad-glow);
}
```

(`--good::before` has no box-shadow today and keeps none.)

- [ ] **Step 5: Verify**

Run: `npm run build`
Expected: clean — this catches the TSX edit under strict mode.

Run: `npx vitest run src/ui/HeroVerdict.test.tsx src/ui/HeroStats.test.tsx`
Expected: PASS (tests don't query the blob spans — but if one fails here, fix the test's expectations for the removed `--cool` span, nothing else).

Run: `npm run dev` — hero glass shows one verdict-tinted glow on its right side; the headline metric is mono with a soft severity bloom.

- [ ] **Step 6: Commit**

```bash
git add src/ui/HeroVerdict.tsx src/ui/HeroVerdict.css src/ui/HeroStats.css
git commit -m "feat(ui): hero over the aurora — single severity blob, mono glowing metric"
```

---

### Task 4: Findings rows float, dots stop glowing

**Files:**
- Modify: `src/ui/FindingsList.css`
- Tests: `src/ui/FindingsList.test.tsx`

- [ ] **Step 1: Panel rows + honest comment** — in `src/ui/FindingsList.css`

Old:
```css
/* Each finding reads as a row in a status log: a faint surface card with a
   severity-coded leading edge and a glowing indicator. */
.finding {
  display: flex;
  align-items: flex-start;
  gap: var(--s3);
  padding: var(--s3) var(--s4);
  background: var(--surface);
  border: 1px solid var(--border);
  border-left: 2px solid var(--text-mute);
  border-radius: var(--r-md);
}
```

New:
```css
/* Each finding reads as a row in a status log: a floating panel row with a
   severity-coded leading edge and a solid indicator dot. Dots don't glow —
   see the closed glow list in DESIGN.md. */
.finding {
  display: flex;
  align-items: flex-start;
  gap: var(--s3);
  padding: var(--s3) var(--s4);
  background: var(--panel-bg);
  border: 1px solid var(--panel-border);
  border-left: 2px solid var(--text-mute);
  border-radius: var(--r-md);
}
```

- [ ] **Step 2: De-glow all four dot variants** — same file, four edits

Old:
```css
.finding--info .finding__dot {
  background: var(--accent);
  box-shadow: 0 0 10px var(--accent);
}
```
New:
```css
.finding--info .finding__dot {
  background: var(--accent);
}
```

Old:
```css
.finding--warn .finding__dot {
  background: var(--warn);
  box-shadow: 0 0 10px var(--warn);
}
```
New:
```css
.finding--warn .finding__dot {
  background: var(--warn);
}
```

Old:
```css
.finding--bad .finding__dot {
  background: var(--bad);
  box-shadow: 0 0 10px var(--bad);
}
```
New:
```css
.finding--bad .finding__dot {
  background: var(--bad);
}
```

Old:
```css
.finding--healthy .finding__dot {
  background: var(--good);
  box-shadow: 0 0 10px var(--good);
}
```
New:
```css
.finding--healthy .finding__dot {
  background: var(--good);
}
```

- [ ] **Step 3: Verify**

Run: `npx vitest run src/ui/FindingsList.test.tsx`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/ui/FindingsList.css
git commit -m "feat(ui): findings rows float as panels, dots stop glowing"
```

---

### Task 5: Rewrite the design contract

**Files:**
- Modify: `src/ui/DESIGN.md` (full rewrite — replace the entire file with the content below)

- [ ] **Step 1: Replace the entire contents of `src/ui/DESIGN.md` with:**

```markdown
# WTFPS UI — visual contract

The aesthetic is **ambient glass**: a lit instrument room at night. A fixed blue aurora
glows behind everything; panels float over it as translucent layers; real frosted glass
is rationed to the few places it earns its cost; dense data sits on solid metal. Calm,
precise, legible. This file is the contract every component must follow. Read it before
writing any component.

## The surface hierarchy (the spine of the design)

1. **Atmosphere** — `--bg` + the aurora (`body::before`) + film grain (`body::after`).
   Fixed, static, **never animated**. The teal `--aurora-2` is atmosphere-ONLY: it must
   never appear on an interactive element or content surface (one accent stays one accent).
2. **Panel** (`--panel-bg` / `--panel-border`) — the translucent floating tier: `<Card>`,
   `<StatTile>`, finding rows, the dropzone. Panels do **NOT** use backdrop blur: behind
   them is only a smooth gradient + 5% grain, so alpha alone reads identically and avoids
   re-filtering every frame of the entrance animation. `--panel-blur` documents the
   intended depth for a future opt-in; do not apply it without a perf budget.
3. **Glass** (`--glass-*`, `--bar-*`, `--overlay-*`) — real backdrop blur on exactly three
   surfaces: the hero `GlassCard`, the sticky top bar, and the modal overlay backdrop.
   **Never more than 3 blur layers active at once.** Use `<GlassCard>` nowhere new.
4. **Solid** (`--surface*` / `--inset`) — anything dense: nerd cards (`.nerd-card` pins
   this), tables, the digest code well, chips, form inputs. **Never put dense data on a
   translucent surface.** Nerd mode is the instrument bench; it sits on solid metal.

## The closed glow list

Exactly five things glow. Nothing else. Ever.

1. The wordmark "F" (`.wordmark__f`)
2. The active mode tab (`.topbar__toggle .btn--accent`)
3. The severity metric in the hero headline (`.hero-verdict__metric`)
4. StatTile severity edge bars — warn/bad tiers only
5. The primary accent button (`--shadow-btn-accent`)

Rulings: transient interaction feedback (the dropzone drag-over bloom) is exempt.
Finding dots and time-split segments do **not** glow, even though older mockups showed
them. The good tier stays calm (no green blooms) except the hero headline metric.

## Hard constraints (do not violate)

- **One accent: `--accent` (#3b9eff).** No second brand hue. No purple gradients.
- **Heat stays warm.** `--good` green, `--warn` amber, `--bad` red; never drifting blue.
  Warm colors are semantics-only — never atmosphere.
- **Respect `prefers-reduced-motion`** (theme.css neutralizes globally; don't fight it).
  **Never animate large blurred surfaces. The atmosphere never moves.**

## The rule that keeps us cohesive

**Style only through tokens and primitives.** Every color, font, space, radius, shadow,
and duration is a CSS variable in `theme.css`. A component may have its own `*.css` file,
but it may reference **only `var(--…)` tokens** — never a hardcoded hex, px font-size, or
raw color. If you reach for a value that isn't a token, you're probably about to break
cohesion: compose a primitive instead, or ask the lead to add the token.

Do **not** edit `theme.css`, `cx.ts`, the primitives, or `Mascot.tsx` — import them. Need a
token or a primitive change? Send the lead a request (do not edit).

## Primitives (`src/ui/primitives`)

- `<Card>` — floating panel. The default container. `tone="inset"` for a recessed solid
  well (e.g. the digest code block).
- `<GlassCard>` — the frosted hero surface. Hero + modals only.
- `<StatTile label value severity sublabel?>` — one instrument readout. `value` is rendered
  in tabular mono; `severity` (`info|warn|bad`) tints the value + edge bar.
- `<Button variant>` — `accent` (primary CTA, dark text on blue), `ghost`, `subtle`.

Helpers: `cx(...)` to join class names; `<Mascot mood size?>` for the character.
Utility classes: `.mono` (tabular figures), `.u-label` (micro uppercase label), `.u-dim`,
`.stack`, `.wordmark` + `.wordmark__f` (the blue-F brand mark).

## Type

- Display (`--font-display`, Chakra Petch): wordmark, headings, buttons.
- Body (`--font-body`, Hanken Grotesk): labels, plain-language copy, findings, the hero
  headline (plain language, deliberately not the display face).
- Mono (`--font-mono`, JetBrains Mono): every number / readout / the digest text — including
  the hero headline metric. Always `font-variant-numeric: tabular-nums` (use `.mono`).

## Motion

Favor one orchestrated entrance over scattered micro-interactions: a brief staggered
reveal of panels on result-ready (use `--dur`/`--ease`, `animation-delay` per panel). Hover
states are subtle. All of it must collapse to nothing under reduced-motion. The
atmosphere is exempt from motion entirely because it has none.

## Tone of voice

Easy mode talks to a worried gamer, not an engineer: short, plain, reassuring sentences
with one concrete fix. Nerd mode is dense and exact. Never invent numbers the engine
didn't produce; show "—" / "no framerate logged" when a value is absent.
```

- [ ] **Step 2: Commit**

```bash
git add src/ui/DESIGN.md
git commit -m "docs(ui): rewrite DESIGN.md for the ambient glass contract"
```

---

### Task 6: Full verification pass

**Files:** none (verification only)

- [ ] **Step 1: Build + full test suite**

Run: `npm run build`
Expected: clean exit, no TS errors.

Run: `npm run test`
Expected: all test files pass, including the golden engine tests against `HWINFO samples/`.

- [ ] **Step 2: Manual visual matrix** — `npm run dev`, then walk:

- Landing: idle (aurora + grain visible, dropzone floats, wordmark F glows), drag-over (accent feedback), parsing state, error state (drop a non-CSV).
- Easy results: hero glass with one verdict-tinted blob; mono glowing headline metric; translucent stat tiles with warn/bad bar blooms; time-split, primary-fix, digest, specs cards all panel-style; digest code well solid near-black.
- Nerd results: findings rows panel-style with non-glowing dots; **all nerd cards opaque** (timeline, worst moments, core grid, sensor table, FPS detail, throttle flags).
- Settings modal: backdrop dims + blurs (8px), panel rises.
- Widths: ~560px, ~860px, ~900px (tile grid reflows, columns stack, tagline hides).

- [ ] **Step 3: Reduced motion**

DevTools → Rendering → "Emulate CSS prefers-reduced-motion: reduce". Reload: entrances and mascot bob collapse to instant; aurora/grain unchanged (they're static).

- [ ] **Step 4: Perf sanity**

- DevTools → Rendering → "Paint flashing": scroll the nerd results — the viewport-size aurora/grain layers must NOT flash (they would have with the old `background-attachment: fixed`).
- DevTools → Layers: exactly 2 backdrop-filter surfaces on the results screen (top bar + hero), 3 with the settings modal open.
- Performance trace of a fresh result render: the staggered entrance stays smooth (~60fps).

- [ ] **Step 5: Contrast spot-check**

Eyeball `--text-dim` text on panels in the brightest aurora corner (hero coverage line, top-left of page). The effective backdrop is still near-black; if anything reads washed, the fix is lowering `--aurora-1` alpha, not darkening the text.

---

## Out of scope now / roadmap (v2+)

- **Light theme** — explicitly deferred. The `--panel/--glass/--aurora` tokenization that lands here is its prerequisite; a light aurora is a separate design exercise.
- **Compare-runs screen** — will inherit panel styling via `<Card>` for free; its diff columns are dense data → solid tier per the contract.
- **Cap-confirm popup (planned Phase 3 feature)** — use the modal recipe: `--overlay-bg`/`--overlay-blur` backdrop + panel `<Card>`. It replaces the settings overlay's blur-budget slot, never adds a fourth.
- **`--panel-blur` opt-in** — if a future perf budget allows, applying it to `.card` is a one-line change; the token already records the intent.

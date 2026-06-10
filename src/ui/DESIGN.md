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

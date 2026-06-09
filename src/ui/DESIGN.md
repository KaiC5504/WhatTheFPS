# WTFPS UI — visual contract

The aesthetic is a **diagnostic control room**: a dark instrument panel for your PC's
telemetry. Calm, precise, legible. One frosted readout floating over solid matte panels.
This file is the contract every component must follow so the parallel-built UI stays one
coherent thing. Read it before writing any component.

## Hard constraints (from the product spec — do not violate)

- **Solid dark surfaces everywhere.** Frosted glass is used on the **hero card and modals
  ONLY**. Use `<GlassCard>` nowhere else.
- **Never put dense data on glass.** Numbers/tables live in solid `<Card>` / `<StatTile>`.
- **One accent: `--accent` (#3b9eff).** No second brand hue. No purple gradients.
- **Heat stays warm.** Semantic colors are `--good` (green), `--warn` (amber), `--bad`
  (red). They must never drift toward blue.
- **Respect `prefers-reduced-motion`** (theme.css already neutralizes transitions globally;
  don't fight it). **Never animate large blurred surfaces.**

## The rule that keeps us cohesive

**Style only through tokens and primitives.** Every color, font, space, radius, shadow,
and duration is a CSS variable in `theme.css`. A component may have its own `*.css` file,
but it may reference **only `var(--…)` tokens** — never a hardcoded hex, px font-size, or
raw color. If you reach for a value that isn't a token, you're probably about to break
cohesion: compose a primitive instead, or ask the lead to add the token.

Do **not** edit `theme.css`, `cx.ts`, the primitives, or `Mascot.tsx` — import them. Need a
token or a primitive change? Send the lead a request (do not edit).

## Primitives (`src/ui/primitives`)

- `<Card>` — solid panel. The default container for anything with content. `tone="inset"`
  for a recessed well (e.g. the digest code block).
- `<GlassCard>` — the single frosted surface. Hero + modals only.
- `<StatTile label value severity sublabel?>` — one instrument readout. `value` is rendered
  in tabular mono; `severity` (`info|warn|bad`) tints the value + edge bar.
- `<Button variant>` — `accent` (primary CTA, dark text on blue), `ghost`, `subtle`.

Helpers: `cx(...)` to join class names; `<Mascot mood size?>` for the character.
Utility classes: `.mono` (tabular figures), `.u-label` (micro uppercase label), `.u-dim`,
`.stack`, `.wordmark` + `.wordmark__f` (the blue-F brand mark).

## Type

- Display (`--font-display`, Chakra Petch): wordmark, headings, hero headline, buttons.
- Body (`--font-body`, Hanken Grotesk): labels, plain-language copy, findings.
- Mono (`--font-mono`, JetBrains Mono): every number / readout / the digest text. Always
  `font-variant-numeric: tabular-nums` (use `.mono`).

## Motion

Favor one orchestrated entrance over scattered micro-interactions: a brief staggered
reveal of panels on result-ready (use `--dur`/`--ease`, `animation-delay` per panel). Hover
states are subtle. All of it must collapse to nothing under reduced-motion.

## Tone of voice

Easy mode talks to a worried gamer, not an engineer: short, plain, reassuring sentences
with one concrete fix. Nerd mode is dense and exact. Never invent numbers the engine
didn't produce; show "—" / "no framerate logged" when a value is absent.

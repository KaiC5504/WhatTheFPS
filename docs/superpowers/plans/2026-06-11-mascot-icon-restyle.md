# Mascot + Logo Restyle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the in-app mascot (`src/ui/Mascot.tsx`) and the app icon (`public/wtfps-icon.svg`) read as the same character: big white oval eyes with tinted pupils + eye-shine, and an FPS-waveform mouth with an orange "frame drop" dot.

**Architecture:** Two independent assets, no shared code. The mascot keeps its component API (`mood`, `size`), its monitor-creature body, and its mood machinery (tint, flame, sweat, brows) — only the face geometry changes, driven by two per-mood lookup tables (`EYE`, `WAVE`). The icon is a standalone SVG file rewritten as the creature's face cropped to the rounded-square tile ("the tile is the head"). `index.html` (favicon) and `README.md` (header) already reference the icon file by path, so they need no changes.

**Tech Stack:** React 18 + TypeScript 5 (strict), Vitest + Testing Library (jsdom for `src/ui/**`), plain SVG.

**Spec:** `docs/superpowers/specs/2026-06-11-mascot-icon-restyle-design.md` (user-approved). Key decisions: icon face on the monitor body; waveform mouth tints with mood (blue/amber/red) and changes shape per mood (healthy spike / frame-drop dip / crash); orange dot stays `#ff7a18` in all moods; icon becomes the head-as-tile crop, chill mood.

**Project rules that apply here:**
- Colors in components must be theme tokens (`var(--…)`) — the only allowed hardcoded hexes in `Mascot.tsx` are the flame (`#ff8a3d`, `#ffd24a`) and the orange dot (`#ff7a18`), matching the existing flame precedent. The standalone icon file uses hardcoded hexes (no CSS vars available there).
- `src/ui/DESIGN.md` says "do not edit Mascot.tsx"; the user explicitly approved this change as an exception. Do not edit `theme.css`, `cx.ts`, or `primitives/`.
- Tests for `src/ui/**` run under jsdom (configured in `vitest.config.ts`) — no setup needed.

---

### Task 1: Restyle the Mascot face

**Files:**
- Modify: `src/ui/Mascot.test.tsx`
- Modify: `src/ui/Mascot.tsx` (full rewrite of file contents, component API unchanged)

- [ ] **Step 1: Add the failing test**

In `src/ui/Mascot.test.tsx`, add this test inside the existing `describe('Mascot', …)` block, after the `'tints by mood — panic uses the bad token'` test:

```tsx
  it('renders the waveform mouth with the frame-drop dot in every mood', () => {
    (['chill', 'concerned', 'panic'] as const).forEach((mood) => {
      const { container, unmount } = render(<Mascot mood={mood} />);
      const wave = container.querySelector('[data-part="waveform"]');
      expect(wave, `waveform missing for ${mood}`).not.toBeNull();
      expect(wave?.querySelector('polyline')).not.toBeNull();
      expect(wave?.querySelector('circle[fill="#ff7a18"]')).not.toBeNull();
      unmount();
    });
  });
```

The rest of the file stays exactly as it is — the three existing tests (`data-mood` attribute, flame only on panic, `var(--bad)` tint) remain valid against the new face.

- [ ] **Step 2: Run the test file to verify the new test fails**

Run: `npx vitest run src/ui/Mascot.test.tsx`

Expected: 3 tests PASS, the new test FAILS with `waveform missing for chill` (the current component has no `data-part="waveform"` element).

- [ ] **Step 3: Rewrite the Mascot face**

Replace the **entire contents** of `src/ui/Mascot.tsx` with:

```tsx
import type { MascotMood } from '../types';

interface MascotProps {
  mood: MascotMood;
  size?: number;
}

const TINT: Record<MascotMood, string> = {
  chill: 'var(--accent)',
  concerned: 'var(--warn)',
  panic: 'var(--bad)',
};

// Per-mood eye geometry: center height, openness, pupil vertical offset, pupil radius.
const EYE: Record<MascotMood, { cy: number; ry: number; py: number; pr: number }> = {
  chill: { cy: 44, ry: 9.5, py: 2.8, pr: 3.7 },
  concerned: { cy: 44, ry: 11, py: 3, pr: 3.7 },
  panic: { cy: 43, ry: 12.5, py: 0.5, pr: 3 },
};

// The mouth is an FPS trace: a healthy spike when chill, a frame-drop dip when
// concerned, a crash when panicking. The orange dot marks the extreme frame.
const WAVE: Record<MascotMood, { points: string; dotX: number; dotY: number }> = {
  chill: {
    points: '31,63 37,63 42,60.8 46,65 50,57 54,65 58,60.8 63,63 69,63',
    dotX: 50,
    dotY: 57,
  },
  concerned: {
    points: '31,61.5 36,61.5 41,63.5 45,60 50,67.5 55,60 59,63.5 64,61.5 69,61.5',
    dotX: 50,
    dotY: 67.5,
  },
  panic: {
    points: '31,60 35,65 39,57 43,66.5 47,56.5 50,68 54,57 58,66 62,58 66,64.5 69,60.5',
    dotX: 50,
    dotY: 68,
  },
};

// "WTFPS" mascot: a little monitor-creature whose face reports how the run went.
// Face language matches public/wtfps-icon.svg: big white eyes, tinted pupils,
// waveform mouth. chill = calm blue, concerned = amber + sweat, panic = red + flame.
export function Mascot({ mood, size = 116 }: MascotProps) {
  const tint = TINT[mood];
  const eye = EYE[mood];
  const wave = WAVE[mood];

  return (
    <svg
      data-mood={mood}
      role="img"
      aria-label={`mascot feeling ${mood}`}
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      {mood === 'panic' && (
        <g data-part="flame">
          <path d="M50 1 C43 11 39 16 39 23 a11 11 0 0 0 22 0 C61 16 57 11 50 1 Z" fill="#ff8a3d" />
          <path d="M50 9 C46 15 44 18 44 22 a6 6 0 0 0 12 0 C56 18 54 15 50 9 Z" fill="#ffd24a" />
        </g>
      )}

      {/* chassis + monitor stand */}
      <rect x={32} y={78} width={36} height={6} rx={3} fill="var(--surface-3)" />
      <rect x={45} y={73} width={10} height={8} fill="var(--surface-3)" />
      <rect
        x={16}
        y={20}
        width={68}
        height={58}
        rx={16}
        fill="var(--surface-2)"
        stroke="var(--border-strong)"
        strokeWidth={2}
      />
      {/* screen well */}
      <rect x={23} y={27} width={54} height={44} rx={11} fill="var(--inset)" />
      {/* status LED, lit in the mood color (hidden behind the flame on panic) */}
      {mood !== 'panic' && <circle cx={50} cy={16} r={2.4} fill={tint} />}

      {/* eyes */}
      <ellipse cx={39} cy={eye.cy} rx={8} ry={eye.ry} fill="var(--text)" />
      <ellipse cx={61} cy={eye.cy} rx={8} ry={eye.ry} fill="var(--text)" />
      <circle cx={39.7} cy={eye.cy + eye.py} r={eye.pr} fill={tint} />
      <circle cx={61.7} cy={eye.cy + eye.py} r={eye.pr} fill={tint} />
      {/* eye-shine sits on the pupil so it reads against the white sclera */}
      <circle cx={38.3} cy={eye.cy + eye.py - 1.4} r={1.3} fill="var(--text)" />
      <circle cx={60.3} cy={eye.cy + eye.py - 1.4} r={1.3} fill="var(--text)" />

      {/* worried brows for the unhappy moods (inner corners raised) */}
      {mood === 'concerned' && (
        <g stroke={tint} strokeWidth={2.4} strokeLinecap="round">
          <path d="M32 33 L45 30" />
          <path d="M55 30 L68 33" />
        </g>
      )}
      {mood === 'panic' && (
        <g stroke={tint} strokeWidth={2.6} strokeLinecap="round">
          <path d="M31 31.5 L45 27.5" />
          <path d="M55 27.5 L69 31.5" />
        </g>
      )}

      {/* waveform mouth: the FPS trace this mood is living through */}
      <g data-part="waveform">
        <polyline
          points={wave.points}
          fill="none"
          stroke={tint}
          strokeWidth={2.4}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx={wave.dotX} cy={wave.dotY} r={2.1} fill="#ff7a18" />
      </g>

      {/* a bead of sweat when merely concerned */}
      {mood === 'concerned' && (
        <path d="M76 44 C76 48 73 49 73 49 C73 49 70 48 70 44 C70 41 73 39 73 39 C73 39 76 41 76 44 Z" fill="var(--accent)" />
      )}
    </svg>
  );
}
```

What changed vs. the old file, for review context:
- `EYE` gained `cy` (panic raises the eyes to 43) and the values grew to icon scale (ry 5.5/7/8.4 → 9.5/11/12.5; pupils r 3 → 3.7, panic 3); eye whites are now rx 8 ovals at cy `eye.cy` instead of rx 7 at fixed cy 47.
- New eye-shine circles on each pupil (offset −1.4, −1.4 from pupil center).
- The `MOUTH` record (smile / flat / open-mouth ellipse) is replaced by the `WAVE` record rendered as a tinted polyline + orange dot inside `<g data-part="waveform">`.
- Brows moved up to clear the bigger eyes (concerned `M32 33 L45 30` / `M55 30 L68 33`; panic `M31 31.5 L45 27.5` / `M55 27.5 L69 31.5`).
- The sweat drop moved from x 67–73 to x 70–76 so it clears the wider right eye.
- Chassis, stand, screen well, LED, flame, props, and the root `<svg>` attributes are byte-identical to before.

- [ ] **Step 4: Run the test file to verify all tests pass**

Run: `npx vitest run src/ui/Mascot.test.tsx`

Expected: 4 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/ui/Mascot.tsx src/ui/Mascot.test.tsx
git commit -m "feat(ui): restyle mascot face to match app icon (waveform mouth, icon eyes)"
```

---

### Task 2: Rewrite the app icon as the head-as-tile crop

**Files:**
- Modify: `public/wtfps-icon.svg` (full file replacement)

No unit test exists or is warranted for a static asset; verification is visual + the golden build in Task 3. `index.html` line 5 (favicon link) and `README.md` line 1 (header img) already point at this path — do not edit them.

- [ ] **Step 1: Replace the icon**

Old contents (for reference, being replaced):

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512" role="img" aria-label="WTFPS">
  <rect width="512" height="512" rx="112" fill="#0b0d14"/>
  <ellipse cx="212" cy="216" rx="46" ry="54" fill="#ffffff"/>
  <ellipse cx="300" cy="216" rx="46" ry="54" fill="#ffffff"/>
  <circle cx="216" cy="232" r="21" fill="#3b9eff"/>
  <circle cx="304" cy="232" r="21" fill="#3b9eff"/>
  <circle cx="200" cy="200" r="7" fill="#ffffff"/>
  <circle cx="288" cy="200" r="7" fill="#ffffff"/>
  <polyline points="116,360 156,360 190,344 226,374 256,300 286,374 322,344 360,360 396,360"
            fill="none" stroke="#3b9eff" stroke-width="14" stroke-linecap="round" stroke-linejoin="round"/>
  <circle cx="256" cy="300" r="13" fill="#ff7a18"/>
</svg>
```

Replace the **entire contents** of `public/wtfps-icon.svg` with:

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512" role="img" aria-label="WTFPS">
  <rect width="512" height="512" rx="112" fill="#1a1f2e"/>
  <rect x="41" y="61" width="430" height="389" rx="72" fill="#0e1119"/>
  <circle cx="256" cy="33" r="15" fill="#3b9eff"/>
  <ellipse cx="174" cy="205" rx="61" ry="74" fill="#ffffff"/>
  <ellipse cx="338" cy="205" rx="61" ry="74" fill="#ffffff"/>
  <circle cx="179" cy="227" r="28" fill="#3b9eff"/>
  <circle cx="343" cy="227" r="28" fill="#3b9eff"/>
  <circle cx="168" cy="216" r="10" fill="#ffffff"/>
  <circle cx="332" cy="216" r="10" fill="#ffffff"/>
  <polyline points="82,358 133,358 174,340 215,374 256,307 297,374 338,340 379,358 430,358"
            fill="none" stroke="#3b9eff" stroke-width="20" stroke-linecap="round" stroke-linejoin="round"/>
  <circle cx="256" cy="307" r="18" fill="#ff7a18"/>
</svg>
```

Anatomy (chill mood, "the tile is the head"): tile = chassis `#1a1f2e` (surface-2), inset screen well `#0e1119` (inset), blue LED centered on the top bezel, white eyes with accent pupils + white eye-shine on the pupils, accent waveform with the orange dot on the healthy-spike peak. Hexes intentionally hardcoded — this file can't see CSS tokens.

- [ ] **Step 2: Commit**

```bash
git add public/wtfps-icon.svg
git commit -m "feat(ui): redraw app icon as the mascot's head (tile-is-the-head crop)"
```

---

### Task 3: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Run the whole test suite**

Run: `npm run test`

Expected: all test files pass (the golden engine tests, UI tests, etc. — nothing besides `Mascot.test.tsx` should even be affected).

- [ ] **Step 2: Typecheck + production build**

Run: `npm run build`

Expected: `tsc -b` emits no errors (strict mode, `noUnusedLocals` — note the old `MOUTH` record must be fully gone, not orphaned) and `vite build` completes.

- [ ] **Step 3: Visual smoke check**

Run: `npm run dev`, open the local URL and verify:
- Browser tab favicon shows the new head-as-tile icon.
- Landing page mascot (chill) shows the big eyes + blue waveform mouth with orange dot.
- Drop any CSV from `HWINFO samples/` and check the hero verdict mascot renders in whichever mood the log produces; if you want to see all three moods quickly, temporarily render `<Mascot mood="concerned" />` / `"panic"` in `App.tsx` — but revert before committing (verify `git status` is clean afterwards).

No commit in this task.

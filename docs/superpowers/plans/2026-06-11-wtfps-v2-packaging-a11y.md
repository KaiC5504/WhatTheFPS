# WTFPS v2 #6 — PWA/Offline Packaging + Accessibility Pass Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship WTFPS as an installable, fully offline PWA (precache-everything service worker, manifest, real icons, polite update flow) and close out a full accessibility pass: correct toggle semantics, a reusable modal focus-trap hook, skip link, live-region announcements, non-color severity cues, visible focus rings, and an automated axe smoke suite backed by a committed manual checklist.

**Baseline:** This plan assumes v2 plans **#1–#5 are merged**. Specifically it builds on:
- From **#1**: `src/ui/RunsPanel.tsx` — a modal overlay (run comparison) with its own open/close state. This plan's `useModal` hook retrofits it.
- From **#2**: the Nerd-mode `Timeline` with **From/To time inputs** as its keyboard-accessible path. This plan only *verifies* that path (checklist item), it adds no new Timeline work.
- Everything from v1.5 phases 1–3 (windowed engine, verdict/digest, ambient-glass UI).

Where this plan touches #1/#2 files it cannot quote verbatim (they merged after this plan was written), it gives the exact pattern plus a test that pins the required outcome — adapt class/prop names to the merged markup, nothing else.

**Architecture:** Two independent strands. (1) *Packaging:* `vite-plugin-pwa` in `generateSW` mode wraps the existing build — no runtime code changes except a new `<PwaToast>` component fed by `useRegisterSW`; tests resolve the plugin's virtual module through a vitest alias to a stub. (2) *Accessibility:* a new `src/ui/useModal.ts` hook centralizes dialog focus behavior for the App settings overlay and `RunsPanel`; small semantic fixes land in `TopBar`, `App`, `FindingsList`, `HeroStats`; `src/ui/a11y.test.tsx` runs axe over the three top-level screens.

**Tech Stack:** TypeScript 5 strict, React 18, Vite ^5.4, Vitest ^2.0.5. New devDependencies (versions chosen against the pinned Vite/Vitest):
- `vite-plugin-pwa@^0.21.2` — last minor line whose peer range is `vite ^3.1 || ^4 || ^5 || ^6` **and** which still bundles `workbox-build`/`workbox-window` ^7.3 as real dependencies (the 1.x line moves workbox to peerDependencies and targets newer stacks; with Vite pinned at ^5.4 there is no benefit to chasing it).
- `@vite-pwa/assets-generator@^0.2.6` — the optional-peer range declared by `vite-plugin-pwa@0.21.x`.
- `vitest-axe@^0.1.0` — latest stable (the 1.0.0 line is still `-pre`); peer `vitest >=0.16.0`, fine with 2.0.5.

**No spec exists for this item** — the Design decisions section below *is* the spec. Read `CLAUDE.md` and `src/ui/DESIGN.md` before starting; the frozen-file rules there are hard constraints (`theme.css`, `cx.ts`, `src/ui/primitives/`, `Mascot.tsx` are read-only).

**Out of scope:** Tauri/desktop packaging, share-links, periodic background SW update polling (all listed under Future/stretch), automated color-contrast testing in jsdom (manual DevTools audit instead), any engine/digest change, any change to frozen UI files.

---

## Design decisions

1. **`vite-plugin-pwa` (workbox `generateSW`) over a hand-rolled service worker.** The error-prone part of hand-rolling is keeping the precache manifest in sync with Vite's hashed output filenames on every build; the plugin derives it from the build automatically. Configuration:
   - `registerType: 'prompt'` — **never** auto-swap code under a user mid-analysis. The user gets an "Update available" toast with an explicit Reload button.
   - `workbox: { globPatterns: ['**/*.{js,css,html,svg,woff2,png,webmanifest}'], navigateFallback: 'index.html' }`.
   - **No runtime caching routes.** The app makes zero network calls at runtime; precaching everything *is* the offline strategy. Adding runtime caching would be dead code.
   - Manifest: `name: 'WTFPS — what the FPS'`, `short_name: 'WTFPS'`, `display: 'standalone'`, `theme_color`/`background_color` = `#07090f` (the `--bg` token from `src/ui/theme.css` — a manifest is not CSS, so the hex is copied with a comment naming the source token).
   - Deployment target is unknown → Vite `base` stays at the default `'/'`. **Note for a future subpath deploy** (e.g. GitHub Pages): set `base` in `vite.config.ts` and re-check `navigateFallback` against it; both are root-relative today.

2. **Icons are generated once and committed.** `@vite-pwa/assets-generator` is a devDependency with an `npm run icons` script that renders from the existing `public/wtfps-icon.svg`: 192 + 512 standard, 512 maskable, 180 apple-touch (the `minimal-2023` preset; it also emits a 64px PNG and `favicon.ico`, which are harmless and kept). Generated PNGs are **committed** — no build-time generation, so `npm run build` stays deterministic and sharp never runs in CI. **Design-review flag:** the mascot-head icon fills its canvas edge-to-edge (antenna dot at y≈33 of 512); the maskable variant's ~80% safe zone will crop it without padding. The assets config sets `padding: 0.3` and a checkbox below requires a human eyeball on the maskable output (e.g. maskable.app) — padding is tuned by review, never silent stretching.

3. **`src/ui/PwaToast.tsx`** consumes `useRegisterSW` from `virtual:pwa-register/react`. One always-mounted `role="status"` / `aria-live="polite"` region (mounted-before-content so screen readers announce insertions) showing: "Ready to work offline." (auto-dismiss after ~4 s) and "Update available." with a Reload `<Button variant="accent">` that calls `updateServiceWorker(true)`. Surface is **solid** (`--surface-2`, `--shadow-pop`): the toast is not on `DESIGN.md`'s closed glow list and gets **no glow, no frosted glass**; tokens only.

4. **Accessibility audit findings — each maps to a task below:**
   - (a) **TopBar misuses the tab pattern** (`role="tablist"`/`role="tab"` with *both* `aria-pressed` and `aria-selected`, no `tabpanel`, no arrow-key nav). Easy/Nerd is a mode toggle, not tabs → plain buttons with `aria-pressed` only, wrapped in `role="group"`. → Task 2.
   - (b) **No focus management on dialogs.** The settings overlay has `role="dialog"` + `aria-modal` but no focus trap, no Escape, no focus restore; ditto RunsPanel. → new `src/ui/useModal.ts`: `useModal({ open, onClose }: { open: boolean; onClose: () => void }): { ref: RefObject<HTMLElement> }` — focus moves into the dialog on open, Tab/Shift-Tab cycle inside, Escape calls `onClose`, focus restores to the opener on close. Adopted by **both** the App settings overlay and RunsPanel. → Task 1.
   - (c) **Skip link.** "Skip to results" as the first focusable element before `TopBar`, targeting `#main` (id added to the main content container). → Task 2.
   - (d) **Status announcements.** An `aria-live="polite"` status region announces the `'parsing'` state ("Analyzing your log…"). The existing `role="alert"` error stays as-is. → Task 2.
   - (e) **Color-only severity.** Finding dots and stat-tile tiers communicate severity by color alone → visually-hidden severity words ("warning:", "critical:") at the `FindingsList`/`HeroStats` call sites via a `.sr-only` utility. `theme.css` has no such utility and is frozen → it is defined in `src/ui/App.css` (a file this plan owns). → Task 3.
   - (f) **Visible focus.** `theme.css` already gives `.btn` and the `controls.tsx` checkbox a focus ring; interactive elements *not* composed from those (RunsPanel rows, Timeline From/To inputs, any chip-like control from #1/#2) need explicit `:focus-visible` rules using `var(--accent-line)` in their owner component CSS. → Task 3.
   - (g) **Timeline keyboard path** (From/To text inputs) shipped in plan #2 — this plan's checklist *verifies* it; no new work. → Task 6.

5. **Testing strategy.** Automated: `vitest-axe` smoke file `src/ui/a11y.test.tsx` runs axe on Landing, Results-easy, and Results-nerd (built from `src/ui/_fixtures.ts`), with the `color-contrast` rule **disabled** — axe's contrast check needs real layout/canvas and is unreliable in jsdom; contrast is covered by a one-time manual DevTools audit in the checklist instead (the test file says so in a comment). Whatever violations axe surfaces get fixed as part of that task (frozen files are fixed at their call sites, never edited). Manual: a committed `docs/a11y-checklist.md` — keyboard-only walkthrough, NVDA pass, 200% zoom, `prefers-reduced-motion`, plus the PWA steps (`npm run build && npm run preview`, DevTools offline reload, install prompt, update prompt after a rebuild). **PWA correctness is inherently manual** — a service worker never runs inside Vitest/jsdom; the checklist is the real verification, and the plan treats it as a first-class deliverable, not an afterthought.

---

## File map

| File | Action | Responsibility |
|---|---|---|
| `src/ui/useModal.ts` | create | Dialog focus trap: focus-in, Tab cycle, Escape, focus restore |
| `src/ui/useModal.test.tsx` | create | RTL coverage of all four behaviors |
| `src/App.tsx` | modify | Skip link, `#main`, status live region, settings overlay → `useModal`, mount `<PwaToast>` |
| `src/App.test.tsx` | modify | Mutable hook mock; skip-link / status / dialog-focus tests; `tab`→`button` queries |
| `src/ui/RunsPanel.tsx` (+ test) | modify | Adopt `useModal` (retrofit of plan #1's modal) |
| `src/ui/TopBar.tsx` | modify | Drop tablist/tab/aria-selected; toggle buttons + `aria-pressed` in a `role="group"` |
| `src/ui/TopBar.test.tsx` | modify | Assert the new semantics; `tab`→`button` queries |
| `src/ui/FindingsList.tsx` (+ test) | modify | `.sr-only` severity words before finding text |
| `src/ui/HeroStats.tsx` (+ test) | modify | `.sr-only` severity words inside warn/bad tile status |
| `src/ui/App.css` | modify | `.skip-link`, `.sr-only`, `#main` focus suppression |
| `src/ui/RunsPanel.css`, timeline CSS from #2 | modify | `:focus-visible` rules via `var(--accent-line)` |
| `src/test/setup.ts` | modify | Register vitest-axe matchers + type augmentation |
| `src/ui/a11y.test.tsx` | create | axe smokes: Landing / Results-easy / Results-nerd |
| `package.json` | modify | New devDeps; `icons` script |
| `pwa-assets.config.ts` | create | Icon generation preset (padding + `--bg` background) |
| `public/pwa-*.png`, `maskable-icon-512x512.png`, `apple-touch-icon-180x180.png`, `favicon.ico` | create (generated) | Committed PWA icons |
| `vite.config.ts` | modify | `VitePWA` block: manifest + workbox precache |
| `index.html` | modify | `theme-color` meta, apple-touch-icon link |
| `src/vite-env.d.ts` | create | Type refs for `vite/client` + `vite-plugin-pwa/react` |
| `vitest.config.ts` | modify | Alias `virtual:pwa-register/react` → test stub |
| `src/test/pwa-register-mock.ts` | create | Inert `useRegisterSW` stub for tests |
| `src/ui/PwaToast.tsx` / `.css` / `.test.tsx` | create | Offline-ready + update-available toast |
| `tsconfig.node.json` | modify | Include `pwa-assets.config.ts` |
| `docs/a11y-checklist.md` | create | Committed manual a11y + PWA checklist |

Run all tests with `npm run test`; single file with `npx vitest src/ui/useModal.test.tsx`. Typecheck via `npm run build`. Commit messages are single-line conventional commits, **no Co-Authored-By trailer**.

---

### Task 1: `useModal` — focus management for every dialog

**Files:**
- Create: `src/ui/useModal.ts`
- Create: `src/ui/useModal.test.tsx`
- Modify: `src/App.tsx` (settings overlay), `src/App.test.tsx`
- Modify: `src/ui/RunsPanel.tsx` + its test (retrofit)

- [ ] **Step 1: Write failing tests — `src/ui/useModal.test.tsx`**

```tsx
import { useState } from 'react';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, afterEach } from 'vitest';
import { useModal } from './useModal';

function Harness() {
  const [open, setOpen] = useState(false);
  const { ref } = useModal<HTMLDivElement>({ open, onClose: () => setOpen(false) });
  return (
    <div>
      <button onClick={() => setOpen(true)}>open dialog</button>
      {open && (
        <div ref={ref} role="dialog" aria-modal="true" aria-label="test dialog">
          <button>first</button>
          <input aria-label="middle" />
          <button>last</button>
        </div>
      )}
    </div>
  );
}

describe('useModal', () => {
  afterEach(cleanup);

  it('moves focus into the dialog on open', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole('button', { name: 'open dialog' }));
    expect(screen.getByRole('button', { name: 'first' })).toHaveFocus();
  });

  it('Tab wraps from the last focusable back to the first', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole('button', { name: 'open dialog' }));
    screen.getByRole('button', { name: 'last' }).focus();
    await user.tab();
    expect(screen.getByRole('button', { name: 'first' })).toHaveFocus();
  });

  it('Shift-Tab wraps from the first focusable to the last', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole('button', { name: 'open dialog' }));
    await user.tab({ shift: true });
    expect(screen.getByRole('button', { name: 'last' })).toHaveFocus();
  });

  it('Escape closes and focus returns to the opener', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const opener = screen.getByRole('button', { name: 'open dialog' });
    await user.click(opener);
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(opener).toHaveFocus();
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest src/ui/useModal.test.tsx` → FAIL (module not found).

- [ ] **Step 3: Implement `src/ui/useModal.ts`**

```ts
import { useEffect, useRef } from 'react';
import type { RefObject } from 'react';

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), ' +
  'textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

// Focus contract for role="dialog" overlays: focus the first focusable on open,
// keep Tab/Shift-Tab inside, close on Escape, hand focus back to the opener.
// The generic exists only so call sites can attach the ref to a concrete element
// type without a cast; the default keeps the public shape RefObject<HTMLElement>.
export function useModal<T extends HTMLElement = HTMLElement>({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}): { ref: RefObject<T> } {
  const ref = useRef<T>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    const node = ref.current;
    if (!node) return;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;

    const focusables = () => Array.from(node.querySelectorAll<HTMLElement>(FOCUSABLE));
    (focusables()[0] ?? node).focus();

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (e.key !== 'Tab') return;
      const els = focusables();
      if (els.length === 0) {
        e.preventDefault();
        return;
      }
      const first = els[0];
      const last = els[els.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && (active === first || active === node)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    }

    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
      opener?.focus();
    };
  }, [open]);

  return { ref };
}
```

Run: `npx vitest src/ui/useModal.test.tsx` → PASS.

- [ ] **Step 4: Failing test for the settings overlay — append to `src/App.test.tsx`**

```tsx
  it('settings overlay traps focus, closes on Escape, restores focus to the opener', async () => {
    const user = userEvent.setup();
    render(<App />);
    const opener = screen.getByRole('button', { name: /specs/i });
    await user.click(opener);
    const dialog = screen.getByRole('dialog', { name: /system specs/i });
    expect(dialog.contains(document.activeElement)).toBe(true);
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog', { name: /system specs/i })).toBeNull();
    expect(opener).toHaveFocus();
  });
```

Run: `npx vitest src/App.test.tsx` → the new test FAILS (no trap, no Escape).

- [ ] **Step 5: Adopt in `src/App.tsx`**

Add the import and hook call inside `App()`:

```tsx
import { useModal } from './ui/useModal';
```

```tsx
  const settingsModal = useModal<HTMLDivElement>({
    open: settingsOpen,
    onClose: () => setSettingsOpen(false),
  });
```

Attach the ref to the dialog container (everything else in the overlay JSX is unchanged):

```tsx
      {settingsOpen && (
        <div
          ref={settingsModal.ref}
          className="settings-overlay"
          role="dialog"
          aria-modal="true"
          aria-label="System specs"
        >
          <div className="settings-overlay__backdrop" onClick={() => setSettingsOpen(false)} />
          <div className="settings-overlay__panel">
            <SpecsCard specs={specs ?? EMPTY_SPECS} onChange={setSpecs} />
            <div className="settings-overlay__actions">
              <Button variant="accent" onClick={() => setSettingsOpen(false)}>Done</Button>
            </div>
          </div>
        </div>
      )}
```

Run: `npx vitest src/App.test.tsx` → PASS.

- [ ] **Step 6: Retrofit `src/ui/RunsPanel.tsx` (plan #1's modal)**

Append an equivalent test to `src/ui/RunsPanel.test.tsx`, adapting the trigger/dialog queries to the merged markup — the required outcome is identical to Step 4:

```tsx
  it('traps focus, closes on Escape, restores focus to the opener', async () => {
    const user = userEvent.setup();
    // render RunsPanel through its real opener (or directly with open=true plus a
    // focused trigger button in the test DOM, matching the file's existing tests)
    // 1. open the panel
    // 2. expect(dialog.contains(document.activeElement)).toBe(true)
    // 3. await user.keyboard('{Escape}') → panel unmounts / onClose called
    // 4. expect(opener).toHaveFocus()
  });
```

Verify it FAILS, then apply the same pattern as the settings overlay: import `useModal`, call it with the panel's existing `open`/`onClose` (or equivalent state + close callback), attach `ref` to the panel's `role="dialog"` container. **Delete any ad-hoc Escape `onKeyDown` handler the panel grew in plan #1** — the hook owns that now. If the panel's container lacks `role="dialog"`/`aria-modal="true"`, add them. Run: `npx vitest src/ui/RunsPanel.test.tsx` → PASS.

- [ ] **Step 7: Full suite, then commit**

Run: `npm run test` → green.

```bash
git add src/ui/useModal.ts src/ui/useModal.test.tsx src/App.tsx src/App.test.tsx src/ui/RunsPanel.tsx src/ui/RunsPanel.test.tsx
git commit -m "feat(ui): useModal focus trap adopted by settings overlay and runs panel"
```

---

### Task 2: TopBar toggle semantics, skip link, parsing announcement

**Files:**
- Modify: `src/ui/TopBar.tsx`, `src/ui/TopBar.test.tsx`
- Modify: `src/App.tsx`, `src/App.test.tsx`
- Modify: `src/ui/App.css`

- [ ] **Step 1: Write failing tests**

In `src/ui/TopBar.test.tsx`, replace every `getByRole('tab', …)` with `getByRole('button', …)` in the four mode tests, and add:

```tsx
  it('exposes the mode switch as toggle buttons, not tabs', () => {
    const { container } = render(<TopBar mode="easy" onModeChange={vi.fn()} />);
    expect(container.querySelector('[role="tablist"]')).toBeNull();
    expect(container.querySelector('[role="tab"]')).toBeNull();
    expect(container.querySelector('[aria-selected]')).toBeNull();
    const scope = within(container as HTMLElement);
    expect(scope.getByRole('button', { name: 'Easy' })).toHaveAttribute('aria-pressed', 'true');
    expect(scope.getByRole('button', { name: 'Nerd' })).toHaveAttribute('aria-pressed', 'false');
    expect(scope.getByRole('group', { name: /view mode/i })).toBeInTheDocument();
  });
```

In `src/App.test.tsx`, first make the hook mock state-driven so one file covers ready *and* parsing (replace the existing `vi.mock` block):

```tsx
const mock = vi.hoisted(() => ({
  state: { status: 'ready' as 'idle' | 'parsing' | 'ready' | 'error', error: null as string | null },
}));

// Drive the whole app off a deterministic fixture result, bypassing the worker by
// mocking the analysis hook. mock.state lets individual tests pick the phase.
vi.mock('./ui/useAnalysis', async () => {
  const { fixtureResult } = await import('./ui/_fixtures');
  const result = fixtureResult();
  return {
    useAnalysis: () => ({
      status: mock.state.status,
      result: mock.state.status === 'ready' ? result : null,
      error: mock.state.error,
      analyzeFile: vi.fn(),
      reset: vi.fn(),
    }),
  };
});
```

Add `beforeEach` inside the describe block:

```tsx
  beforeEach(() => {
    mock.state.status = 'ready';
    mock.state.error = null;
  });
```

Update the existing nerd-mode test's query: `screen.getByRole('tab', { name: 'Nerd' })` → `screen.getByRole('button', { name: 'Nerd' })`. Then append:

```tsx
  it('skip link is the first tab stop and targets #main', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.tab();
    const link = screen.getByRole('link', { name: /skip to results/i });
    expect(link).toHaveFocus();
    expect(link).toHaveAttribute('href', '#main');
    expect(document.getElementById('main')).not.toBeNull();
  });

  it('announces parsing through a polite status region', () => {
    mock.state.status = 'parsing';
    render(<App />);
    const status = screen.getByText('Analyzing your log…');
    expect(status).toHaveAttribute('role', 'status');
  });

  it('keeps the empty status region mounted before parsing starts', () => {
    mock.state.status = 'idle';
    const { container } = render(<App />);
    // live regions must exist before content lands or the announcement is dropped
    expect(container.querySelector('.landing__status[role="status"]')).not.toBeNull();
  });
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest src/ui/TopBar.test.tsx src/App.test.tsx` → new/updated tests FAIL.

- [ ] **Step 3: Implement `src/ui/TopBar.tsx`** (full new file)

```tsx
import { Button } from './primitives';
import { cx } from './cx';
import './TopBar.css';

interface TopBarProps {
  mode: 'easy' | 'nerd';
  onModeChange: (m: 'easy' | 'nerd') => void;
  onOpenSettings?: () => void;
}

// Easy/Nerd is a mode toggle, not tabs: there is no tabpanel relationship and no
// arrow-key navigation, so toggle buttons with aria-pressed are the honest semantic.
export function TopBar({ mode, onModeChange, onOpenSettings }: TopBarProps) {
  return (
    <header className="topbar">
      <span className="wordmark">
        WT<span className="wordmark__f">F</span>PS
      </span>
      <p className="topbar__tagline u-dim">HWiNFO log analyzer</p>
      {onOpenSettings && (
        <Button
          variant="ghost"
          className="topbar__settings"
          aria-label="Edit system specs"
          onClick={onOpenSettings}
        >
          ⚙ Specs
        </Button>
      )}
      <div className="topbar__toggle" role="group" aria-label="View mode">
        <Button
          aria-pressed={mode === 'easy'}
          variant={mode === 'easy' ? 'accent' : 'ghost'}
          className={cx(mode === 'easy' && 'is-active')}
          onClick={() => { if (mode !== 'easy') onModeChange('easy'); }}
        >
          Easy
        </Button>
        <Button
          aria-pressed={mode === 'nerd'}
          variant={mode === 'nerd' ? 'accent' : 'ghost'}
          className={cx(mode === 'nerd' && 'is-active')}
          onClick={() => { if (mode !== 'nerd') onModeChange('nerd'); }}
        >
          Nerd
        </Button>
      </div>
    </header>
  );
}
```

(The toggle wrapper changed `nav` → `div`. If any rule in `TopBar.css` keys off the `nav` element selector, switch it to `.topbar__toggle`; class-only selectors need no change.)

- [ ] **Step 4: Implement the App changes — `src/App.tsx`**

Skip link + main id (in `App()`'s return):

```tsx
    <div className="app">
      <a className="skip-link" href="#main">Skip to results</a>
      <TopBar mode={mode} onModeChange={setMode} onOpenSettings={openSettings} />
      <main id="main" tabIndex={-1} className="app__main">
```

Status region — in `Landing`, replace the conditional parsing line:

```tsx
      {status === 'parsing' && <p className="landing__status u-dim">Analyzing your log…</p>}
```

with an always-mounted live region:

```tsx
      <p className="landing__status u-dim" role="status">
        {status === 'parsing' ? 'Analyzing your log…' : ''}
      </p>
```

The `role="alert"` error paragraph below it is unchanged.

- [ ] **Step 5: Styles — append to `src/ui/App.css`**

```css
/* ---- accessibility ---------------------------------------------------- */

/* offscreen until keyboard focus lands on it */
.skip-link {
  position: fixed;
  top: var(--s3);
  left: var(--s3);
  z-index: 100;
  padding: var(--s2) var(--s3);
  font-size: var(--text-sm);
  color: var(--text);
  background: var(--surface-2);
  border: 1px solid var(--accent-line);
  border-radius: var(--r-md);
  transform: translateY(calc(-100% - var(--s5)));
}
.skip-link:focus {
  transform: translateY(0);
  outline: 2px solid var(--accent-line);
  outline-offset: 2px;
}

/* skip-link target, not an interactive control */
.app__main:focus {
  outline: none;
}
```

- [ ] **Step 6: Run tests**

Run: `npx vitest src/ui/TopBar.test.tsx src/App.test.tsx` → PASS. Then `npm run test` → green (no other file queries `role="tab"`; if one from plans #1–#5 does, update it the same way).

- [ ] **Step 7: Commit**

```bash
git add src/ui/TopBar.tsx src/ui/TopBar.test.tsx src/App.tsx src/App.test.tsx src/ui/App.css
git commit -m "fix(a11y): toggle-button mode switch, skip link, polite parsing announcement"
```

---

### Task 3: Non-color severity cues + focus-visible pass

**Files:**
- Modify: `src/ui/FindingsList.tsx`, `src/ui/FindingsList.test.tsx`
- Modify: `src/ui/HeroStats.tsx`, `src/ui/HeroStats.test.tsx`
- Modify: `src/ui/App.css` (`.sr-only`)
- Modify: `src/ui/RunsPanel.css` and the timeline CSS from plan #2 (`:focus-visible` rules)

- [ ] **Step 1: Write failing tests**

Append to `src/ui/FindingsList.test.tsx` (match its existing render helpers/imports):

```tsx
  it('prefixes warn/bad findings with a visually hidden severity word', () => {
    render(
      <FindingsList
        findings={[
          { severity: 'warn', text: 'GPU ran warm.' },
          { severity: 'bad', text: 'Thermal collapse.' },
          { severity: 'info', text: 'FPS cap detected.' },
        ]}
      />,
    );
    const items = screen.getAllByRole('listitem');
    expect(items[0].querySelector('.sr-only')?.textContent).toMatch(/warning:/i);
    expect(items[1].querySelector('.sr-only')?.textContent).toMatch(/critical:/i);
    expect(items[2].querySelector('.sr-only')).toBeNull();
  });
```

Append to `src/ui/HeroStats.test.tsx`:

```tsx
  it('adds a hidden severity word to warn/bad tiles only', () => {
    const { container } = render(
      <HeroStats
        hero={[
          { key: 'gpu.temp', label: 'GPU temp', value: '92°C', severity: 'bad' },
          { key: 'cpu.temp', label: 'CPU temp', value: '85°C', severity: 'warn' },
          { key: 'fps', label: 'Avg FPS', value: '120', severity: 'info' },
        ]}
      />,
    );
    const tiles = Array.from(container.querySelectorAll('.stat-tile'));
    expect(tiles[0].querySelector('.sr-only')?.textContent).toMatch(/critical:/i);
    expect(tiles[1].querySelector('.sr-only')?.textContent).toMatch(/warning:/i);
    expect(tiles[2].querySelector('.sr-only')).toBeNull();
  });
```

(If `HeroNumber` carries extra required fields after plans #1–#5, fill them with the same defaults the file's existing tests use.)

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest src/ui/FindingsList.test.tsx src/ui/HeroStats.test.tsx` → FAIL.

- [ ] **Step 3: Implement**

`src/ui/FindingsList.tsx` — add next to the imports:

```tsx
import type { Finding, Severity } from '../types';

// Dots carry severity by color alone; screen readers get the word instead.
const SR_SEVERITY: Partial<Record<Severity, string>> = { warn: 'warning:', bad: 'critical:' };
```

and inside the map, before the finding text:

```tsx
          <span className="finding__body">
            {SR_SEVERITY[f.severity] && <span className="sr-only">{SR_SEVERITY[f.severity]} </span>}
            <span className="finding__text">{f.text}</span>
```

`src/ui/HeroStats.tsx` — in the tile JSX, replace the status line:

```tsx
            {status ? (
              <span className="stat-tile__status">
                {(tier === 'warn' || tier === 'bad') && (
                  <span className="sr-only">{tier === 'bad' ? 'critical: ' : 'warning: '}</span>
                )}
                {status}
              </span>
            ) : null}
```

`src/ui/App.css` — append (theme.css is frozen, so the utility lives here; `App.css` is imported once at the app root, so every component sees it):

```css
/* visually hidden, still read by assistive tech */
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
  border: 0;
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest src/ui/FindingsList.test.tsx src/ui/HeroStats.test.tsx` → PASS.

- [ ] **Step 5: `:focus-visible` pass over owned component CSS** (manually verified — covered by the Task 6 checklist, not unit tests, since jsdom doesn't paint outlines)

`theme.css` already covers `.btn:focus-visible` and the `controls.css` checkbox. Audit every interactive element introduced by plans #1/#2 that is *not* composed from `<Button>`/`controls.tsx` and give each an explicit ring in its **owner** CSS file. Known candidates — adapt class names to the merged markup:

```css
/* src/ui/RunsPanel.css — selectable run rows */
.runs-panel__row:focus-visible {
  outline: 2px solid var(--accent-line);
  outline-offset: 2px;
}
```

```css
/* the timeline CSS file from plan #2 — From/To time inputs and any chip controls */
.timeline__input:focus-visible,
.timeline__chip:focus-visible {
  outline: 2px solid var(--accent-line);
  outline-offset: 2px;
}
```

Sweep check: `npx vitest src/ui` still green; visually spot-check with `npm run dev` (tab through a results view).

- [ ] **Step 6: Commit**

```bash
git add src/ui/FindingsList.tsx src/ui/FindingsList.test.tsx src/ui/HeroStats.tsx src/ui/HeroStats.test.tsx src/ui/App.css src/ui/RunsPanel.css
git commit -m "fix(a11y): sr-only severity words and focus-visible rings outside the button primitive"
```

(Include the timeline CSS file from plan #2 in the `git add` if it changed.)

---

### Task 4: vitest-axe smoke harness

**Files:**
- Modify: `package.json` (devDependency)
- Modify: `src/test/setup.ts`
- Create: `src/ui/a11y.test.tsx`

- [ ] **Step 1: Install**

```bash
npm install -D vitest-axe@^0.1.0
```

- [ ] **Step 2: Register matchers — `src/test/setup.ts`** (full new content)

```ts
import '@testing-library/jest-dom/vitest';
import * as axeMatchers from 'vitest-axe/matchers';
import type { AxeMatchers } from 'vitest-axe/matchers';
import { expect } from 'vitest';

expect.extend(axeMatchers);

declare module 'vitest' {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  interface Assertion<T = any> extends AxeMatchers {}
  interface AsymmetricMatchersContaining extends AxeMatchers {}
}
```

(The `T = any` mirrors vitest's own `Assertion` declaration — augmentation must match its arity; this is the vitest-axe documented pattern.)

- [ ] **Step 3: Write the smoke file — `src/ui/a11y.test.tsx`** (failing-first by nature: axe runs against the real tree and surfaces whatever is wrong)

```tsx
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { axe } from 'vitest-axe';

const mock = vi.hoisted(() => ({
  state: { status: 'idle' as 'idle' | 'ready' },
}));

vi.mock('./useAnalysis', async () => {
  const { fixtureResult } = await import('./_fixtures');
  const result = fixtureResult();
  return {
    useAnalysis: () => ({
      status: mock.state.status,
      result: mock.state.status === 'ready' ? result : null,
      error: null,
      analyzeFile: vi.fn(),
      reset: vi.fn(),
    }),
  };
});

import { App } from '../App';

// color-contrast needs real layout + canvas, which jsdom can't provide, so axe's
// results for it are unreliable here. Contrast is covered by the one-time manual
// DevTools audit in docs/a11y-checklist.md instead.
const AXE_OPTS = { rules: { 'color-contrast': { enabled: false } } };

describe('axe smoke', () => {
  beforeEach(() => {
    mock.state.status = 'idle';
  });
  afterEach(cleanup);

  it('landing has no violations', { timeout: 30_000 }, async () => {
    const { container } = render(<App />);
    expect(await axe(container, AXE_OPTS)).toHaveNoViolations();
  });

  it('results (easy mode) has no violations', { timeout: 30_000 }, async () => {
    mock.state.status = 'ready';
    const { container } = render(<App />);
    expect(await axe(container, AXE_OPTS)).toHaveNoViolations();
  });

  it('results (nerd mode) has no violations', { timeout: 30_000 }, async () => {
    mock.state.status = 'ready';
    const user = userEvent.setup();
    const { container } = render(<App />);
    await user.click(screen.getByRole('button', { name: 'Nerd' }));
    expect(await axe(container, AXE_OPTS)).toHaveNoViolations();
  });
});
```

- [ ] **Step 4: Run and fix what axe surfaces**

Run: `npx vitest src/ui/a11y.test.tsx`. Expect real violations on the first run — fixing them is **part of this task**, with two rules:

1. **Frozen files are never edited.** If a violation points into `Mascot.tsx`, `primitives/`, or `theme.css`-styled markup, fix it at the call site. Example: if the landing mascot's SVG is flagged, mark its wrapper decorative in `src/App.tsx` (`<div className="landing__mascot" aria-hidden="true">`) — the mascot duplicates nothing and decorates the headline.
2. Likely findings to expect (fix only what axe actually reports): missing accessible names on icon-only buttons from plans #1–#5, list semantics in `NerdView` tables, duplicate landmark labels, form inputs in `SpecsCard`/Timeline lacking `<label>`/`aria-label` associations.

Re-run until all three screens are clean. Then `npm run test` → full suite green (the axe file runs in jsdom via the existing `src/ui/**` glob in `vitest.config.ts`).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "test(a11y): vitest-axe smokes over landing and both result modes"
```

---

### Task 5: PWA packaging — plugin, manifest, icons, update toast

**Files:**
- Modify: `package.json`, `vite.config.ts`, `vitest.config.ts`, `index.html`, `tsconfig.node.json`, `src/App.tsx`
- Create: `pwa-assets.config.ts`, `src/vite-env.d.ts`, `src/test/pwa-register-mock.ts`, `src/ui/PwaToast.tsx`, `src/ui/PwaToast.css`, `src/ui/PwaToast.test.tsx`
- Create (generated, committed): `public/pwa-64x64.png`, `public/pwa-192x192.png`, `public/pwa-512x512.png`, `public/maskable-icon-512x512.png`, `public/apple-touch-icon-180x180.png`, `public/favicon.ico`

- [ ] **Step 1: Install**

```bash
npm install -D vite-plugin-pwa@^0.21.2 @vite-pwa/assets-generator@^0.2.6
```

- [ ] **Step 2: Icon generation — create `pwa-assets.config.ts`** (repo root)

```ts
import { defineConfig, minimal2023Preset } from '@vite-pwa/assets-generator/config';

// Backgrounds are the --bg hex from src/ui/theme.css — PNGs can't read CSS tokens.
// padding 0.3 keeps the mascot head inside the ~80% maskable safe zone; tune it by
// eye against maskable.app, never by stretching the source art.
export default defineConfig({
  preset: {
    ...minimal2023Preset,
    maskable: { sizes: [512], padding: 0.3, resizeOptions: { background: '#07090f' } },
    apple: { sizes: [180], padding: 0.3, resizeOptions: { background: '#07090f' } },
  },
  images: ['public/wtfps-icon.svg'],
});
```

Add the script to `package.json` `"scripts"`:

```json
    "icons": "pwa-assets-generator"
```

Run: `npm run icons` → PNGs + `favicon.ico` appear in `public/`. **Commit the generated files** (no build-time generation).

- [ ] **Step 3: DESIGN REVIEW checkbox — maskable safe zone**

Open `public/maskable-icon-512x512.png` in https://maskable.app/editor (or DevTools → Application → Manifest). Confirm the mascot head — including the antenna dot at the very top of the source SVG — survives the circle and squircle masks. If clipped, raise `padding` in `pwa-assets.config.ts` (e.g. `0.35`), re-run `npm run icons`, re-check. Do **not** edit the SVG.

- [ ] **Step 4: `vite.config.ts`** (full new content)

```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// base stays '/' (deployment target unknown). A subpath deploy — e.g. GitHub Pages —
// needs `base` set here and navigateFallback re-checked against it.
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      // never auto-swap code under a user mid-analysis; the PwaToast asks first
      registerType: 'prompt',
      manifest: {
        name: 'WTFPS — what the FPS',
        short_name: 'WTFPS',
        description:
          "Drop a HWiNFO log, get a plain-language verdict on what's bottlenecking your FPS. Runs entirely in your browser.",
        display: 'standalone',
        // --bg from src/ui/theme.css; a manifest isn't CSS
        theme_color: '#07090f',
        background_color: '#07090f',
        icons: [
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'maskable-icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // there is no runtime network traffic — precaching everything IS the strategy,
        // so no runtimeCaching routes on purpose
        globPatterns: ['**/*.{js,css,html,svg,woff2,png,webmanifest}'],
        navigateFallback: 'index.html',
      },
    }),
  ],
});
```

- [ ] **Step 5: `index.html`** — add inside `<head>`, after the favicon link (vite-plugin-pwa injects the manifest link itself):

```html
    <link rel="apple-touch-icon" href="/apple-touch-icon-180x180.png" />
    <meta name="theme-color" content="#07090f" />
```

- [ ] **Step 6: Types — create `src/vite-env.d.ts`**

```ts
/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/react" />
```

- [ ] **Step 7: Test plumbing for the virtual module**

Create `src/test/pwa-register-mock.ts`:

```ts
// Inert stand-in for vite-plugin-pwa's `virtual:pwa-register/react`, which only
// exists inside a Vite build. PwaToast.test.tsx vi.mocks the specifier when it
// needs to drive the hook; everything else just renders the quiet default.
export interface RegisterSWHook {
  offlineReady: [boolean, (v: boolean) => void];
  needRefresh: [boolean, (v: boolean) => void];
  updateServiceWorker: (reloadPage?: boolean) => Promise<void>;
}

export function useRegisterSW(): RegisterSWHook {
  return {
    offlineReady: [false, () => {}],
    needRefresh: [false, () => {}],
    updateServiceWorker: () => Promise.resolve(),
  };
}
```

`vitest.config.ts` (full new content — this is the exact alias snippet):

```ts
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// Engine code is pure and runs under node; the UI/storage/worker layers need a DOM,
// so those globs opt into jsdom. setup.ts registers @testing-library/jest-dom and
// vitest-axe matchers.
export default defineConfig({
  resolve: {
    alias: {
      // vite-plugin-pwa's virtual module only exists inside a Vite build; tests that
      // pull in <PwaToast> resolve it to a stub instead.
      'virtual:pwa-register/react': fileURLToPath(
        new URL('./src/test/pwa-register-mock.ts', import.meta.url),
      ),
    },
  },
  test: {
    environment: 'node',
    // globals:true lets @testing-library/react auto-register its afterEach cleanup,
    // so renders don't bleed across tests in the same file.
    globals: true,
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    setupFiles: ['./src/test/setup.ts'],
    environmentMatchGlobs: [
      ['src/ui/**', 'jsdom'],
      ['src/storage/**', 'jsdom'],
      ['src/worker/**', 'jsdom'],
    ],
  },
});
```

`tsconfig.node.json` — extend `include` so `tsc -b` covers the new root config:

```json
  "include": ["vite.config.ts", "vitest.config.ts", "pwa-assets.config.ts"]
```

- [ ] **Step 8: Write failing tests — `src/ui/PwaToast.test.tsx`**

```tsx
import { render, screen, act, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const h = vi.hoisted(() => ({
  state: { offlineReady: false, needRefresh: false },
  updateServiceWorker: vi.fn(() => Promise.resolve()),
}));

vi.mock('virtual:pwa-register/react', () => ({
  useRegisterSW: () => ({
    offlineReady: [h.state.offlineReady, vi.fn()],
    needRefresh: [h.state.needRefresh, vi.fn()],
    updateServiceWorker: h.updateServiceWorker,
  }),
}));

import { PwaToast } from './PwaToast';

describe('PwaToast', () => {
  beforeEach(() => {
    h.state.offlineReady = false;
    h.state.needRefresh = false;
    h.updateServiceWorker.mockClear();
  });
  afterEach(cleanup);

  it('keeps an empty polite live region mounted by default', () => {
    render(<PwaToast />);
    const region = screen.getByRole('status');
    expect(region).toHaveAttribute('aria-live', 'polite');
    expect(region).toBeEmptyDOMElement();
  });

  it('announces offline readiness and auto-dismisses after ~4s', () => {
    vi.useFakeTimers();
    try {
      h.state.offlineReady = true;
      render(<PwaToast />);
      expect(screen.getByText(/ready to work offline/i)).toBeInTheDocument();
      act(() => {
        vi.advanceTimersByTime(4_100);
      });
      expect(screen.queryByText(/ready to work offline/i)).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('shows the update prompt and reloads through the SW on click', async () => {
    const user = userEvent.setup();
    h.state.needRefresh = true;
    render(<PwaToast />);
    expect(screen.getByText(/update available/i)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /reload/i }));
    expect(h.updateServiceWorker).toHaveBeenCalledWith(true);
  });
});
```

Run: `npx vitest src/ui/PwaToast.test.tsx` → FAIL (module not found).

- [ ] **Step 9: Implement `src/ui/PwaToast.tsx`**

```tsx
import { useEffect, useState } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { Button } from './primitives';
import './PwaToast.css';

const OFFLINE_TOAST_MS = 4000;

export function PwaToast(): JSX.Element {
  const {
    offlineReady: [offlineReady, setOfflineReady],
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW();
  // local dismiss as well as the hook setter, so the toast hides even when the
  // setter is inert (tests stub the hook)
  const [offlineDismissed, setOfflineDismissed] = useState(false);

  useEffect(() => {
    if (!offlineReady) return;
    const t = setTimeout(() => {
      setOfflineDismissed(true);
      setOfflineReady(false);
    }, OFFLINE_TOAST_MS);
    return () => clearTimeout(t);
  }, [offlineReady, setOfflineReady]);

  const showOffline = offlineReady && !offlineDismissed;

  // The region stays mounted even while empty so screen readers reliably announce
  // text inserted into it later.
  return (
    <div className="pwa-toast" role="status" aria-live="polite">
      {showOffline && (
        <div className="pwa-toast__card">
          <p className="pwa-toast__msg">Ready to work offline.</p>
        </div>
      )}
      {needRefresh && (
        <div className="pwa-toast__card">
          <p className="pwa-toast__msg">Update available.</p>
          <Button variant="accent" onClick={() => updateServiceWorker(true)}>
            Reload
          </Button>
        </div>
      )}
    </div>
  );
}
```

Create `src/ui/PwaToast.css`:

```css
/* Solid surface by design: the toast is not on DESIGN.md's closed glow list —
   no glow, no frosted glass. */
.pwa-toast {
  position: fixed;
  right: var(--s4);
  bottom: var(--s4);
  z-index: 60;
  display: flex;
  flex-direction: column;
  gap: var(--s2);
  pointer-events: none;
}

.pwa-toast__card {
  pointer-events: auto;
  display: flex;
  align-items: center;
  gap: var(--s3);
  padding: var(--s3) var(--s4);
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: var(--r-md);
  box-shadow: var(--shadow-pop);
}

.pwa-toast__msg {
  margin: 0;
  font-size: var(--text-sm);
  color: var(--text);
}
```

Mount it in `src/App.tsx` — add the import and place it after the footer:

```tsx
import { PwaToast } from './ui/PwaToast';
```

```tsx
      <footer className="app__footer u-dim">
        Runs entirely in your browser — your log never leaves your machine.
      </footer>
      <PwaToast />
```

Run: `npx vitest src/ui/PwaToast.test.tsx src/App.test.tsx src/ui/a11y.test.tsx` → PASS (App-level tests resolve the virtual module through the vitest alias stub).

- [ ] **Step 10: Verify the build emits the service worker**

Run: `npm run build` → exits 0 (typecheck included). Then confirm:

```powershell
Get-ChildItem dist | Select-Object Name
```

must list `sw.js`, `workbox-*.js`, `manifest.webmanifest`, `registerSW.js` alongside `index.html`/`assets/`, and `dist/index.html` must contain a `<link rel="manifest"` tag. Run `npm run test` → full suite green.

- [ ] **Step 11: Commit (two commits — packaging, then the toast)**

```bash
git add package.json package-lock.json pwa-assets.config.ts vite.config.ts index.html tsconfig.node.json public src/vite-env.d.ts
git commit -m "feat(pwa): installable offline build via vite-plugin-pwa with committed icon set"
git add vitest.config.ts src/test/pwa-register-mock.ts src/ui/PwaToast.tsx src/ui/PwaToast.css src/ui/PwaToast.test.tsx src/App.tsx
git commit -m "feat(ui): offline-ready and update toasts wired to the service worker"
```

---

### Task 6: Manual checklist + full run-through

**Files:**
- Create: `docs/a11y-checklist.md`

- [ ] **Step 1: Create `docs/a11y-checklist.md`** (full content)

```markdown
# WTFPS accessibility + PWA manual checklist

Automated coverage (vitest-axe in `src/ui/a11y.test.tsx`) cannot see contrast,
real focus painting, zoom reflow, screen-reader behavior, or a running service
worker. This checklist is the manual half of the v2 #6 verification; run it
fully before a release that touches UI or packaging.

## Keyboard-only walkthrough (no mouse)

- [ ] Load the app; first Tab lands on "Skip to results"; Enter jumps focus to the main column.
- [ ] Tab order on landing: skip link → Specs → Easy → Nerd → drop zone. Drop zone activates with Enter/Space (file picker opens).
- [ ] Every focused element shows a visible ring (buttons, chips, runs-panel rows, timeline From/To inputs).
- [ ] Open Specs: focus moves into the dialog; Tab/Shift-Tab never escape it; Escape closes it and focus returns to the Specs button.
- [ ] Open the runs panel (v2 #1): same trap/Escape/restore behavior.
- [ ] Nerd timeline (v2 #2): the From/To time inputs are reachable and update the view without a pointer.
- [ ] Easy ↔ Nerd toggle works with Enter/Space and announces pressed state.

## Screen reader (NVDA + Firefox or Chrome)

- [ ] Drop a sample log: "Analyzing your log…" is announced without focus moving.
- [ ] A bad parse announces the error (role=alert).
- [ ] Findings read with their severity word ("warning:", "critical:") before the text.
- [ ] Hero tiles read label, value, and severity word for warn/bad tiers.
- [ ] The Easy/Nerd buttons report "toggle button, pressed/not pressed" — not "tab".
- [ ] Settings dialog announces its name ("System specs") on open.

## Zoom & motion

- [ ] 200% browser zoom: no horizontal scroll on landing or results; nothing overlaps or clips.
- [ ] OS "reduce motion" on: no entrance animation, no mascot bob, no toast slide (theme.css collapses all animation globally — verify nothing fights it).

## One-time contrast audit (jsdom can't do this — axe's color-contrast rule is disabled in tests)

- [ ] Chrome DevTools → Lighthouse → Accessibility on landing and results: contrast checks pass for text on `--surface*` tiles, dim/mute text, and accent-on-dark buttons.

## PWA (inherently manual — a service worker never runs under Vitest)

- [ ] `npm run build && npm run preview` → open the preview URL.
- [ ] DevTools → Application → Manifest: name "WTFPS — what the FPS", standalone, icons render, no warnings; maskable icon survives the mask preview with the mascot head intact.
- [ ] DevTools → Application → Service worker: sw.js activated. First load shows the "Ready to work offline." toast, which disappears after ~4 s.
- [ ] DevTools → Network → Offline, then hard reload: the app loads and can analyze a CSV fully offline (analysis is local; this proves the precache covers app + fonts + worker chunk).
- [ ] Install prompt: browser address bar offers install; installed window opens standalone with the correct icon and dark theme color.
- [ ] Update flow: change any visible string, `npm run build && npm run preview` again, reload the open tab → "Update available." toast with a Reload button; clicking Reload swaps to the new version. No silent mid-session swap occurred before clicking.
```

- [ ] **Step 2: Execute the checklist**

Run every line above against a real build (`npm run build && npm run preview`) with at least one log from `HWINFO samples/`. Fix anything that fails before proceeding (small fixes fold into this task; anything structural gets its own commit referencing the failing checklist line).

- [ ] **Step 3: Full suite + build**

Run: `npm run test` → green. Run: `npm run build` → exits 0.

- [ ] **Step 4: Commit**

```bash
git add docs/a11y-checklist.md
git commit -m "docs(a11y): manual accessibility and PWA verification checklist"
```

---

## Verification (end of v2 #6)

1. `npm run test` — full suite green, including `useModal`, `PwaToast`, and the three axe smokes (axe clean on landing + both result modes, color-contrast rule excluded by design).
2. `npm run build` — strict typecheck green; `dist/` contains `sw.js`, `manifest.webmanifest`, `registerSW.js`, and the icon PNGs.
3. `npm run preview` + DevTools: offline hard-reload works end-to-end (drop a sample CSV while offline), install prompt appears, rebuild triggers the update toast and Reload swaps versions.
4. `docs/a11y-checklist.md` executed in full — keyboard walkthrough, NVDA pass, 200% zoom, reduced motion, Lighthouse contrast audit — with every box checked.
5. Frozen files untouched: `git diff main --name-only` shows no `theme.css`, `cx.ts`, `primitives/`, or `Mascot.tsx`.

## Future / stretch (v3+)

- **Tauri packaging** — wrap the same static bundle as a desktop app for users who want file associations (`.CSV` open-with) and no browser chrome; the no-network design ports as-is.
- **Share-link** — encode the digest (not the raw log) into a URL fragment for sharing a verdict without uploading anything.
- **Periodic SW update checks** — `registerType: 'prompt'` plus a `setInterval` re-check via `onRegisteredSW`, so long-lived tabs learn about updates without a reload; deliberately deferred until there's a deploy cadence that needs it.
- **Subpath deploy hardening** — if GitHub Pages (or similar) becomes the target, set Vite `base`, re-check `navigateFallback`, and re-run the PWA checklist.

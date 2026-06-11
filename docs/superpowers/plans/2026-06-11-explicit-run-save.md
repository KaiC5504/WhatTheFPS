# Explicit Run Save Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop auto-saving every analyzed log; persist a run only when the user clicks a new "Save run" button in the results view.

**Architecture:** `src/App.tsx` currently auto-saves each fresh `AnalysisResult` into the runs store via a `useEffect`. We delete that auto-save, add a "Save run" button to the existing results action row, and track "is the current result saved" with one piece of App state (`savedResult === result` — a new analysis produces a new result object, so the button resets automatically). The storage layer (`runsStore.ts`) and hook (`useRuns.ts`) already support explicit saves and need **no changes**.

**Tech Stack:** React 18 + TypeScript 5 (strict, `noUnusedLocals`), Vitest + Testing Library (jsdom for UI tests).

**Spec:** `docs/superpowers/specs/2026-06-11-explicit-run-save-design.md`

---

## Context for a zero-context implementer

- **What the app does:** user drops an HWiNFO CSV, gets an FPS-bottleneck verdict. Analyses can be saved as "runs" (`localStorage` key `wtfps.runs.v1`, FIFO cap 20) for later viewing/comparing.
- **Where the auto-save lives:** `src/App.tsx`, inside the `useEffect` that runs on each fresh `result` (it also reconciles specs and resets the view — those two jobs must survive).
- **Save semantics (already implemented, do not change):** `useRuns().save(result)` calls `saveRun` in `src/storage/runsStore.ts`, which auto-names the run `"<GPU model> — HH:MM"` and returns the `SavedRun`, or `null` if the `localStorage` write failed (quota / private browsing). A `null` return must leave the button enabled so the user can retry.
- **Design contract (`src/ui/DESIGN.md`):** one glowing `accent` button per surface; the results page's accent is "Copy prompt for my LLM". The new button therefore uses `variant="subtle"`, like the neighboring "Compare runs". The `<Button>` primitive forwards `disabled` (RunsPanel already uses it).
- **Test conventions:** UI tests under `src/` root need an explicit `// @vitest-environment jsdom` header (the jsdom override in `vitest.config.ts` only covers `src/ui/**`, `src/storage/**`, `src/worker/**`). App tests bypass the worker by mocking `./ui/useAnalysis` with a fixture result from `src/ui/_fixtures.ts`.
- **Run commands from the repo root** (`D:\Repos\Apps\WhatTheFPS`).
- **Commits:** plain messages, NO `Co-Authored-By` trailer.

## File structure

- **Modify:** `src/App.tsx` — remove auto-save, add saved-state + handler, add button to `Results`.
- **Create:** `src/App.runs.test.tsx` — jsdom test for the new behavior.
- **Modify:** `src/ui/RunsPanel.tsx` — empty-state copy only.
- **Modify:** `src/ui/RunsPanel.test.tsx` — empty-state copy assertion.
- **Untouched:** `src/storage/runsStore.ts`, `src/ui/useRuns.ts`, and their tests.

---

### Task 1: Remove auto-save; add the "Save run" button

**Files:**
- Test (create): `src/App.runs.test.tsx`
- Modify: `src/App.tsx`

- [ ] **Step 1: Write the failing test**

Create `src/App.runs.test.tsx` with exactly:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// Same pattern as App.test.tsx: drive the app off a deterministic fixture result,
// bypassing the worker by mocking the analysis hook to report 'ready' immediately.
vi.mock('./ui/useAnalysis', async () => {
  const { fixtureResult } = await import('./ui/_fixtures');
  const result = fixtureResult();
  return {
    useAnalysis: () => ({ status: 'ready', result, error: null, analyzeFile: vi.fn(), reset: vi.fn() }),
  };
});

import { App } from './App';
import { loadRuns } from './storage/runsStore';

beforeEach(() => localStorage.clear());

describe('explicit run save', () => {
  it('analyzing a log does not persist a run', () => {
    render(<App />);
    expect(screen.getByRole('button', { name: 'Save run' })).toBeEnabled();
    expect(loadRuns()).toEqual([]);
  });

  it('Save run persists exactly one run and flips to a disabled Saved state', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('button', { name: 'Save run' }));

    expect(loadRuns()).toHaveLength(1);
    expect(screen.getByRole('button', { name: /saved/i })).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Save run' })).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/App.runs.test.tsx`

Expected: FAIL — both tests can't find a button named "Save run" (it doesn't exist yet), and the first test's `loadRuns()` returns 1 run (the auto-save is still in place).

- [ ] **Step 3: Implement the change in `src/App.tsx`**

Three edits in the `App` component, one in `Results`.

**3a — imports (line 1).** `useRef` becomes unused (strict TS fails the build on unused imports):

Old:
```tsx
import { useEffect, useRef, useState } from 'react';
```
New:
```tsx
import { useEffect, useState } from 'react';
```

**3b — state + effect.** Replace the `savedFor` ref with saved-result state, drop the save call from the effect, and add the click handler:

Old:
```tsx
  const { runs, save, rename, remove, clear } = useRuns();
  // StrictMode mounts effects twice in dev; remember which result object was saved.
  const savedFor = useRef<AnalysisResult | null>(null);

  // On a fresh result, prefer the engine's detection. Reuse saved overrides only when they
  // belong to the same machine (same CPU + GPU), so one rig's log can't shadow another's.
  useEffect(() => {
    if (!result) return;
    const fresh = result.log.specs;
    const saved = loadSpecs();
    const sameMachine =
      !!saved &&
      saved.cpuModelGuess === fresh.cpuModelGuess &&
      saved.gpuModelGuess === fresh.gpuModelGuess;
    if (sameMachine) {
      // Keep the user's edits, but let this build's detections fill any gaps the saved
      // blob predates (iGPU, DIMM count), then heal the stored copy.
      const restored = reconcileSpecs(fresh, saved);
      setSpecs(restored);
      saveSpecs(restored);
    } else {
      setSpecs(fresh);
      saveSpecs(fresh);
    }
    if (savedFor.current !== result) {
      savedFor.current = result;
      save(result);
      setView({ kind: 'live' });   // a fresh analysis always lands on the live view
    }
  }, [result, save]);
```
New:
```tsx
  const { runs, save, rename, remove, clear } = useRuns();
  // Runs are saved only on explicit request; track which result the user saved so the
  // button can't double-save and resets when a new analysis lands.
  const [savedResult, setSavedResult] = useState<AnalysisResult | null>(null);

  // On a fresh result, prefer the engine's detection. Reuse saved overrides only when they
  // belong to the same machine (same CPU + GPU), so one rig's log can't shadow another's.
  useEffect(() => {
    if (!result) return;
    const fresh = result.log.specs;
    const saved = loadSpecs();
    const sameMachine =
      !!saved &&
      saved.cpuModelGuess === fresh.cpuModelGuess &&
      saved.gpuModelGuess === fresh.gpuModelGuess;
    if (sameMachine) {
      // Keep the user's edits, but let this build's detections fill any gaps the saved
      // blob predates (iGPU, DIMM count), then heal the stored copy.
      const restored = reconcileSpecs(fresh, saved);
      setSpecs(restored);
      saveSpecs(restored);
    } else {
      setSpecs(fresh);
      saveSpecs(fresh);
    }
    setView({ kind: 'live' });   // a fresh analysis always lands on the live view
  }, [result]);

  function handleSaveRun() {
    // save() returns null when the localStorage write fails — stay unsaved so the
    // user can retry.
    if (result && save(result)) setSavedResult(result);
  }
```

**3c — `<Results>` call site.** Pass the handler and saved flag:

Old:
```tsx
          <Results
            result={result}
            specs={specs ?? result.log.specs}
            mode={mode}
            onSpecsChange={setSpecs}
            onReset={reset}
            onOpenRuns={() => setRunsOpen(true)}
          />
```
New:
```tsx
          <Results
            result={result}
            specs={specs ?? result.log.specs}
            mode={mode}
            onSpecsChange={setSpecs}
            onReset={reset}
            onOpenRuns={() => setRunsOpen(true)}
            onSave={handleSaveRun}
            saved={savedResult === result}
          />
```

**3d — `Results` component** (bottom of the same file). Add the two props and the button:

Old:
```tsx
function Results({
  result,
  specs,
  mode,
  onSpecsChange,
  onReset,
  onOpenRuns,
}: {
  result: AnalysisResult;
  specs: InferredSpecs;
  mode: UiMode;
  onSpecsChange: (next: InferredSpecs) => void;
  onReset: () => void;
  onOpenRuns: () => void;
}) {
```
New:
```tsx
function Results({
  result,
  specs,
  mode,
  onSpecsChange,
  onReset,
  onOpenRuns,
  onSave,
  saved,
}: {
  result: AnalysisResult;
  specs: InferredSpecs;
  mode: UiMode;
  onSpecsChange: (next: InferredSpecs) => void;
  onReset: () => void;
  onOpenRuns: () => void;
  onSave: () => void;
  saved: boolean;
}) {
```

Old (end of `Results`'s JSX):
```tsx
      <div className="results__actions">
        <Button variant="ghost" onClick={onReset}>
          Analyze another log
        </Button>
        <Button variant="subtle" onClick={onOpenRuns}>
          Compare runs
        </Button>
      </div>
```
New:
```tsx
      <div className="results__actions">
        <Button variant="ghost" onClick={onReset}>
          Analyze another log
        </Button>
        <Button variant="subtle" onClick={onOpenRuns}>
          Compare runs
        </Button>
        <Button variant="subtle" onClick={onSave} disabled={saved}>
          {saved ? 'Saved ✓' : 'Save run'}
        </Button>
      </div>
```

Do NOT use `variant="accent"` here — the page's single accent CTA is "Copy prompt for my LLM" (see `src/ui/DESIGN.md`, "The closed glow list").

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/App.runs.test.tsx`

Expected: PASS (2 tests).

- [ ] **Step 5: Run the other App-level suites (they render the same component)**

Run: `npx vitest run src/App.test.tsx src/App.specs.test.tsx`

Expected: PASS. If anything fails, fix the regression before committing — these suites cover specs reconciliation and mode switching, which this change must not affect.

- [ ] **Step 6: Commit**

```sh
git add src/App.tsx src/App.runs.test.tsx
git commit -m "feat: save runs only on explicit Save run click"
```

---

### Task 2: Runs panel empty-state copy

**Files:**
- Modify: `src/ui/RunsPanel.test.tsx`
- Modify: `src/ui/RunsPanel.tsx:54`

- [ ] **Step 1: Update the test to expect the new copy (failing first)**

In `src/ui/RunsPanel.test.tsx`:

Old:
```tsx
  it('empty state explains auto-save and disables Clear all', () => {
    setup([]);
    expect(screen.getByText(/lands here automatically/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /clear all/i })).toBeDisabled();
  });
```
New:
```tsx
  it('empty state explains manual save and disables Clear all', () => {
    setup([]);
    expect(screen.getByText(/hit save run to keep it here/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /clear all/i })).toBeDisabled();
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/ui/RunsPanel.test.tsx`

Expected: FAIL — `getByText(/hit save run to keep it here/i)` finds nothing (component still shows the auto-save copy).

- [ ] **Step 3: Update the component copy**

In `src/ui/RunsPanel.tsx`:

Old:
```tsx
          <p className="u-dim">No saved runs yet — every analyzed log lands here automatically.</p>
```
New:
```tsx
          <p className="u-dim">No saved runs yet — analyze a log and hit Save run to keep it here.</p>
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/ui/RunsPanel.test.tsx`

Expected: PASS (all tests in the file).

- [ ] **Step 5: Commit**

```sh
git add src/ui/RunsPanel.tsx src/ui/RunsPanel.test.tsx
git commit -m "chore: runs panel empty-state copy reflects manual save"
```

---

### Task 3: Full verification

- [ ] **Step 1: Run the whole test suite**

Run: `npm run test`

Expected: all suites PASS, including the golden engine tests against `HWINFO samples/`.

- [ ] **Step 2: Typecheck + production build**

Run: `npm run build`

Expected: `tsc -b` reports no errors (this is what catches a leftover unused `useRef` import), then `vite build` completes.

---

## Future (v2+) — out of scope for this plan

Tracked in the spec (`docs/superpowers/specs/2026-06-11-explicit-run-save-design.md`):

- Inline name prompt on save (pre-filled with the auto-name).
- "Unsaved run" nudge when clicking "Analyze another log" with an unsaved result.
- Saving from the runs panel / landing view.

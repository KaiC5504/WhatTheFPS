# Explicit run save — design

- **Date:** 2026-06-11
- **Status:** approved (chat review, 2026-06-11)
- **Owner area:** `src/App.tsx`, `src/ui/RunsPanel.tsx` (copy only)

## Problem

Every analyzed log is auto-saved into the runs store (`localStorage` key `wtfps.runs.v1`,
FIFO cap of 20) by an effect in `App.tsx`. The user wants saving to be an explicit choice:
analyzing a log should not persist anything until they ask for it.

## Decision summary

1. **Remove the auto-save.** The result effect in `App.tsx` keeps its other two jobs
   (reconcile specs, reset to the live view on a fresh analysis) but no longer calls
   `save(result)`. The `savedFor` StrictMode-guard ref goes away with it.
2. **Add a "Save run" button** to the existing actions row at the bottom of the results
   view, next to "Analyze another log" and "Compare runs".
   - Variant: `subtle`. The page's single accent CTA is "Copy prompt for my LLM"
     (DigestPanel); the design contract (`src/ui/DESIGN.md`) allows exactly one glowing
     accent button per surface, so Save run must not be `accent`.
   - Click → instant save under the existing auto-name (`<GPU> — HH:MM`). Renaming stays
     where it already lives: the Saved Runs panel. (User explicitly chose this over an
     inline name prompt.)
   - After a successful save the button becomes a disabled **"Saved ✓"**, preventing
     duplicate saves of the same result.
3. **Saved-state tracking** in `App`: one `useState<AnalysisResult | null>` holding the
   last successfully saved result object. `saved = savedResult === result`. A new analysis
   produces a new `result` object, so the button resets to "Save run" automatically.
4. **Quota failure stays retryable.** `saveRun` returns `null` when `localStorage` writes
   fail (quota / private browsing); in that case the result is not marked saved and the
   button stays active.
5. **Copy update.** RunsPanel empty state changes from
   "No saved runs yet — every analyzed log lands here automatically." to
   "No saved runs yet — analyze a log and hit Save run to keep it here."

Nothing else changes: `runsStore.ts`, `useRuns.ts`, the Landing "Saved runs (n)" button,
SavedRunView, and compare flows are untouched. Runs already saved by the auto-save era
remain in storage.

## Data flow after the change

```
analyze(file) ─► result (in-memory only)
                   │
                   ├─ user clicks [Save run] ─► useRuns.save(result) ─► runsStore.saveRun
                   │                              │ returns SavedRun → mark savedResult
                   │                              └ returns null (quota) → stay unsaved
                   └─ user analyzes another log ─► result discarded, nothing persisted
```

## Tests

- **New `App` jsdom test** (alongside `App.test.tsx`, using the same `useAnalysis` mock
  pattern): on render with a ready result, `localStorage` has no runs; clicking
  "Save run" persists exactly one run and flips the button to a disabled "Saved ✓".
- **Update `RunsPanel.test.tsx`:** the empty-state assertion currently matches
  `/lands here automatically/i`; update to the new copy.
- `runsStore.test.ts` / `useRuns.test.ts` already cover explicit saves — unchanged.

## Out of scope / v2 candidates

- **Inline name prompt on save** (pre-filled with the auto-name) — the option not chosen;
  natural upgrade if unnamed runs prove annoying in compare workflows.
- **Unsaved-run nudge** when clicking "Analyze another log" with an unsaved result on
  screen — deliberate omission for now; manual control was the point.
- **Save from the saved-runs panel / landing** — panel can be open with no live result;
  adds states for little gain.

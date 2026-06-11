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

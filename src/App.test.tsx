// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// Drive the whole app off a deterministic fixture result, bypassing the worker by
// mocking the analysis hook to report 'ready' immediately. The fixture exercises the
// full mode-split UI (time-split, primary fix, evidence chain) which a tiny inline CSV
// cannot produce through the real engine.
vi.mock('./ui/useAnalysis', async () => {
  const { fixtureResult } = await import('./ui/_fixtures');
  const result = fixtureResult();
  return {
    useAnalysis: () => ({ status: 'ready', result, error: null, analyzeFile: vi.fn(), reset: vi.fn() }),
  };
});

// Nerd mode mounts the interactive timeline; jsdom has no canvas, so swap uPlot
// for the shared fake (Design decision 9: any test rendering the chart mocks uplot).
vi.mock('uplot', async () => {
  const mock = await import('./ui/timeline/_uplotMock');
  return { default: mock.FakeUPlot };
});

import { App } from './App';

describe('App assembly', () => {
  it('easy mode: verdict + bar + ONE fix, no findings list, no tables', () => {
    render(<App />);

    expect(screen.getByText('Avg FPS')).toBeInTheDocument();
    expect(screen.getByText('Copy prompt for my LLM')).toBeInTheDocument();
    expect(screen.getByText(/the one thing to try/i)).toBeInTheDocument();
    expect(screen.getByText(/where the time went/i)).toBeInTheDocument();
    expect(screen.queryByText('Per-sensor statistics')).toBeNull();
    expect(screen.queryByText('Worst moments')).toBeNull();
    expect(screen.queryByText('Session timeline')).toBeNull();
  });

  it('nerd mode: full findings with badges + evidence sections, no PrimaryFix', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('tab', { name: 'Nerd' }));
    expect(screen.getByText('Per-sensor statistics')).toBeInTheDocument();
    expect(screen.getByText('Session timeline')).toBeInTheDocument();
    expect(screen.queryByText(/the one thing to try/i)).toBeNull();
  });

  it('opens the specs settings overlay from the top bar and closes it with Done', async () => {
    const user = userEvent.setup();
    render(<App />);

    expect(screen.queryByRole('dialog', { name: /system specs/i })).toBeNull();
    await user.click(screen.getByRole('button', { name: /specs/i }));
    const dialog = screen.getByRole('dialog', { name: /system specs/i });
    expect(dialog).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /done/i }));
    expect(screen.queryByRole('dialog', { name: /system specs/i })).toBeNull();
  });
});

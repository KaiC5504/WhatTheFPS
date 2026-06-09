// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// Drive the whole app off a real engine result, but bypass the worker by mocking
// the analysis hook to report 'ready' immediately.
vi.mock('./ui/useAnalysis', async () => {
  const { analyze } = await import('./engine/analyze');
  const csv = [
    'Date,Time,"Total CPU Usage [%]","CPU Package [°C]","GPU Temperature [°C]","GPU Core Load [%]","Framerate Displayed (avg) [FPS]",',
    '9.6.2026,12:00:00.000,45.0,70.0,75.0,99.0,120.0,',
    '9.6.2026,12:00:02.000,55.0,72.0,77.0,98.0,118.0,',
  ].join('\n');
  const result = analyze(new TextEncoder().encode(csv));
  return {
    useAnalysis: () => ({ status: 'ready', result, error: null, analyzeFile: vi.fn(), reset: vi.fn() }),
  };
});

import { App } from './App';

describe('App assembly', () => {
  it('easy mode shows the verdict + digest; Nerd reveals the stats table and Easy hides it', async () => {
    const user = userEvent.setup();
    render(<App />);

    // Easy mode: hero stats + the signature digest panel are present…
    expect(screen.getByText('Avg FPS')).toBeInTheDocument();
    expect(screen.getByText('Copy prompt for my LLM')).toBeInTheDocument();
    // …but the deep nerd table is not.
    expect(screen.queryByText('Per-sensor statistics')).toBeNull();

    await user.click(screen.getByRole('tab', { name: 'Nerd' }));
    expect(screen.getByText('Per-sensor statistics')).toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: 'Easy' }));
    expect(screen.queryByText('Per-sensor statistics')).toBeNull();
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

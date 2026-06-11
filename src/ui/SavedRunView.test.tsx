// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SavedRunView } from './SavedRunView';
import { analyze } from '../engine/analyze';
import { slimResult } from '../compare/slim';
import { makeSavedRun } from '../compare/testkit';

const tinyCsv = [
  'Date,Time,"Total CPU Usage [%]","CPU Package [°C]","GPU Temperature [°C]","GPU Core Load [%]","Framerate Displayed (avg) [FPS]",',
  '9.6.2026,12:00:00.000,45.0,70.0,75.0,99.0,120.0,',
  '9.6.2026,12:00:02.000,55.0,72.0,77.0,98.0,118.0,',
].join('\n');
const run = makeSavedRun(slimResult(analyze(new TextEncoder().encode(tinyCsv))), { name: 'My saved run' });

describe('SavedRunView', () => {
  it('renders the stored verdict, name, digest and the summary-only notice', () => {
    const { container } = render(<SavedRunView run={run} mode="nerd" onBack={vi.fn()} />);
    expect(screen.getByText('My saved run')).toBeInTheDocument();
    // HeroVerdict splits the headline around a metric span; check the paragraph's text content directly.
    const headlineEl = container.querySelector('.hero-verdict__headline');
    expect(headlineEl?.textContent).toBe(run.result.verdict.headline);
    expect(document.querySelector('pre')?.textContent).toContain('HWiNFO session summary');
    expect(screen.getByText(/re-drop the original CSV/i)).toBeInTheDocument();
    expect(container.textContent).not.toContain('NaN');
  });

  it('easy mode renders without the nerd findings list', () => {
    render(<SavedRunView run={run} mode="easy" onBack={vi.fn()} />);
    expect(screen.getByText('My saved run')).toBeInTheDocument();
  });

  it('Back fires the callback', () => {
    const onBack = vi.fn();
    render(<SavedRunView run={run} mode="easy" onBack={onBack} />);
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(onBack).toHaveBeenCalled();
  });
});

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SelectionPanel } from './SelectionPanel';
import { fixtureResult } from '../_fixtures';
import type { SelectionAnalysis, Stats } from '../../types';

function stats(over: Partial<Stats> = {}): Stats {
  return { count: 10, avg: 80, min: 60, max: 95, p5: 65, p95: 92, p99: 94, p1Low: 62, p5Low: 66, ...over };
}

function fixtureSelection(over: Partial<SelectionAnalysis> = {}): SelectionAnalysis {
  return {
    startRow: 1, endRow: 3, startMs: 2000, endMs: 6000,
    fps: stats({ avg: 71.5, p1Low: 44 }),
    sensors: { 'gpu.usage': stats({ avg: 99 }), 'cpu.usageTotal': stats({ avg: 52.5 }) },
    timeSplit: { gameplayMs: 4000, totalMs: 4000, shares: { gpu: 0.75, cpu: 0.25 }, dominant: 'gpu' },
    windowCount: 2,
    ...over,
  };
}

const noop = () => {};

describe('SelectionPanel', () => {
  it('renders duration, FPS stats, per-sensor rows, and time-split shares', () => {
    render(<SelectionPanel result={fixtureResult()} selection={fixtureSelection()} onClear={noop} />);
    expect(screen.getByText('0:02–0:06 (0:04)')).toBeInTheDocument();
    expect(screen.getByText('71.5')).toBeInTheDocument();   // FPS avg
    expect(screen.getByText('44')).toBeInTheDocument();     // FPS 1% low
    // sensor rows use the log's labels (the fixture log labels sensors by key)
    expect(screen.getByText('gpu.usage')).toBeInTheDocument();
    expect(screen.getByText('cpu.usageTotal')).toBeInTheDocument();
    expect(screen.getByText('99')).toBeInTheDocument();     // gpu.usage avg
    expect(screen.getByText('75%')).toBeInTheDocument();    // gpu share
    expect(screen.getByText('25%')).toBeInTheDocument();    // cpu share
  });

  it('fires onClear from the clear-selection button', () => {
    const onClear = vi.fn();
    render(<SelectionPanel result={fixtureResult()} selection={fixtureSelection()} onClear={onClear} />);
    fireEvent.click(screen.getByRole('button', { name: /clear selection/i }));
    expect(onClear).toHaveBeenCalledTimes(1);
  });

  it('shows "no framerate logged" when the selection has no FPS', () => {
    render(<SelectionPanel result={fixtureResult()} selection={fixtureSelection({ fps: null })} onClear={noop} />);
    expect(screen.getByText(/no framerate logged/i)).toBeInTheDocument();
  });

  it('explains a missing time split instead of inventing one', () => {
    render(
      <SelectionPanel
        result={fixtureResult()}
        selection={fixtureSelection({ timeSplit: null, windowCount: 0 })}
        onClear={noop}
      />,
    );
    expect(screen.getByText(/no analysis window fits fully inside/i)).toBeInTheDocument();
  });
});

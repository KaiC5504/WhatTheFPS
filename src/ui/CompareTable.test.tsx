import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CompareTable } from './CompareTable';
import { compareRuns } from '../compare/diff';
import { makeSlim, stat } from '../compare/testkit';
import type { DiagEvent } from '../types';

const throttle: DiagEvent = {
  id: 't1', type: 'throttling', subtype: 'cpu-thermal', severity: 'warn',
  sentence: 'CPU hit thermal throttling in 12 samples.', sampleCount: 12,
};

const before = makeSlim({
  stats: { 'gpu.temp': stat({ avg: 80, max: 87 }), 'gpu.clock': stat({ avg: 2400, max: 2520 }) },
  flagCounts: { 'flag.cpu.thermalThrottle': { fired: 12, total: 1800 } },
  events: [throttle],
});
const after = makeSlim({
  stats: { 'gpu.temp': stat({ avg: 72, max: 78 }), 'gpu.clock': stat({ avg: 2460, max: 2580 }) },
  flagCounts: { 'flag.cpu.thermalThrottle': { fired: 0, total: 1750 } },
});
const comparison = compareRuns(before, after);

describe('CompareTable', () => {
  it('renders avg and max rows per sensor plus the flag-count row', () => {
    const { container } = render(<CompareTable comparison={comparison} />);
    const text = container.textContent ?? '';
    expect(text).toContain('GPU Temperature');
    expect(text).toContain('CPU thermal throttle');
    // gpu.temp avg + max, gpu.clock avg + max, flag row, fps rows skipped (both none)
    expect(container.querySelectorAll('tbody tr').length).toBe(5);
    expect(text).not.toContain('NaN');
  });

  it('breaks down the event diff into resolved / introduced / persisted', () => {
    render(<CompareTable comparison={comparison} />);
    expect(screen.getByText(/resolved/i)).toBeInTheDocument();
    expect(screen.getByText(/CPU hit thermal throttling/)).toBeInTheDocument();
    expect(screen.getAllByText('none').length).toBe(2);   // introduced + persisted are empty
  });

  it('colors only clear-polarity rows', () => {
    const { container } = render(<CompareTable comparison={comparison} />);
    const rows = [...container.querySelectorAll('tbody tr')];
    const clock = rows.find((r) => r.textContent?.includes('GPU Clock'))!;
    expect(clock.className).toBe('');                      // clocks stay neutral
    const temp = rows.find((r) => r.textContent?.includes('GPU Temperature'))!;
    expect(temp.className).toBe('delta--improved');
  });
});

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { CompareView } from './CompareView';
import { compareRuns } from '../compare/diff';
import { makeSlim, makeSavedRun, stat } from '../compare/testkit';

const FPS = (avg: number) => ({
  source: 'displayed' as const, sourceLabel: 'Framerate Displayed (avg)', stats: stat({ avg }),
});

const before = makeSlim({
  stats: { 'gpu.temp': stat({ avg: 80 }), 'cpu.usageTotal': stat({ avg: 45 }) },
  fps: FPS(112),
});
const after = makeSlim({
  stats: { 'gpu.temp': stat({ avg: 72 }), 'cpu.usageTotal': stat({ avg: 60 }) },
  fps: FPS(118),
});
const runB = makeSavedRun(before, { id: 'b', name: 'stock', createdAt: 1000 });
const runA = makeSavedRun(after, { id: 'a', name: 'undervolt', createdAt: 2000 });
const comparison = compareRuns(before, after);

function setup(c = comparison) {
  const onSwap = vi.fn();
  const onExit = vi.fn();
  const view = render(
    <CompareView before={runB} after={runA} comparison={c} onSwap={onSwap} onExit={onExit} />,
  );
  return { onSwap, onExit, container: view.container };
}

describe('CompareView', () => {
  it('shows the headline, both run names and five hero rows', () => {
    const { container } = setup();
    expect(screen.getByText(comparison.headline)).toBeInTheDocument();
    expect(screen.getByText('stock')).toBeInTheDocument();
    expect(screen.getByText('undervolt')).toBeInTheDocument();
    expect(container.querySelectorAll('tbody tr')).toHaveLength(5);
  });

  it('colors only clear-polarity rows; neutral changes carry no color class', () => {
    const { container } = setup();
    expect(container.querySelectorAll('.delta--improved').length).toBeGreaterThan(0);
    const rows = [...container.querySelectorAll('tbody tr')];
    const cpuUsage = rows.find((r) => r.textContent?.includes('CPU usage'))!;
    expect(cpuUsage.className).toBe('');   // 45→60 is information, not a loss
  });

  it('missing sides render as — and never NaN', () => {
    const { container } = setup();
    // cpu.temp and gpu.usage exist in neither fixture → whole row is dashes
    expect(container.textContent).toContain('—');
    expect(container.textContent).not.toContain('NaN');
  });

  it('the warn banner appears only when there are mismatches; the caveat always shows', () => {
    const { container } = setup();
    expect(container.querySelector('.compare-view__banner')).toBeNull();
    expect(screen.getByText(/same workload/i)).toBeInTheDocument();

    const mismatched = compareRuns(before, makeSlim({ activityKind: 'workload' }));
    const second = render(
      <CompareView before={runB} after={runA} comparison={mismatched} onSwap={vi.fn()} onExit={vi.fn()} />,
    );
    expect(second.container.querySelector('.compare-view__banner')).not.toBeNull();
  });

  it('swap and exit fire their callbacks', () => {
    const { onSwap, onExit } = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Swap' }));
    expect(onSwap).toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: /exit compare/i }));
    expect(onExit).toHaveBeenCalled();
  });
});

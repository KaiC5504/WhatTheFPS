import { render } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { WindowTimeline } from './WindowTimeline';
import { fixtureResult } from './_fixtures';
import { makeWindow, makeWindowAnalysis } from '../causes/testkit';

describe('WindowTimeline', () => {
  it('merges consecutive same-limiter windows into a single band rect', () => {
    const windows = makeWindowAnalysis([
      makeWindow(0, { limiter: 'gpu', metrics: { fpsAvg: 100 } }),
      makeWindow(1, { limiter: 'gpu', metrics: { fpsAvg: 98 } }),
      makeWindow(2, { limiter: 'gpu', metrics: { fpsAvg: 97 } }),
      makeWindow(3, { limiter: 'cpu', metrics: { fpsAvg: 45 } }),
      makeWindow(4, { limiter: 'gpu', metrics: { fpsAvg: 96 } }),
    ]);
    const { container } = render(<WindowTimeline result={fixtureResult({ windows })} />);
    // 5 windows collapse to 3 runs: gpu(0-2), cpu(3), gpu(4).
    expect(container.querySelectorAll('rect')).toHaveLength(3);
  });

  it('keeps idle/gameplay boundaries as separate bands', () => {
    const windows = makeWindowAnalysis([
      makeWindow(0, { limiter: 'gpu', metrics: { fpsAvg: 100 } }),
      makeWindow(1, { activity: 'idle' }),
      makeWindow(2, { activity: 'idle' }),
      makeWindow(3, { limiter: 'gpu', metrics: { fpsAvg: 96 } }),
    ]);
    const { container } = render(<WindowTimeline result={fixtureResult({ windows })} />);
    // gpu, idle(merged), gpu = 3 runs.
    expect(container.querySelectorAll('rect')).toHaveLength(3);
  });

  it('renders nothing without windows', () => {
    const empty = makeWindowAnalysis([]);
    const { container } = render(<WindowTimeline result={fixtureResult({ windows: empty })} />);
    expect(container).toBeEmptyDOMElement();
  });
});

import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { WindowTimeline } from './WindowTimeline';
import { fixtureResult } from './_fixtures';
import { makeWindow, makeWindowAnalysis } from '../causes/testkit';

const seg = (c: HTMLElement) => c.querySelectorAll('.wt-rail-seg');
const marks = (c: HTMLElement) => c.querySelectorAll('.wt-worst');

describe('WindowTimeline', () => {
  it('draws no problem segment when every window is healthy (GPU-bound / capped)', () => {
    const windows = makeWindowAnalysis([
      makeWindow(0, { limiter: 'gpu', metrics: { fpsAvg: 100 } }),
      makeWindow(1, { limiter: 'capped', metrics: { fpsAvg: 100 } }),
      makeWindow(2, { limiter: 'gpu', metrics: { fpsAvg: 99 } }),
    ]);
    const { container } = render(<WindowTimeline result={fixtureResult({ windows })} />);
    expect(seg(container)).toHaveLength(0);
    expect(screen.getByText(/smooth sailing/i)).toBeInTheDocument();
  });

  it('draws one merged segment for a consecutive CPU-bound stretch', () => {
    const windows = makeWindowAnalysis([
      makeWindow(0, { limiter: 'gpu', metrics: { fpsAvg: 100 } }),
      makeWindow(1, { limiter: 'cpu', metrics: { fpsAvg: 50 } }),
      makeWindow(2, { limiter: 'cpu', metrics: { fpsAvg: 48 } }),
      makeWindow(3, { limiter: 'gpu', metrics: { fpsAvg: 100 } }),
    ]);
    const { container } = render(<WindowTimeline result={fixtureResult({ windows })} />);
    expect(seg(container)).toHaveLength(1);
    expect(screen.getByText(/healthy case/i)).toBeInTheDocument();
  });

  it('draws a segment for a throttling window even when GPU-bound', () => {
    const windows = makeWindowAnalysis([
      makeWindow(0, { limiter: 'gpu', metrics: { fpsAvg: 100 } }),
      makeWindow(1, { limiter: 'gpu', metrics: { fpsAvg: 100, flagsFired: ['flag.cpu.thermalThrottle'] } }),
      makeWindow(2, { limiter: 'gpu', metrics: { fpsAvg: 100 } }),
    ]);
    const { container } = render(<WindowTimeline result={fixtureResult({ windows })} />);
    expect(seg(container)).toHaveLength(1);
  });

  it('marks each worst moment', () => {
    const windows = makeWindowAnalysis([
      makeWindow(0, { limiter: 'gpu', metrics: { fpsAvg: 100 } }),
      makeWindow(1, { limiter: 'gpu', metrics: { fpsAvg: 100 } }),
      makeWindow(2, { limiter: 'cpu', metrics: { fpsAvg: 38 } }),
      makeWindow(3, { limiter: 'gpu', metrics: { fpsAvg: 100 } }),
      makeWindow(4, { limiter: 'gpu', metrics: { fpsAvg: 100 } }),
    ]);
    const { container } = render(<WindowTimeline result={fixtureResult({ windows })} />);
    expect(marks(container).length).toBe(windows.worst.length);
    expect(marks(container).length).toBeGreaterThan(0);
  });

  it('renders nothing without windows', () => {
    const empty = makeWindowAnalysis([]);
    const { container } = render(<WindowTimeline result={fixtureResult({ windows: empty })} />);
    expect(container).toBeEmptyDOMElement();
  });
});

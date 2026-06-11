import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Timeline } from './Timeline';
import { DECIMATE_TARGET } from './decimate';
import { instances, resetUplotMock } from './_uplotMock';
import { fixtureResult } from '../_fixtures';
import { makeLog, makeWindow, makeWindowAnalysis } from '../../causes/testkit';
import { computeStats } from '../../stats/percentiles';

vi.mock('uplot', async () => {
  const mock = await import('./_uplotMock');
  return { default: mock.FakeUPlot };
});

function stubTokens(map: Record<string, string>) {
  vi.spyOn(window, 'getComputedStyle').mockReturnValue({
    getPropertyValue: (name: string) => map[name] ?? '',
  } as unknown as CSSStyleDeclaration);
}

// 6 rows, one sample every 2 s, with FPS plus two chip sensors present.
function timedResult() {
  const series = [100, 98, 45, 40, 44, 99];
  const log = makeLog({
    sensors: {
      'gpu.temp': [70, 72, 80, 85, 84, 71],
      'cpu.usageTotal': [40, 45, 90, 95, 92, 41],
    },
    fps: { source: 'displayed', sourceLabel: 'Framerate Displayed (avg)', series, stats: computeStats(series) },
  });
  log.timesMs = [0, 2000, 4000, 6000, 8000, 10000];
  return fixtureResult({ log });
}

const noop = () => {};

beforeEach(() => resetUplotMock());
afterEach(() => vi.restoreAllMocks());

describe('Timeline', () => {
  it('builds x + FPS + the default sensor overlay as named-scale series', () => {
    render(<Timeline result={timedResult()} selection={null} onSelect={noop} onClear={noop} />);
    const u = instances[0];
    expect(u.opts.series).toHaveLength(3);
    expect(u.opts.series[1]).toMatchObject({ label: 'FPS', scale: 'fps' });
    expect(u.opts.series[2]).toMatchObject({ label: 'GPU temp', scale: 'c' });
    expect(u.data[0]).toEqual([0, 2, 4, 6, 8, 10]); // seconds
    expect(u.data[1]).toEqual([100, 98, 45, 40, 44, 99]);
  });

  it('omits the FPS series entirely when no framerate was logged', () => {
    const result = timedResult();
    result.log.fps = { ...result.log.fps, source: 'none', series: [], stats: null };
    render(<Timeline result={result} selection={null} onSelect={noop} onClear={noop} />);
    const u = instances[0];
    expect(u.opts.series).toHaveLength(2); // x + sensor only
    expect(u.opts.series[1].scale).toBe('c');
  });

  it('series strokes come from the CSS tokens', () => {
    stubTokens({ '--accent': 'rgb(59, 158, 255)', '--text': '#e8eef6', '--text-dim': '#9aa7b8' });
    render(<Timeline result={timedResult()} selection={null} onSelect={noop} onClear={noop} />);
    const u = instances[0];
    expect(u.opts.series[1].stroke).toBe('rgb(59, 158, 255)');
    expect(u.opts.series[2].stroke).toBe('#9aa7b8');
  });

  it('registers a setSelect hook that maps a brush to rows', () => {
    const onSelect = vi.fn();
    render(<Timeline result={timedResult()} selection={null} onSelect={onSelect} onClear={noop} />);
    const u = instances[0];
    expect(u.opts.hooks?.setSelect?.length).toBe(1);
    // 600 px chart over 0–10 s: px 120–480 = 2 s–8 s → rows 1–4
    u.fireSelect(120, 360);
    expect(onSelect).toHaveBeenCalledWith(1, 4);
  });

  it('a brush narrower than 4 px clears instead of selecting', () => {
    const onSelect = vi.fn();
    const onClear = vi.fn();
    render(<Timeline result={timedResult()} selection={null} onSelect={onSelect} onClear={onClear} />);
    instances[0].fireSelect(300, 3);
    expect(onClear).toHaveBeenCalled();
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('the From/To inputs drive the identical selection (keyboard path)', () => {
    const onSelect = vi.fn();
    render(<Timeline result={timedResult()} selection={null} onSelect={onSelect} onClear={noop} />);
    fireEvent.change(screen.getByLabelText(/^from/i), { target: { value: '0:02' } });
    fireEvent.change(screen.getByLabelText(/^to/i), { target: { value: '0:08' } });
    fireEvent.click(screen.getByRole('button', { name: /select range/i }));
    expect(onSelect).toHaveBeenCalledWith(1, 4);
  });

  it('rejects a malformed time without selecting', () => {
    const onSelect = vi.fn();
    render(<Timeline result={timedResult()} selection={null} onSelect={onSelect} onClear={noop} />);
    fireEvent.change(screen.getByLabelText(/^from/i), { target: { value: 'banana' } });
    fireEvent.change(screen.getByLabelText(/^to/i), { target: { value: '0:08' } });
    fireEvent.click(screen.getByRole('button', { name: /select range/i }));
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('switching the sensor chip rebuilds the chart on the new named scale', () => {
    render(<Timeline result={timedResult()} selection={null} onSelect={noop} onClear={noop} />);
    fireEvent.click(screen.getByRole('button', { name: 'CPU usage' }));
    expect(instances.length).toBeGreaterThan(1);
    const u = instances[instances.length - 1];
    expect(u.opts.series[2]).toMatchObject({ label: 'CPU usage', scale: 'pct' });
  });

  it('decimates logs above 20,000 rows', () => {
    const n = 30000;
    const log = makeLog({
      sensors: { 'gpu.temp': Array(n).fill(70) },
      fps: { source: 'displayed', sourceLabel: 'x', series: Array(n).fill(100) },
    });
    log.timesMs = Array.from({ length: n }, (_, i) => i * 100);
    render(<Timeline result={fixtureResult({ log })} selection={null} onSelect={noop} onClear={noop} />);
    expect(instances[0].data[0].length).toBeLessThanOrEqual(DECIMATE_TARGET);
  });

  it('exposes a text-summary aria-label on the chart container', () => {
    render(<Timeline result={timedResult()} selection={null} onSelect={noop} onClear={noop} />);
    expect(screen.getByRole('img').getAttribute('aria-label')).toMatch(/FPS avg \d+/);
  });

  it('says "no framerate logged" in the summary when FPS is absent', () => {
    const result = timedResult();
    result.log.fps = { ...result.log.fps, source: 'none', series: [], stats: null };
    render(<Timeline result={result} selection={null} onSelect={noop} onClear={noop} />);
    expect(screen.getByRole('img').getAttribute('aria-label')).toMatch(/no framerate logged/);
  });

  it('keeps the smooth-sailing caption when every window is healthy', () => {
    const windows = makeWindowAnalysis([
      makeWindow(0, { limiter: 'gpu', metrics: { fpsAvg: 100 } }),
      makeWindow(1, { limiter: 'capped', metrics: { fpsAvg: 100 } }),
    ]);
    render(<Timeline result={{ ...timedResult(), windows }} selection={null} onSelect={noop} onClear={noop} />);
    expect(screen.getByText(/smooth sailing/i)).toBeInTheDocument();
  });

  it('labels the always-on FPS line and the active sensor overlay in the legend', () => {
    const { container } = render(<Timeline result={timedResult()} selection={null} onSelect={noop} onClear={noop} />);
    const legend = container.querySelector('.tl-legend');
    expect(legend).toHaveTextContent('FPS');
    expect(legend).toHaveTextContent('GPU temp'); // the default overlay
  });

  it('drops the FPS legend entry when no framerate was logged', () => {
    const result = timedResult();
    result.log.fps = { ...result.log.fps, source: 'none', series: [], stats: null };
    const { container } = render(<Timeline result={result} selection={null} onSelect={noop} onClear={noop} />);
    const legend = container.querySelector('.tl-legend');
    expect(legend).not.toHaveTextContent('FPS');
    expect(legend).toHaveTextContent('GPU temp'); // sensor overlay still labeled
  });

  it('plots elapsed time from the log start, not wall-clock time of day', () => {
    const result = timedResult();
    // HWiNFO timestamps are ms-since-midnight; a 17:26:40 start would otherwise
    // render the axis as "1046:40" instead of "0:00".
    result.log.timesMs = [62800000, 62802000, 62804000, 62806000, 62808000, 62810000];
    render(<Timeline result={result} selection={null} onSelect={noop} onClear={noop} />);
    expect(instances[0].data[0]).toEqual([0, 2, 4, 6, 8, 10]);
  });

  it('brush still maps to the right rows when the log starts at a wall-clock offset', () => {
    const onSelect = vi.fn();
    const result = timedResult();
    result.log.timesMs = [62800000, 62802000, 62804000, 62806000, 62808000, 62810000];
    render(<Timeline result={result} selection={null} onSelect={onSelect} onClear={noop} />);
    // 600 px over 0–10 s elapsed: px 120–480 = 2 s–8 s → rows 1–4
    instances[0].fireSelect(120, 360);
    expect(onSelect).toHaveBeenCalledWith(1, 4);
  });

  it('renders nothing without windows', () => {
    const { container } = render(
      <Timeline result={{ ...timedResult(), windows: makeWindowAnalysis([]) }} selection={null} onSelect={noop} onClear={noop} />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});

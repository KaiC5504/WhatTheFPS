import { describe, it, expect } from 'vitest';
import { buildEventMarkers, buildRailSegments, buildWorstMarkers, drawRail, RAIL_H } from './plugins';
import type { RailDrawTarget, RailPaint, TimelineMarker } from './plugins';
import type { ChartTheme } from './chartTheme';
import type { DiagEvent } from '../../types';
import { makeWindow, makeWindowAnalysis } from '../../causes/testkit';

const theme: ChartTheme = {
  accent: '#acc', text: '#txt', textDim: '#dim', warn: '#wrn', bad: '#bad',
  good: '#good', inset: '#ins', border: '#brd', fontMono: 'monospace',
};

function makeEvent(over: Partial<DiagEvent> = {}): DiagEvent {
  return { id: 'cpu-bound', type: 'cpuBottleneck', severity: 'warn', sentence: 'CPU held the GPU back.', sampleCount: 10, ...over };
}

// makeWindow(i, { durMs: 8000 }) default: window i spans i*8000 .. i*8000+6000 ms

describe('buildRailSegments', () => {
  it('emits nothing when every gameplay window is healthy (GPU-bound / capped)', () => {
    const segs = buildRailSegments([
      makeWindow(0, { limiter: 'gpu' }),
      makeWindow(1, { limiter: 'capped' }),
      makeWindow(2, { limiter: 'gpu' }),
    ]);
    expect(segs).toEqual([]);
  });

  it('coalesces a consecutive CPU-bound run into one segment', () => {
    const segs = buildRailSegments([
      makeWindow(0, { limiter: 'gpu' }),
      makeWindow(1, { limiter: 'cpu' }),
      makeWindow(2, { limiter: 'cpu' }),
      makeWindow(3, { limiter: 'gpu' }),
    ]);
    expect(segs).toEqual([{ kind: 'cpu', startMs: 8000, endMs: 22000 }]);
  });

  it('a healthy window between two CPU runs splits them', () => {
    const segs = buildRailSegments([
      makeWindow(0, { limiter: 'cpu' }),
      makeWindow(1, { limiter: 'gpu' }),
      makeWindow(2, { limiter: 'cpu' }),
    ]);
    expect(segs.map((s) => s.kind)).toEqual(['cpu', 'cpu']);
  });

  it('a throttle flag overrides the limiter, even when GPU-bound', () => {
    const segs = buildRailSegments([
      makeWindow(0, { limiter: 'gpu', metrics: { flagsFired: ['flag.cpu.thermalThrottle'] } }),
    ]);
    expect(segs).toEqual([{ kind: 'throttle', startMs: 0, endMs: 6000 }]);
  });

  it('maps underutilized to its own kind and never paints non-gameplay windows', () => {
    const segs = buildRailSegments([
      makeWindow(0, { limiter: 'underutilized' }),
      makeWindow(1, { activity: 'idle', limiter: 'cpu' }),
    ]);
    expect(segs).toEqual([{ kind: 'under', startMs: 0, endMs: 6000 }]);
  });

  it('handles empty input', () => {
    expect(buildRailSegments([])).toEqual([]);
  });
});

describe('buildEventMarkers', () => {
  const windows = [makeWindow(0), makeWindow(1), makeWindow(2)];

  it('places a marker at the FIRST listed window center, colored by severity', () => {
    const markers = buildEventMarkers([makeEvent({ severity: 'bad', windowIndexes: [1, 2] })], windows);
    // window 1 spans 8000–14000 ms → center 11000
    expect(markers).toEqual([{ ms: 11000, severity: 'bad', shape: 'event', label: 'CPU held the GPU back.' }]);
  });

  it('skips info events and events without window indexes', () => {
    const markers = buildEventMarkers([
      makeEvent({ severity: 'info', windowIndexes: [0] }),
      makeEvent({ windowIndexes: [] }),
      makeEvent({ windowIndexes: undefined }),
    ], windows);
    expect(markers).toEqual([]);
  });

  it('skips events pointing at a window the analysis does not have', () => {
    expect(buildEventMarkers([makeEvent({ windowIndexes: [99] })], windows)).toEqual([]);
  });

  it('handles empty inputs', () => {
    expect(buildEventMarkers([], [])).toEqual([]);
    expect(buildEventMarkers([makeEvent({ windowIndexes: [0] })], [])).toEqual([]);
  });
});

describe('buildWorstMarkers', () => {
  it('emits a distinct worst-shaped, bad-severity marker per worst moment', () => {
    const wa = makeWindowAnalysis([
      makeWindow(0, { limiter: 'gpu', metrics: { fpsAvg: 100 } }),
      makeWindow(1, { limiter: 'gpu', metrics: { fpsAvg: 100 } }),
      makeWindow(2, { limiter: 'cpu', metrics: { fpsAvg: 38 } }),
      makeWindow(3, { limiter: 'gpu', metrics: { fpsAvg: 100 } }),
    ]);
    const markers = buildWorstMarkers(wa.worst);
    expect(markers.length).toBe(wa.worst.length);
    expect(markers.length).toBeGreaterThan(0);
    for (const m of markers) {
      expect(m.shape).toBe('worst');
      expect(m.severity).toBe('bad');
      expect(m.label).toMatch(/worst moment: −\d+% FPS/);
    }
  });
});

describe('drawRail', () => {
  function recorder(width = 600) {
    const rects: { x: number; y: number; w: number; h: number; fill: string }[] = [];
    const paths: string[] = [];
    let fillStyle = '';
    const ctx = {
      save() {}, restore() {}, beginPath() {}, closePath() {}, moveTo() {}, lineTo() {},
      fill() { paths.push(fillStyle); },
      fillRect(x: number, y: number, w: number, h: number) { rects.push({ x, y, w, h, fill: fillStyle }); },
      set fillStyle(v: string) { fillStyle = v; },
      get fillStyle() { return fillStyle; },
    };
    const target: RailDrawTarget = {
      ctx: ctx as unknown as CanvasRenderingContext2D,
      bbox: { left: 0, top: 0, width, height: 200 },
      // 600 canvas px over 0–10 s
      valToPos: (sec: number) => sec * 60,
    };
    return { target, rects, paths };
  }

  it('paints the track, the segments, and the markers with theme colors', () => {
    const { target, rects, paths } = recorder();
    const markers: TimelineMarker[] = [
      { ms: 5000, severity: 'warn', shape: 'event', label: 'x' },
      { ms: 7000, severity: 'bad', shape: 'worst', label: 'y' },
    ];
    const paint: RailPaint = {
      segments: [{ kind: 'cpu', startMs: 2000, endMs: 6000 }, { kind: 'throttle', startMs: 8000, endMs: 9000 }],
      markers,
      theme,
    };
    drawRail(target, paint);

    const railY = 200 - RAIL_H;
    expect(rects[0]).toEqual({ x: 0, y: railY, w: 600, h: RAIL_H, fill: theme.inset }); // track
    expect(rects[1]).toEqual({ x: 120, y: railY, w: 240, h: RAIL_H, fill: theme.warn }); // cpu run
    expect(rects[2].fill).toBe(theme.bad); // throttle run
    expect(paths).toEqual([theme.warn, theme.bad]); // one fill per marker, severity-colored
  });

  it('paints only the track when there are no segments or markers', () => {
    const { target, rects, paths } = recorder();
    drawRail(target, { segments: [], markers: [], theme });
    expect(rects).toHaveLength(1);
    expect(paths).toHaveLength(0);
  });

  it('paints nothing on a degenerate bbox', () => {
    const { target, rects } = recorder(0);
    drawRail(target, { segments: [{ kind: 'cpu', startMs: 0, endMs: 1000 }], markers: [], theme });
    expect(rects).toHaveLength(0);
  });
});

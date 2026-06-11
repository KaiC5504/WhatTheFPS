import type uPlot from 'uplot';
import type { DiagEvent, FlagKey, WindowClassification, WorstMoment } from '../../types';
import type { ChartTheme } from './chartTheme';

// Throttle/limit flags that mean the hardware was actually being held back (heat,
// power, current) — as opposed to GPU perf-limit "power/util" which is normal at load.
const THROTTLE_FLAGS = new Set<FlagKey>([
  'flag.cpu.thermalThrottle', 'flag.cpu.prochot', 'flag.cpu.ratl', 'flag.cpu.powerLimit',
  'flag.gpu.perfLimitThermal', 'flag.gpu.perfLimitCurrent',
]);

export type RailKind = 'throttle' | 'cpu' | 'under' | 'none';

export function railKind(w: WindowClassification): RailKind {
  if (w.activity !== 'gameplay') return 'none';
  if (w.metrics.flagsFired.some((f) => THROTTLE_FLAGS.has(f))) return 'throttle';
  if (w.limiter === 'cpu') return 'cpu';
  if (w.limiter === 'underutilized') return 'under';
  return 'none';
}

export interface RailSegment { kind: Exclude<RailKind, 'none'>; startMs: number; endMs: number; }

// Coalesce consecutive windows of the same rail kind; only non-'none' runs get
// drawn. Ported behavior-for-behavior from the old SVG WindowTimeline.
export function buildRailSegments(windows: WindowClassification[]): RailSegment[] {
  const segs: RailSegment[] = [];
  let run: { kind: RailKind; startMs: number; endMs: number } | null = null;
  for (const w of windows) {
    const kind = railKind(w);
    if (run && run.kind === kind) {
      run.endMs = w.window.endMs;
    } else {
      if (run && run.kind !== 'none') segs.push(run as RailSegment);
      run = { kind, startMs: w.window.startMs, endMs: w.window.endMs };
    }
  }
  if (run && run.kind !== 'none') segs.push(run as RailSegment);
  return segs;
}

export interface TimelineMarker {
  ms: number;                 // marker time = its window's center
  severity: 'warn' | 'bad';
  shape: 'event' | 'worst';   // diamonds for events, downward triangles for worst moments
  label: string;              // v2 plan #3 turns this into tooltip/annotation copy
}

// The marker contract (v2 plan #3 extends this seam — do not rename): a marker
// for every event with non-empty windowIndexes and severity !== 'info', placed
// at its first window's center.
export function buildEventMarkers(events: DiagEvent[], windows: WindowClassification[]): TimelineMarker[] {
  const byIndex = new Map(windows.map((w) => [w.window.index, w.window]));
  const out: TimelineMarker[] = [];
  for (const e of events) {
    if (e.severity === 'info') continue;
    if (!e.windowIndexes || e.windowIndexes.length === 0) continue;
    const w = byIndex.get(e.windowIndexes[0]);
    if (!w) continue;
    out.push({ ms: (w.startMs + w.endMs) / 2, severity: e.severity, shape: 'event', label: e.sentence });
  }
  return out;
}

export function buildWorstMarkers(worst: WorstMoment[]): TimelineMarker[] {
  return worst.map((wm) => {
    const w = wm.classification.window;
    return {
      ms: (w.startMs + w.endMs) / 2,
      severity: 'bad' as const,
      shape: 'worst' as const,
      label: `worst moment: −${Math.round(wm.fpsDropPct)}% FPS`,
    };
  });
}

export const RAIL_H = 8;
const MARK = 5;

export interface RailPaint { segments: RailSegment[]; markers: TimelineMarker[]; theme: ChartTheme; }

// The structural subset of a uPlot instance drawRail needs, so tests can pass
// a recording fake instead of a real canvas.
export interface RailDrawTarget {
  ctx: CanvasRenderingContext2D;
  bbox: { left: number; top: number; width: number; height: number };
  valToPos: (val: number, scale: string, canvasPx?: boolean) => number;
}

export function drawRail(u: RailDrawTarget, paint: RailPaint): void {
  const { ctx, bbox } = u;
  if (bbox.width <= 0 || bbox.height <= 0) return;
  // bbox and valToPos(…, true) are in canvas pixels, so CSS-pixel sizes scale by dpr
  const dpr = typeof devicePixelRatio === 'number' ? devicePixelRatio : 1;
  const railH = RAIL_H * dpr;
  const railY = bbox.top + bbox.height - railH;

  ctx.save();
  ctx.fillStyle = paint.theme.inset;
  ctx.fillRect(bbox.left, railY, bbox.width, railH);

  for (const seg of paint.segments) {
    const x0 = u.valToPos(seg.startMs / 1000, 'x', true);
    const x1 = u.valToPos(seg.endMs / 1000, 'x', true);
    ctx.fillStyle = seg.kind === 'throttle' ? paint.theme.bad : paint.theme.warn;
    ctx.fillRect(x0, railY, Math.max(x1 - x0, 1), railH);
  }

  for (const m of paint.markers) {
    const x = u.valToPos(m.ms / 1000, 'x', true);
    const s = MARK * dpr;
    ctx.fillStyle = m.severity === 'bad' ? paint.theme.bad : paint.theme.warn;
    ctx.beginPath();
    if (m.shape === 'worst') {
      // downward triangle sitting on the rail, as in the old SVG timeline
      ctx.moveTo(x - s, railY - s * 1.4);
      ctx.lineTo(x + s, railY - s * 1.4);
      ctx.lineTo(x, railY);
    } else {
      // diamond floating above the worst-moment ticks
      const cy = railY - s * 2.8;
      ctx.moveTo(x, cy - s);
      ctx.lineTo(x + s, cy);
      ctx.lineTo(x, cy + s);
      ctx.lineTo(x - s, cy);
    }
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

// One paint surface: the rail and markers go into the chart's own canvas via a
// draw hook, so there is no SVG overlay to keep scroll/zoom-synced.
export function railPlugin(paint: RailPaint): uPlot.Plugin {
  return { hooks: { draw: (u) => drawRail(u, paint) } };
}

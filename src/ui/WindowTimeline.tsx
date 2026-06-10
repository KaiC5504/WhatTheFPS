import type { AnalysisResult, FlagKey, WindowClassification } from '../types';
import { Card } from './primitives';
import './NerdView.css';

// Throttle/limit flags that mean the hardware was actually being held back (heat,
// power, current) — as opposed to GPU perf-limit "power/util" which is normal at load.
const THROTTLE_FLAGS = new Set<FlagKey>([
  'flag.cpu.thermalThrottle', 'flag.cpu.prochot', 'flag.cpu.ratl', 'flag.cpu.powerLimit',
  'flag.gpu.perfLimitThermal', 'flag.gpu.perfLimitCurrent',
]);

type RailKind = 'throttle' | 'cpu' | 'under' | 'none';

const KIND_META: Record<Exclude<RailKind, 'none'>, { color: string; label: string }> = {
  throttle: { color: 'var(--bad)', label: 'Throttling' },
  cpu: { color: 'var(--warn)', label: 'CPU-bound' },
  under: { color: 'var(--warn)', label: 'GPU underutilized' },
};

function railKind(w: WindowClassification): RailKind {
  if (w.activity !== 'gameplay') return 'none';
  if (w.metrics.flagsFired.some((f) => THROTTLE_FLAGS.has(f))) return 'throttle';
  if (w.limiter === 'cpu') return 'cpu';
  if (w.limiter === 'underutilized') return 'under';
  return 'none';
}

// Average the per-window series down to at most `max` points so a long log stops being
// a 300-point hairline. Returns evenly-chunked means in time order.
function downsample(pts: { cx: number; fps: number }[], max: number): { cx: number; fps: number }[] {
  if (pts.length <= max) return pts;
  const out: { cx: number; fps: number }[] = [];
  const size = pts.length / max;
  for (let i = 0; i < max; i++) {
    const start = Math.floor(i * size);
    const end = Math.floor((i + 1) * size);
    let sx = 0, sf = 0, n = 0;
    for (let j = start; j < end; j++) { sx += pts[j].cx; sf += pts[j].fps; n++; }
    if (n > 0) out.push({ cx: sx / n, fps: sf / n });
  }
  return out;
}

// Catmull-Rom → cubic bezier, so the line reads as a smooth curve while still passing
// through every (downsampled) point — real dips keep their depth.
function smoothPath(p: { cx: number; y: number }[]): string {
  if (p.length < 2) return '';
  let d = `M ${p[0].cx.toFixed(1)} ${p[0].y.toFixed(1)}`;
  for (let i = 0; i < p.length - 1; i++) {
    const p0 = p[i - 1] ?? p[i];
    const p1 = p[i];
    const p2 = p[i + 1];
    const p3 = p[i + 2] ?? p2;
    const c1x = p1.cx + (p2.cx - p0.cx) / 6;
    const c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.cx - (p3.cx - p1.cx) / 6;
    const c2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C ${c1x.toFixed(1)} ${c1y.toFixed(1)}, ${c2x.toFixed(1)} ${c2y.toFixed(1)}, ${p2.cx.toFixed(1)} ${p2.y.toFixed(1)}`;
  }
  return d;
}

export function WindowTimeline({ result }: { result: AnalysisResult }): JSX.Element | null {
  const { windows, worst } = result.windows;
  if (windows.length === 0) return null;

  const W = 720;
  const SPARK_H = 96;
  const GAP = 8;
  const RAIL_H = 10;
  const MARK_H = 7;
  const RAIL_Y = SPARK_H + GAP;
  const H = RAIL_Y + RAIL_H;
  const MAX_COLS = 90;

  const t0 = windows[0].window.startMs;
  const t1 = windows[windows.length - 1].window.endMs;
  const span = Math.max(t1 - t0, 1);
  const x = (ms: number) => ((ms - t0) / span) * W;

  const raw = windows
    .filter((w) => w.metrics.fpsAvg !== null)
    .map((w) => ({ cx: x((w.window.startMs + w.window.endMs) / 2), fps: w.metrics.fpsAvg as number }));
  const pts = downsample(raw, MAX_COLS);
  const fpsMax = Math.max(...pts.map((p) => p.fps), 1);
  const y = (fps: number) => SPARK_H - (fps / fpsMax) * (SPARK_H - 8);
  const path = smoothPath(pts.map((p) => ({ cx: p.cx, y: y(p.fps) })));

  // Coalesce consecutive windows of the same rail kind; only non-'none' runs get drawn.
  type Seg = { kind: Exclude<RailKind, 'none'>; startMs: number; endMs: number; idx: number };
  const segs: Seg[] = [];
  let run: { kind: RailKind; startMs: number; endMs: number; idx: number } | null = null;
  for (const w of windows) {
    const kind = railKind(w);
    if (run && run.kind === kind) {
      run.endMs = w.window.endMs;
    } else {
      if (run && run.kind !== 'none') segs.push(run as Seg);
      run = { kind, startMs: w.window.startMs, endMs: w.window.endMs, idx: w.window.index };
    }
  }
  if (run && run.kind !== 'none') segs.push(run as Seg);

  const caption = segs.length === 0
    ? 'No CPU-bound or throttling stretches — smooth sailing.'
    : 'Quiet stretches were GPU-bound or at your FPS cap — the healthy case.';

  return (
    <Card className="nerd-card">
      <h3 className="nerd-h">Session timeline</h3>
      <svg className="nerd-spark nerd-spark--timeline" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none"
        role="img" aria-label="FPS over the session; problem stretches highlighted below">
        {path && (
          <path className="wt-line" d={path} fill="none" stroke="var(--text)" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
        )}

        <rect className="wt-rail-track" x={x(t0)} y={RAIL_Y} width={Math.max(x(t1) - x(t0), 1)} height={RAIL_H} fill="var(--inset)" />
        {segs.map((s) => (
          <rect
            key={s.idx}
            className="wt-rail-seg"
            x={x(s.startMs)}
            y={RAIL_Y}
            width={Math.max(x(s.endMs) - x(s.startMs), 1)}
            height={RAIL_H}
            fill={KIND_META[s.kind].color}
          >
            <title>{KIND_META[s.kind].label}</title>
          </rect>
        ))}

        {worst.map((wm) => {
          const c = (wm.classification.window.startMs + wm.classification.window.endMs) / 2;
          const cx = x(c);
          return (
            <polygon
              key={wm.classification.window.index}
              className="wt-worst"
              points={`${(cx - 5).toFixed(1)},${RAIL_Y - MARK_H} ${(cx + 5).toFixed(1)},${RAIL_Y - MARK_H} ${cx.toFixed(1)},${RAIL_Y}`}
              fill="var(--bad)"
            >
              <title>{`worst moment: −${Math.round(wm.fpsDropPct)}% FPS`}</title>
            </polygon>
          );
        })}
      </svg>
      <div className="nerd-legend">
        <span><i style={{ background: 'var(--warn)' }} />CPU-bound</span>
        <span><i style={{ background: 'var(--bad)' }} />Throttling</span>
        <span><i className="wt-legend-mark" />Worst moment</span>
      </div>
      <p className="wt-caption u-dim">{caption}</p>
    </Card>
  );
}

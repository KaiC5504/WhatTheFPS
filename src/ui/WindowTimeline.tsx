import type { AnalysisResult, Limiter } from '../types';
import { Card } from './primitives';
import './NerdView.css';

const LIMITER_FILL: Record<Limiter, string> = {
  gpu: 'var(--accent)',
  cpu: 'var(--text-dim)',
  capped: 'var(--good)',
  underutilized: 'var(--warn)',
  ambiguous: 'var(--surface-3)',
  unknown: 'var(--inset)',
};

export function WindowTimeline({ result }: { result: AnalysisResult }): JSX.Element | null {
  const { windows } = result.windows;
  if (windows.length === 0) return null;

  const W = 720;
  const SPARK_H = 96;
  const BAND_H = 14;
  const H = SPARK_H + 8 + BAND_H;

  const t0 = windows[0].window.startMs;
  const t1 = windows[windows.length - 1].window.endMs;
  const span = Math.max(t1 - t0, 1);
  const x = (ms: number) => ((ms - t0) / span) * W;

  const fpsPoints = windows
    .filter((w) => w.metrics.fpsAvg !== null)
    .map((w) => ({ cx: x((w.window.startMs + w.window.endMs) / 2), fps: w.metrics.fpsAvg as number }));
  const fpsMax = Math.max(...fpsPoints.map((p) => p.fps), 1);
  const y = (fps: number) => SPARK_H - (fps / fpsMax) * (SPARK_H - 8);
  const polyline = fpsPoints.map((p) => `${p.cx.toFixed(1)},${y(p.fps).toFixed(1)}`).join(' ');

  // Collapse consecutive windows that paint the same colour into one rect. On a long
  // log a per-window strip degrades into a barcode (1px slivers + sub-pixel seams);
  // merged runs read as solid limiter blocks instead.
  type Band = { idx: number; fill: string; stroke: string; startMs: number; endMs: number; label: string; count: number };
  const bands: Band[] = [];
  for (const w of windows) {
    const gameplay = w.activity === 'gameplay';
    const fill = gameplay ? LIMITER_FILL[w.limiter] : 'transparent';
    const stroke = gameplay ? 'none' : 'var(--border-strong)';
    const prev = bands[bands.length - 1];
    if (prev && prev.fill === fill && prev.stroke === stroke) {
      prev.endMs = w.window.endMs;
      prev.count += 1;
    } else {
      bands.push({
        idx: w.window.index, fill, stroke,
        startMs: w.window.startMs, endMs: w.window.endMs,
        label: gameplay ? `${w.activity} / ${w.limiter}` : w.activity,
        count: 1,
      });
    }
  }

  return (
    <Card className="nerd-card">
      <h3 className="nerd-h">Session timeline</h3>
      <svg className="nerd-spark nerd-spark--timeline" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none"
        role="img" aria-label="FPS over the session with per-window limiter classification">
        {fpsPoints.length >= 2 && (
          <polyline points={polyline} fill="none" stroke="var(--text)" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
        )}
        {bands.map((b) => (
          <rect
            key={b.idx}
            x={x(b.startMs)}
            y={SPARK_H + 8}
            width={Math.max(x(b.endMs) - x(b.startMs), 1)}
            height={BAND_H}
            fill={b.fill}
            stroke={b.stroke}
          >
            <title>{b.count > 1 ? `${b.label} · ${b.count} windows` : b.label}</title>
          </rect>
        ))}
      </svg>
      <div className="nerd-legend">
        <span><i style={{ background: 'var(--accent)' }} />GPU-bound</span>
        <span><i style={{ background: 'var(--text-dim)' }} />CPU-bound</span>
        <span><i style={{ background: 'var(--good)' }} />Capped</span>
        <span><i style={{ background: 'var(--surface-3)' }} />Unclear</span>
      </div>
    </Card>
  );
}

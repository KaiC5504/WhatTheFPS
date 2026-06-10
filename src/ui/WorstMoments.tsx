import type { WorstMoment } from '../types';
import { Card } from './primitives';
import { EvidenceBadge } from './EvidenceBadge';
import './WorstMoments.css';

const LIMITER_LABEL: Record<string, string> = {
  gpu: 'GPU-bound', cpu: 'CPU-bound', capped: 'capped', underutilized: 'GPU underutilized',
  ambiguous: 'unclear', unknown: 'unclassified',
};

function offsetLabel(startMs: number, baseMs: number): string {
  const off = Math.max(0, startMs - baseMs);
  const mm = Math.floor(off / 60_000);
  const ss = Math.round((off % 60_000) / 1000);
  return `+${mm}m${String(ss).padStart(2, '0')}s`;
}

export function WorstMoments({ worst, baseMs = 0 }: { worst: WorstMoment[]; baseMs?: number }): JSX.Element | null {
  if (worst.length === 0) return null;
  return (
    <Card className="worst nerd-card">
      <h3 className="nerd-h">Worst moments</h3>
      <div className="worst__grid">
        {worst.map((wm) => {
          const c = wm.classification;
          return (
            <div key={c.window.index} className="worst__item">
              <div className="worst__head">
                <span className="mono u-dim">{offsetLabel(c.window.startMs, baseMs)}</span>
                <span className="worst__drop mono">−{Math.round(wm.fpsDropPct)}%</span>
                <span className="u-label">{LIMITER_LABEL[c.limiter]}</span>
                <EvidenceBadge evidence={c.tier ? { tier: c.tier, basis: c.basis } : undefined} />
              </div>
              <dl className="worst__snapshot mono">
                {wm.snapshot.map((s) => (
                  <div key={s.label}>
                    <dt>{s.label}</dt>
                    <dd>{s.value}{s.unit ? ` ${s.unit}` : ''}</dd>
                  </div>
                ))}
              </dl>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

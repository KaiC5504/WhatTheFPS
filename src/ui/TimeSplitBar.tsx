import type { Limiter, TimeSplit } from '../types';
import { Card } from './primitives';
import { cx } from './cx';
import './TimeSplitBar.css';

const SEGMENTS: { key: Limiter; label: string; mod: string }[] = [
  { key: 'gpu', label: 'GPU-bound', mod: 'gpu' },
  { key: 'cpu', label: 'CPU-bound', mod: 'cpu' },
  { key: 'capped', label: 'Capped', mod: 'capped' },
  { key: 'underutilized', label: 'Underutilized', mod: 'under' },
  { key: 'ambiguous', label: 'Unclear', mod: 'amb' },
  { key: 'unknown', label: 'No data', mod: 'unknown' },
];

export function TimeSplitBar({ split, activityKind }: { split: TimeSplit; activityKind: 'gameplay' | 'workload' }): JSX.Element | null {
  if (split.gameplayMs <= 0) return null;
  const segs = SEGMENTS
    .map((s) => ({ ...s, share: split.shares[s.key] ?? 0 }))
    .filter((s) => s.share >= 0.005);
  if (segs.length === 0) return null;

  const word = activityKind === 'gameplay' ? 'gameplay' : 'active workload';
  const summary = segs.map((s) => `${s.label} ${Math.round(s.share * 100)}%`).join(', ');

  return (
    <Card className="tsb">
      <h3 className="tsb__title u-label">Where the time went ({word} only)</h3>
      <div className="tsb__bar" role="img" aria-label={summary}>
        {segs.map((s) => (
          <span key={s.key} className={cx('tsb__seg', `tsb__seg--${s.mod}`)} style={{ flexGrow: s.share }} />
        ))}
      </div>
      <div className="tsb__legend">
        {segs.map((s) => (
          <span key={s.key} className="tsb__legend-item">
            <i className={cx('tsb__dot', `tsb__seg--${s.mod}`)} />
            <span>{s.label}</span>
            <span className="mono">{Math.round(s.share * 100)}%</span>
          </span>
        ))}
      </div>
    </Card>
  );
}

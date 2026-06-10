import type { CoreMatrix } from '../types';
import { Card } from './primitives';
import './CoreGrid.css';

function stats(values: (number | null)[]): { avg: number; max: number } | null {
  let sum = 0, n = 0, max = -Infinity;
  for (const v of values) {
    if (v === null || !Number.isFinite(v)) continue;
    sum += v; n++;
    if (v > max) max = v;
  }
  return n === 0 ? null : { avg: sum / n, max };
}

export function CoreGrid({ cores }: { cores: CoreMatrix | null }): JSX.Element | null {
  if (!cores || cores.usage.length === 0) return null;
  const rows = cores.usage
    .map((s) => ({ label: s.label, coreType: s.coreType, st: stats(s.values) }))
    .filter((r): r is typeof r & { st: NonNullable<typeof r.st> } => r.st !== null);
  if (rows.length === 0) return null;

  return (
    <Card className="core-grid nerd-card">
      <h3 className="nerd-h">Per-thread CPU usage</h3>
      <div className="nerd-table-wrap">
        <table className="nerd-table mono">
          <thead>
            <tr><th className="nerd-table__name">Thread</th><th>avg</th><th>max</th></tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.label} className={r.st.max >= 95 ? 'core-grid__row--pinned' : ''}>
                <th className="nerd-table__name" scope="row">{r.label}</th>
                <td>{Math.round(r.st.avg)}</td>
                <td>{Math.round(r.st.max)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

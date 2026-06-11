import type { Comparison, SavedRun } from '../types';
import { Card, Button } from './primitives';
import { DIR_ARROW, deltaRowClass, fmtDelta, fmtSide } from './compareFormat';
import './CompareView.css';

export function CompareView({ before, after, comparison, onSwap, onExit }: {
  before: SavedRun;
  after: SavedRun;
  comparison: Comparison;
  onSwap: () => void;
  onExit: () => void;
}): JSX.Element {
  return (
    <Card className="compare-view">
      <div className="compare-view__header">
        <h2 className="compare-view__headline">{comparison.headline}</h2>
        <div className="compare-view__actions">
          <Button variant="subtle" onClick={onSwap}>Swap</Button>
          <Button variant="ghost" onClick={onExit}>Exit compare</Button>
        </div>
      </div>

      {comparison.mismatches.length > 0 && (
        <div className="compare-view__banner" role="status">
          {comparison.mismatches.map((m) => <p key={m.kind}>{m.message}</p>)}
        </div>
      )}
      <p className="compare-view__caveat u-dim">{comparison.caveat}</p>

      <table className="compare-view__table mono">
        <thead>
          <tr>
            <th />
            <th>BEFORE<span className="compare-view__run">{before.name}</span></th>
            <th>AFTER<span className="compare-view__run">{after.name}</span></th>
            <th>Δ</th>
          </tr>
        </thead>
        <tbody>
          {comparison.heroDeltas.map((d) => (
            <tr key={d.key} className={deltaRowClass(d)}>
              <th scope="row">{d.label}</th>
              <td>{fmtSide(d.before, d.unit)}</td>
              <td>{fmtSide(d.after, d.unit)}</td>
              <td className="compare-view__delta">
                {d.delta === null ? '—' : `${DIR_ARROW[d.direction]} ${fmtDelta(d)}`}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

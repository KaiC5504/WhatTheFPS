import type { Comparison, DiagEvent, DeltaStat } from '../types';
import { Card } from './primitives';
import { DIR_ARROW, deltaRowClass, fmtDelta, fmtSide } from './compareFormat';
import './CompareTable.css';

const STAT_LABEL: Record<DeltaStat, string> = {
  avg: 'avg', max: 'max', p1Low: '1% low', p5Low: '5% low', fired: 'samples fired',
};

function EventGroup({ title, events }: { title: string; events: DiagEvent[] }): JSX.Element {
  return (
    <div className="compare-table__group">
      <h4 className="u-label">{title}</h4>
      {events.length === 0 ? (
        <p className="u-dim">none</p>
      ) : (
        <ul className="compare-table__events">
          {events.map((e) => <li key={e.id}>[{e.severity}] {e.sentence}</li>)}
        </ul>
      )}
    </div>
  );
}

export function CompareTable({ comparison }: { comparison: Comparison }): JSX.Element {
  // a row with neither side measured says nothing — drop it
  const rows = comparison.sensorDeltas.filter((d) => d.before !== null || d.after !== null);
  return (
    <Card className="compare-table">
      <h3 className="compare-table__h">Per-stat deltas</h3>
      <div className="compare-table__wrap">
        <table className="compare-table__table mono">
          <thead>
            <tr>
              <th className="compare-table__name">Metric</th>
              <th>stat</th>
              <th>before</th>
              <th>after</th>
              <th>Δ</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((d) => (
              <tr key={`${d.key}:${d.stat}`} className={deltaRowClass(d)}>
                <th className="compare-table__name" scope="row">{d.label}</th>
                <td>{STAT_LABEL[d.stat]}</td>
                <td>{fmtSide(d.before, d.unit)}</td>
                <td>{fmtSide(d.after, d.unit)}</td>
                <td className="compare-table__delta">
                  {d.delta === null ? '—' : `${DIR_ARROW[d.direction]} ${fmtDelta(d)}`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h3 className="compare-table__h">Event diff</h3>
      <div className="compare-table__diff">
        <EventGroup title="Resolved (gone in AFTER)" events={comparison.eventDiff.resolved} />
        <EventGroup title="Introduced (new in AFTER)" events={comparison.eventDiff.introduced} />
        <EventGroup title="Persisted (in both)" events={comparison.eventDiff.persisted} />
      </div>
    </Card>
  );
}

import type { AnalysisResult, Limiter, SelectionAnalysis } from '../../types';
import { Button, Card } from '../primitives';
import { fmtMmSs } from './Timeline';
import { LIMITER_LABEL } from '../limiterLabel';
import { n, unitSuffix } from '../numFormat';
import './SelectionPanel.css';

interface SelectionPanelProps {
  result: AnalysisResult;
  selection: SelectionAnalysis;
  onClear: () => void;
}

// The text alternative for whatever the brush selected on the chart: every
// number a sighted user reads off the selection exists here as real text.
export function SelectionPanel({ result, selection, onClear }: SelectionPanelProps): JSX.Element {
  const baseMs = result.log.timesMs[0] ?? 0;

  // log.sensors insertion order keeps the rows stable across selections
  const sensorRows = Object.values(result.log.sensors).flatMap((sensor) => {
    const stats = sensor ? selection.sensors[sensor.key] : undefined;
    return sensor && stats ? [{ sensor, stats }] : [];
  });

  return (
    <Card className="nerd-card sel-panel">
      <div className="sel-panel__head">
        <h3 className="nerd-h">Selection</h3>
        <Button variant="subtle" onClick={onClear}>Clear selection</Button>
      </div>

      <dl className="nerd-dl mono">
        <div>
          <dt>Range</dt>
          <dd>{fmtMmSs(selection.startMs - baseMs)}–{fmtMmSs(selection.endMs - baseMs)} ({fmtMmSs(selection.endMs - selection.startMs)})</dd>
        </div>
        <div><dt>Rows</dt><dd>{selection.startRow}–{selection.endRow}</dd></div>
        {selection.fps ? (
          <>
            <div><dt>FPS avg</dt><dd>{n(selection.fps.avg)}</dd></div>
            <div><dt>FPS 1% low</dt><dd>{n(selection.fps.p1Low)}</dd></div>
          </>
        ) : (
          <div><dt>FPS</dt><dd className="u-dim">no framerate logged</dd></div>
        )}
      </dl>

      {sensorRows.length > 0 && (
        <table className="nerd-table mono">
          <thead>
            <tr>
              <th className="nerd-table__name">Sensor</th>
              <th>avg</th><th>min</th><th>max</th>
            </tr>
          </thead>
          <tbody>
            {sensorRows.map(({ sensor, stats }) => {
              const u = unitSuffix(sensor.unit);
              return (
                <tr key={sensor.key}>
                  <th className="nerd-table__name" scope="row">{sensor.label}</th>
                  <td>{n(stats.avg)}{u}</td>
                  <td>{n(stats.min)}{u}</td>
                  <td>{n(stats.max)}{u}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      {selection.timeSplit ? (
        <>
          <ul className="sel-panel__split mono">
            {(Object.entries(selection.timeSplit.shares) as [Limiter, number][])
              .filter(([, share]) => share > 0)
              .map(([limiter, share]) => (
                <li key={limiter}>
                  <span>{LIMITER_LABEL[limiter]}</span>
                  <span>{Math.round(share * 100)}%</span>
                </li>
              ))}
          </ul>
          <p className="u-dim sel-panel__note">
            Across {selection.windowCount} analysis windows fully inside the selection.
          </p>
        </>
      ) : (
        <p className="u-dim sel-panel__note">
          Selection too short to attribute time — no analysis window fits fully inside.
        </p>
      )}
    </Card>
  );
}

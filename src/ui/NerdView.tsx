import type { AnalysisResult, CanonicalKey, Stats } from '../types';
import { Card } from './primitives';
import { WindowTimeline } from './WindowTimeline';
import { WorstMoments } from './WorstMoments';
import { CoreGrid } from './CoreGrid';
import './NerdView.css';

function n(x: number): string {
  return Number.isInteger(x) ? String(x) : x.toFixed(1);
}

// Stable display order; only keys actually present (count > 0) get a row.
const SENSOR_ORDER: CanonicalKey[] = [
  'cpu.tempPackage', 'cpu.tempCoreMax', 'cpu.usageTotal', 'cpu.usageCoreMax',
  'cpu.clock', 'cpu.clockEff', 'cpu.power', 'vrm.tempC',
  'gpu.temp', 'gpu.hotspot', 'gpu.memJunction', 'gpu.usage', 'gpu.memUsagePct',
  'gpu.memControllerLoad', 'gpu.clock', 'gpu.clockEff', 'gpu.power', 'gpu.powerLimit',
  'vram.allocatedMb', 'vram.availableMb', 'vram.d3dDedicatedMb', 'vram.d3dDynamicMb',
  'pm.frameTimeMs', 'pm.gpuBusyMs', 'pm.gpuWaitMs', 'pm.cpuBusyMs', 'pm.cpuWaitMs',
  'rtss.frameTimeMs',
  'igpu.temp', 'igpu.usage',
  'ram.loadPct', 'ram.usedMb', 'pagefile.usagePct', 'drive.tempC',
];

const STAT_COLS: { key: keyof Stats; label: string }[] = [
  { key: 'avg', label: 'avg' },
  { key: 'min', label: 'min' },
  { key: 'p5', label: 'p5' },
  { key: 'p95', label: 'p95' },
  { key: 'p99', label: 'p99' },
  { key: 'max', label: 'max' },
  { key: 'p1Low', label: '1% low' },
  { key: 'p5Low', label: '5% low' },
];

function SensorTable({ result }: { result: AnalysisResult }) {
  const rows = SENSOR_ORDER
    .map((key) => ({ key, stats: result.stats[key], sensor: result.log.sensors[key] }))
    .filter((r): r is { key: CanonicalKey; stats: Stats; sensor: NonNullable<typeof r.sensor> } =>
      !!r.stats && r.stats.count > 0 && !!r.sensor);

  return (
    <Card className="nerd-card">
      <h3 className="nerd-h">Per-sensor statistics</h3>
      <div className="nerd-table-wrap">
        <table className="nerd-table mono">
          <thead>
            <tr>
              <th className="nerd-table__name">Sensor</th>
              {STAT_COLS.map((c) => <th key={c.key}>{c.label}</th>)}
            </tr>
          </thead>
          <tbody>
            {rows.map(({ key, stats, sensor }) => {
              const u = sensor.unit ? (sensor.unit === '%' ? '%' : ` ${sensor.unit}`) : '';
              return (
                <tr key={key}>
                  <th className="nerd-table__name" scope="row">{sensor.label}</th>
                  {STAT_COLS.map((c) => <td key={c.key}>{n(stats[c.key])}{u}</td>)}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function FpsDetail({ result }: { result: AnalysisResult }) {
  const fps = result.log.fps;
  return (
    <Card className="nerd-card">
      <h3 className="nerd-h">Framerate detail</h3>
      {fps.source === 'none' || fps.stats === null ? (
        <p className="u-dim">No framerate logged.</p>
      ) : (
        <dl className="nerd-dl">
          <div><dt>Source</dt><dd>{fps.sourceLabel || fps.source}</dd></div>
          <div><dt>Displayed avg</dt><dd className="mono">{fps.displayedAvg !== null ? n(fps.displayedAvg) : 'n/a'}</dd></div>
          <div><dt>Presented avg</dt><dd className="mono">{fps.presentedAvg !== null ? n(fps.presentedAvg) : 'n/a'}</dd></div>
          <div><dt>p1 of sampled FPS</dt><dd className="mono">{n(fps.stats.p1Low)}</dd></div>
          <div><dt>p5 of sampled FPS</dt><dd className="mono">{n(fps.stats.p5Low)}</dd></div>
          {fps.presented1PctLow !== null && (
            <div><dt>1% low (per-frame)</dt><dd className="mono">{n(fps.presented1PctLow)}</dd></div>
          )}
          {fps.presented01PctLow !== null && (
            <div><dt>0.1% low (per-frame)</dt><dd className="mono">{n(fps.presented01PctLow)}</dd></div>
          )}
          <div><dt>Cap</dt><dd>{fps.capped && fps.capValue !== null ? `~${n(fps.capValue)} FPS` : 'none'}</dd></div>
        </dl>
      )}
    </Card>
  );
}

function FlagTable({ result }: { result: AnalysisResult }) {
  const flags = Object.values(result.log.flags).filter((f) => !!f);
  return (
    <Card className="nerd-card">
      <h3 className="nerd-h">Throttle &amp; limit flags</h3>
      {flags.length === 0 ? (
        <p className="u-dim">No throttle or limit flags were recorded.</p>
      ) : (
        <ul className="nerd-flags">
          {flags.map((f) => {
            const fired = f.values.filter(Boolean).length;
            const total = f.values.length;
            return (
              <li key={f.key} className={fired > 0 ? 'is-fired' : ''}>
                <span>{f.label}</span>
                <span className="mono">{fired} of {total}</span>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

export function NerdView({ result }: { result: AnalysisResult }): JSX.Element {
  return (
    <div className="nerd-view stack">
      <WindowTimeline result={result} />
      <WorstMoments worst={result.windows.worst} baseMs={result.windows.windows[0]?.window.startMs ?? 0} />
      <CoreGrid cores={result.log.cores} />
      <SensorTable result={result} />
      <div className="nerd-cols">
        <FpsDetail result={result} />
        <FlagTable result={result} />
      </div>
    </div>
  );
}

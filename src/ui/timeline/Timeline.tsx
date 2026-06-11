import { useCallback, useMemo, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import type uPlot from 'uplot';
import type { AnalysisResult, CanonicalKey } from '../../types';
import { Button, Card } from '../primitives';
import { cx } from '../cx';
import { readChartTheme } from './chartTheme';
import { decimateRows, timeToRow } from './decimate';
import { buildEventMarkers, buildRailSegments, buildWorstMarkers, railPlugin } from './plugins';
import { useUPlot } from './useUPlot';
// vendor structural reset (cursor/select layer positioning), not our styling —
// DESIGN.md-compatible; all WTFPS styles live in Timeline.css as tokens.
import 'uplot/dist/uPlot.min.css';
import './Timeline.css';

interface SensorChip { key: CanonicalKey; label: string; scale: string }

// One overlay at a time keeps the chart legible; each chip declares a named
// uPlot scale per unit so a fan RPM never shares an axis with a temperature.
const SENSOR_CHIPS: SensorChip[] = [
  { key: 'gpu.temp', label: 'GPU temp', scale: 'c' },
  { key: 'cpu.tempPackage', label: 'CPU temp', scale: 'c' },
  { key: 'gpu.usage', label: 'GPU usage', scale: 'pct' },
  { key: 'cpu.usageTotal', label: 'CPU usage', scale: 'pct' },
  { key: 'pm.frameTimeMs', label: 'Frame time', scale: 'ms' },
  { key: 'gpu.clockEff', label: 'GPU clock', scale: 'mhz' },
  { key: 'fan.gpuRpm', label: 'GPU fan', scale: 'rpm' },
];

const CHART_H = 220;
const MIN_BRUSH_PX = 4;

const LIMITER_LABEL: Record<string, string> = {
  gpu: 'GPU-bound', cpu: 'CPU-bound', capped: 'at the FPS cap',
  underutilized: 'GPU underutilized', ambiguous: 'unclear', mixed: 'mixed',
};

export function fmtMmSs(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export function parseMmSs(text: string): number | null {
  const m = /^(\d+):([0-5]\d)$/.exec(text.trim());
  return m ? (Number(m[1]) * 60 + Number(m[2])) * 1000 : null;
}

interface TimelineProps {
  result: AnalysisResult;
  selection: { startRow: number; endRow: number } | null;
  onSelect: (startRow: number, endRow: number) => void;
  onClear: () => void;
}

export function Timeline({ result, selection, onSelect, onClear }: TimelineProps): JSX.Element | null {
  const { log, windows, events } = result;
  const containerRef = useRef<HTMLDivElement>(null);

  // Latest callbacks behind refs, so the brush handler baked into the uPlot
  // options never forces a chart rebuild.
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  const onClearRef = useRef(onClear);
  onClearRef.current = onClear;

  const chips = useMemo(
    () => SENSOR_CHIPS.filter((c) => (log.sensors[c.key]?.values.length ?? 0) > 0),
    [log],
  );
  const [chipKey, setChipKey] = useState<CanonicalKey | null>(null);
  const chip = chips.find((c) => c.key === chipKey) ?? chips[0] ?? null;

  const segments = useMemo(() => buildRailSegments(windows.windows), [windows]);

  const [fromText, setFromText] = useState('');
  const [toText, setToText] = useState('');

  const build = useCallback((el: HTMLElement, width: number) => {
    const theme = readChartTheme(el);
    const fpsSeries = log.fps.source === 'none' ? undefined : log.fps.series;
    const sensor = chip ? log.sensors[chip.key] : undefined;
    const rows = decimateRows(log.rowCount, [fpsSeries, sensor?.values]);

    // HWiNFO timestamps are absolute (ms since midnight); plot elapsed time from
    // the log start so the axis reads 0:00 onward, not the wall-clock time of day.
    const t0 = log.timesMs[0] ?? 0;
    const xs = rows.map((r) => ((log.timesMs[r] ?? t0) - t0) / 1000);
    const ys: (number | null)[][] = [];
    const series: uPlot.Series[] = [{}];
    const axisFont = `11px ${theme.fontMono}`;
    const axes: uPlot.Axis[] = [{
      stroke: theme.textDim,
      font: axisFont,
      grid: { stroke: theme.border, width: 1 },
      ticks: { stroke: theme.border, width: 1 },
      values: (_u, ticks) => ticks.map((t) => fmtMmSs(t * 1000)),
    }];

    if (fpsSeries) {
      ys.push(rows.map((r) => fpsSeries[r] ?? null));
      series.push({ label: 'FPS', scale: 'fps', stroke: theme.accent, width: 1.5, spanGaps: false });
      axes.push({ scale: 'fps', stroke: theme.textDim, font: axisFont, grid: { show: false }, ticks: { stroke: theme.border, width: 1 } });
    }
    if (chip && sensor) {
      ys.push(rows.map((r) => sensor.values[r] ?? null));
      series.push({ label: chip.label, scale: chip.scale, stroke: theme.textDim, width: 1, spanGaps: false });
      axes.push({ scale: chip.scale, side: 1, stroke: theme.textDim, font: axisFont, grid: { show: false }, ticks: { stroke: theme.border, width: 1 } });
    }

    const paint = {
      segments,
      markers: [...buildEventMarkers(events, windows.windows), ...buildWorstMarkers(windows.worst)],
      theme,
    };

    const opts: uPlot.Options = {
      width,
      height: CHART_H,
      scales: { x: { time: false } },
      series,
      axes,
      legend: { show: false },
      // the brush selects a range; it must never zoom (zoom is out of scope)
      cursor: { drag: { x: true, y: false, setScale: false }, points: { show: false } },
      plugins: [railPlugin(paint)],
      hooks: {
        setSelect: [(u: uPlot) => {
          if (u.select.width < MIN_BRUSH_PX) {
            onClearRef.current();
            return;
          }
          const tA = u.posToVal(u.select.left, 'x') * 1000 + t0;
          const tB = u.posToVal(u.select.left + u.select.width, 'x') * 1000 + t0;
          const a = timeToRow(log.timesMs, tA);
          const b = timeToRow(log.timesMs, tB);
          onSelectRef.current(Math.min(a, b), Math.max(a, b));
        }],
      },
    };
    return { opts, data: [xs, ...ys] as uPlot.AlignedData };
  }, [log, chip, segments, events, windows]);

  useUPlot(containerRef, build);

  const ariaLabel = useMemo(() => {
    const fpsPart = log.fps.source !== 'none' && log.fps.stats
      ? `FPS avg ${Math.round(log.fps.stats.avg)}, range ${Math.round(log.fps.stats.min)} to ${Math.round(log.fps.stats.max)}`
      : 'no framerate logged';
    const dom = windows.timeSplit.dominant;
    const domPart = dom ? `; mostly ${LIMITER_LABEL[dom] ?? dom}` : '';
    const chipPart = chip ? `. Overlay: ${chip.label}` : '';
    return `Session timeline chart. ${fpsPart}${domPart}${chipPart}. Brush the chart or use the From/To fields to analyze a range.`;
  }, [log, windows, chip]);

  if (windows.windows.length === 0) return null;

  const submitRange = (e: FormEvent) => {
    e.preventDefault();
    const from = parseMmSs(fromText);
    const to = parseMmSs(toText);
    if (from === null || to === null) return;
    const t0 = log.timesMs[0] ?? 0;
    const a = timeToRow(log.timesMs, t0 + Math.min(from, to));
    const b = timeToRow(log.timesMs, t0 + Math.max(from, to));
    onSelect(Math.min(a, b), Math.max(a, b));
  };

  const caption = segments.length === 0
    ? 'No CPU-bound or throttling stretches — smooth sailing.'
    : 'Quiet stretches were GPU-bound or at your FPS cap — the healthy case.';

  return (
    <Card className="nerd-card">
      <h3 className="nerd-h">Session timeline</h3>
      {chips.length > 1 && (
        <div className="tl-chips" role="group" aria-label="Sensor overlay">
          {chips.map((c) => (
            <button
              key={c.key}
              type="button"
              className={cx('tl-chip', chip?.key === c.key && 'is-active')}
              aria-pressed={chip?.key === c.key}
              onClick={() => setChipKey(c.key)}
            >
              {c.label}
            </button>
          ))}
        </div>
      )}
      <div ref={containerRef} className="tl-chart" role="img" aria-label={ariaLabel} />
      <form className="tl-range" onSubmit={submitRange}>
        <label className="mono">
          From
          <input value={fromText} onChange={(e) => setFromText(e.target.value)} placeholder="0:00" size={5} />
        </label>
        <label className="mono">
          To
          <input value={toText} onChange={(e) => setToText(e.target.value)} placeholder="1:30" size={5} />
        </label>
        <Button type="submit" variant="subtle">Select range</Button>
        {selection && <Button variant="ghost" onClick={onClear}>Clear</Button>}
      </form>
      <div className="tl-legend">
        {log.fps.source !== 'none' && <span><i className="tl-legend__fps" />FPS</span>}
        {chip && <span><i className="tl-legend__sensor" />{chip.label}</span>}
        <span><i className="tl-legend__cpu" />CPU-bound</span>
        <span><i className="tl-legend__throttle" />Throttling</span>
        <span><i className="tl-legend__event" />Event</span>
        <span><i className="tl-legend__worst" />Worst moment</span>
      </div>
      <p className="tl-caption u-dim">{caption}</p>
    </Card>
  );
}

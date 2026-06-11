import type { NormalizedLog, SelectionAnalysis, Stats, WindowAnalysis } from '../types';
import { computeStats } from '../stats/percentiles';
import { buildTimeSplit } from '../windows/aggregate';

function statsOrNull(values: (number | null)[]): Stats | null {
  const s = computeStats(values);
  return s.count > 0 ? s : null;
}

const EMPTY: Omit<SelectionAnalysis, 'startRow' | 'endRow'> = {
  startMs: 0, endMs: 0, fps: null, sensors: {}, timeSplit: null, windowCount: 0,
};

// Pure selection analysis over an inclusive row range. Cheap enough for a
// main-thread useMemo: slices + percentiles over a few thousand rows.
export function computeSelection(
  log: NormalizedLog,
  windows: WindowAnalysis,
  startRow: number,
  endRow: number,
): SelectionAnalysis {
  if (log.rowCount === 0 || endRow < startRow) {
    return { startRow: 0, endRow: 0, ...EMPTY };
  }
  const lastRow = log.rowCount - 1;
  const start = Math.min(Math.max(startRow, 0), lastRow);
  const end = Math.min(Math.max(endRow, start), lastRow);

  const sensors: SelectionAnalysis['sensors'] = {};
  for (const sensor of Object.values(log.sensors)) {
    if (!sensor) continue;
    const s = statsOrNull(sensor.values.slice(start, end + 1));
    if (s) sensors[sensor.key] = s;
  }

  const fps = log.fps.source === 'none'
    ? null
    : statsOrNull(log.fps.series.slice(start, end + 1));

  // Reuse the per-window classifications instead of re-classifying the slice:
  // windows are ≤5 s, so the partial window dropped at each edge loses a few
  // seconds of gameplay time at most.
  const contained = windows.windows.filter(
    (w) => w.window.startRow >= start && w.window.endRow <= end,
  );

  return {
    startRow: start,
    endRow: end,
    startMs: log.timesMs[start] ?? 0,
    endMs: log.timesMs[end] ?? log.timesMs[start] ?? 0,
    fps,
    sensors,
    timeSplit: contained.length > 0 ? buildTimeSplit(contained) : null,
    windowCount: contained.length,
  };
}

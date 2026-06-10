import type { TimeWindow } from '../types';

const TARGET_WINDOW_MS = 5000;
const MIN_ROWS = 4;     // window means from fewer samples are single-sample noise
const MAX_ROWS = 50;
const MIN_WINDOWS = 6;  // fewer than this and a time-split is meaningless

export interface Grid { windows: TimeWindow[]; windowMs: number; lowConfidence: boolean; }

export function buildGrid(timesMs: number[], pollMs: number): Grid {
  const rowCount = timesMs.length;
  if (rowCount === 0) return { windows: [], windowMs: 0, lowConfidence: true };

  const poll = pollMs > 0 ? pollMs : 2000;
  const rowsPerWindow = Math.min(MAX_ROWS, Math.max(MIN_ROWS, Math.round(TARGET_WINDOW_MS / poll)));

  const windows: TimeWindow[] = [];
  for (let start = 0; start < rowCount; start += rowsPerWindow) {
    const end = Math.min(start + rowsPerWindow - 1, rowCount - 1);
    windows.push({ index: windows.length, startRow: start, endRow: end, startMs: timesMs[start], endMs: timesMs[end] });
  }

  if (windows.length >= 2) {
    const last = windows[windows.length - 1];
    if (last.endRow - last.startRow + 1 < MIN_ROWS) {
      windows.pop();
      const prev = windows[windows.length - 1];
      windows[windows.length - 1] = { ...prev, endRow: last.endRow, endMs: last.endMs };
    }
  }

  if (windows.length < MIN_WINDOWS) {
    return {
      windows: [{ index: 0, startRow: 0, endRow: rowCount - 1, startMs: timesMs[0], endMs: timesMs[rowCount - 1] }],
      windowMs: timesMs[rowCount - 1] - timesMs[0],
      lowConfidence: true,
    };
  }
  return { windows, windowMs: rowsPerWindow * poll, lowConfidence: false };
}

import { describe, it, expect } from 'vitest';
import { buildGrid } from './grid';

const times = (n: number, stepMs: number) => Array.from({ length: n }, (_, i) => i * stepMs);

describe('buildGrid', () => {
  it('targets ~5s windows: 2000ms poll → 4-row windows (floor dominates)', () => {
    const g = buildGrid(times(40, 2000), 2000);
    expect(g.lowConfidence).toBe(false);
    expect(g.windows[0]).toMatchObject({ index: 0, startRow: 0, endRow: 3, startMs: 0, endMs: 6000 });
    expect(g.windowMs).toBe(8000);
  });

  it('500ms poll → 10-row / 5s windows', () => {
    const g = buildGrid(times(100, 500), 500);
    expect(g.windows[0].endRow - g.windows[0].startRow + 1).toBe(10);
    expect(g.windowMs).toBe(5000);
  });

  it('merges a short trailing window into its predecessor', () => {
    const g = buildGrid(times(41, 2000), 2000); // 10 full windows + 1 leftover row
    expect(g.windows[g.windows.length - 1].endRow).toBe(40);
    expect(g.windows.every((w, i) => w.index === i)).toBe(true);
  });

  it('falls back to one low-confidence whole-log window for short logs', () => {
    const g = buildGrid(times(12, 2000), 2000); // would be 3 windows < MIN_WINDOWS
    expect(g.lowConfidence).toBe(true);
    expect(g.windows).toHaveLength(1);
    expect(g.windows[0]).toMatchObject({ startRow: 0, endRow: 11 });
  });

  it('handles empty input and zero pollMs', () => {
    expect(buildGrid([], 2000).windows).toHaveLength(0);
    const g = buildGrid(times(40, 2000), 0); // pollMs unknown → assume 2000
    expect(g.windows[0].endRow).toBe(3);
  });
});

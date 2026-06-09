import { describe, it, expect } from 'vitest';
import { buildFps } from './fps';
import { buildColumns } from '../parsing/columns';
import { parseCsv } from '../parsing/csv';
import type { Decimal } from '../types';

function fps(headerCells: string[], dataRows: (string | number)[][], decimal: Decimal = '.') {
  const headers = headerCells;
  const rows = dataRows.map((r) => r.map(String));
  return buildFps(buildColumns(headers), rows, decimal);
}

describe('buildFps', () => {
  it('prefers the Displayed source and cleans zeros + implausible spikes', () => {
    const r = fps(
      ['Date', 'Time', 'Framerate Displayed (avg) [FPS]'],
      [
        ['9.6.2026', '12:00:00.000', 0],
        ['9.6.2026', '12:00:02.000', 119.9],
        ['9.6.2026', '12:00:04.000', 0],
        ['9.6.2026', '12:00:06.000', 141.6],
        ['9.6.2026', '12:00:08.000', 5000],
      ],
    );
    expect(r.source).toBe('displayed');
    expect(r.clean).toEqual([119.9, 141.6]);
    expect(r.stats).not.toBeNull();
    expect(r.stats!.count).toBe(2);
  });

  it('prefers Displayed over Presented when both exist, exposing both avgs', () => {
    const r = fps(
      ['Date', 'Time', 'Framerate Presented (avg) [FPS]', 'Framerate Displayed (avg) [FPS]'],
      [
        ['9.6.2026', '12:00:00.000', 100, 90],
        ['9.6.2026', '12:00:02.000', 110, 92],
      ],
    );
    expect(r.source).toBe('displayed');
    expect(r.sourceLabel).toBe('Framerate Displayed (avg)');
    expect(r.displayedAvg).toBeCloseTo(91, 5);
    expect(r.presentedAvg).toBeCloseTo(105, 5);
  });

  it('falls back to Presented when Displayed is absent', () => {
    const r = fps(
      ['Date', 'Time', 'Framerate Presented (avg) [FPS]'],
      [['9.6.2026', '12:00:00.000', 100], ['9.6.2026', '12:00:02.000', 110]],
    );
    expect(r.source).toBe('presented');
    expect(r.presentedAvg).toBeCloseTo(105, 5);
    expect(r.displayedAvg).toBeNull();
  });

  it('uses the legacy Framerate column when nothing else exists', () => {
    const r = fps(
      ['Date', 'Time', 'Framerate [FPS]'],
      [['9.6.2026', '12:00:00.000', 0], ['9.6.2026', '12:00:02.000', 144], ['9.6.2026', '12:00:04.000', 0]],
    );
    expect(r.source).toBe('legacy');
    expect(r.clean).toEqual([144]);
  });

  it('reports source none and null stats when no framerate column exists', () => {
    const r = fps(
      ['Date', 'Time', 'GPU Temperature [°C]'],
      [['9.6.2026', '12:00:00.000', 74]],
    );
    expect(r.source).toBe('none');
    expect(r.stats).toBeNull();
    expect(r.clean).toEqual([]);
    expect(r.presentedAvg).toBeNull();
    expect(r.displayedAvg).toBeNull();
    expect(r.capped).toBe(false);
    expect(r.capValue).toBeNull();
  });

  it('detects a frame cap when ~all samples sit on a common ceiling', () => {
    const r = fps(
      ['Date', 'Time', 'Framerate Displayed (avg) [FPS]'],
      [
        ['9.6.2026', '12:00:00.000', 60.1],
        ['9.6.2026', '12:00:02.000', 59.9],
        ['9.6.2026', '12:00:04.000', 60.0],
        ['9.6.2026', '12:00:06.000', 60.2],
        ['9.6.2026', '12:00:08.000', 60.0],
      ],
    );
    expect(r.capped).toBe(true);
    expect(r.capValue).toBe(60);
  });

  it('does not flag a cap on a freely-varying framerate', () => {
    const r = fps(
      ['Date', 'Time', 'Framerate Displayed (avg) [FPS]'],
      [
        ['9.6.2026', '12:00:00.000', 70],
        ['9.6.2026', '12:00:02.000', 95],
        ['9.6.2026', '12:00:04.000', 120],
        ['9.6.2026', '12:00:06.000', 88],
        ['9.6.2026', '12:00:08.000', 140],
      ],
    );
    expect(r.capped).toBe(false);
    expect(r.capValue).toBeNull();
  });

  it('parses comma-decimal framerate values', () => {
    const csv = parseCsv(
      'Date;Time;"Framerate Displayed (avg) [FPS]";\n' +
        '9.6.2026;12:00:00,000;119,9;\n' +
        '9.6.2026;12:00:02,000;141,6;\n',
    );
    const r = buildFps(buildColumns(csv.headers), csv.rows, csv.decimal);
    expect(r.clean).toEqual([119.9, 141.6]);
  });
});

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseCsv } from './csv';
import { decodeBytes } from './decode';

const load = (p: string) => decodeBytes(readFileSync(new URL(p, import.meta.url)));

describe('parseCsv', () => {
  it('detects comma delimiter + dot decimal and strips the footer row', () => {
    const r = parseCsv(load('./__fixtures__/mini-comma.csv'));
    expect(r.delimiter).toBe(',');
    expect(r.decimal).toBe('.');
    expect(r.headers[2]).toBe('GPU Temperature [°C]'); // quotes removed
    expect(r.rows).toHaveLength(2); // 'Average' footer dropped
    expect(r.rows[0][2]).toBe('74.1');
  });
  it('detects semicolon delimiter + comma decimal', () => {
    const r = parseCsv(load('./__fixtures__/mini-semicolon.csv'));
    expect(r.delimiter).toBe(';');
    expect(r.decimal).toBe(',');
    expect(r.rows[0][2]).toBe('74,1'); // raw; numeric parse happens later
  });
  it('drops a single trailing empty column from header and rows', () => {
    const r = parseCsv(load('./__fixtures__/mini-comma.csv'));
    // header had a trailing comma -> one empty cell stripped
    expect(r.headers).toHaveLength(4);
    expect(r.rows[0]).toHaveLength(4);
  });
  it('keeps a quoted delimiter inside a field as data, not a separator', () => {
    const r = parseCsv('Date,Time,"Power, total [W]"\n9.6.2026,12:00:00.000,42.0');
    expect(r.headers).toEqual(['Date', 'Time', 'Power, total [W]']);
    expect(r.rows[0][2]).toBe('42.0');
  });
  it('splits CRLF line endings', () => {
    const r = parseCsv('Date,Time,X [%]\r\n9.6.2026,12:00:00.000,50\r\n9.6.2026,12:00:02.000,60\r\n');
    expect(r.rows).toHaveLength(2);
    expect(r.rows[1][2]).toBe('60');
  });
});

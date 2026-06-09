import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { normalize } from './normalize';
import { buildColumns } from '../parsing/columns';
import { parseCsv } from '../parsing/csv';
import { decodeBytes } from '../parsing/decode';

const load = (p: string) => decodeBytes(readFileSync(new URL(p, import.meta.url)));

describe('normalize', () => {
  it('disambiguates duplicate GPU Temperature columns by section', () => {
    const csv = parseCsv(load('./__fixtures__/dual-gpu.csv'));
    const cols = buildColumns(csv.headers);
    const log = normalize(cols, csv.rows, csv.decimal);

    expect(log.sensors['gpu.temp']!.values).toEqual([74.1, 75.2]); // near Memory Junction
    expect(log.sensors['igpu.temp']!.values).toEqual([49.4, 49.6]); // near iGPU VID
    expect(log.sensors['gpu.memJunction']!.values).toEqual([72.0, 72.0]);
  });

  it('parses comma-decimal numbers and Yes/No flags, nulls blanks', () => {
    const text =
      'Date;Time;"GPU Temperature [°C]";"Core Thermal Throttling (avg) [Yes/No]";"Total CPU Usage [%]";\n' +
      '9.6.2026;12:00:00,000;74,1;No;;\n' +
      '9.6.2026;12:00:02,000;75,2;Yes;42,5;\n';
    const csv = parseCsv(text);
    const log = normalize(buildColumns(csv.headers), csv.rows, csv.decimal);

    expect(log.sensors['gpu.temp']!.values).toEqual([74.1, 75.2]);
    expect(log.flags['flag.cpu.thermalThrottle']!.values).toEqual([false, true]);
    expect(log.sensors['cpu.usageTotal']!.values).toEqual([null, 42.5]); // blank -> null
  });

  it('computes pollMs as the median timestamp delta', () => {
    const text =
      'Date,Time,X [%]\n' +
      '9.6.2026,12:00:00.000,1\n' +
      '9.6.2026,12:00:02.000,2\n' +
      '9.6.2026,12:00:04.000,3\n';
    const csv = parseCsv(text);
    const log = normalize(buildColumns(csv.headers), csv.rows, csv.decimal);
    expect(log.pollMs).toBe(2000);
  });

  it('collects unmatched columns and sets rowCount and the fps placeholder', () => {
    const text =
      'Date,Time,"GPU Temperature [°C]","Battery Charge Level [%]"\n' +
      '9.6.2026,12:00:00.000,74.1,88\n';
    const csv = parseCsv(text);
    const log = normalize(buildColumns(csv.headers), csv.rows, csv.decimal);

    expect(log.unknownColumns).toContain('Battery Charge Level [%]');
    expect(log.unknownColumns).not.toContain('Date');
    expect(log.unknownColumns).not.toContain('Time');
    expect(log.rowCount).toBe(1);
    expect(log.fps).toEqual({
      source: 'none', sourceLabel: '', clean: [], stats: null,
      presentedAvg: null, displayedAvg: null, capped: false, capValue: null,
    });
  });

  it('does not let an iGPU-section clock shadow the discrete GPU clock', () => {
    // iGPU block first (VDDCR_GFX anchors its own clock at idle 600 MHz), dGPU block
    // second (Memory Junction anchors its 2400 MHz clock). gpu.clock takes the discrete value.
    const text =
      'Date,Time,"GPU Core Voltage (VDDCR_GFX) [V]","GPU Clock [MHz]","GPU Utilization [%]",' +
      '"GPU Memory Junction Temperature [°C]","GPU Hot Spot Temperature [°C]","GPU Clock [MHz]"\n' +
      '9.6.2026,12:00:00.000,0.7,600,3,70,80,2400\n';
    const csv = parseCsv(text);
    const log = normalize(buildColumns(csv.headers), csv.rows, csv.decimal);
    expect(log.sensors['gpu.clock']!.values).toEqual([2400]);
  });

  it('fills specs from the column names', () => {
    const text =
      'Date,Time,"GPU Memory Junction Temperature [°C]","Battery Voltage [V]"\n' +
      '9.6.2026,12:00:00.000,72,15\n';
    const csv = parseCsv(text);
    const log = normalize(buildColumns(csv.headers), csv.rows, csv.decimal);
    expect(log.specs.gpuVendor).toBe('nvidia');
    expect(log.specs.isLaptop).toBe(true);
  });
});

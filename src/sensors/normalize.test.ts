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
      series: [], presented1PctLow: null, presented01PctLow: null, rtss1PctLow: null,
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

  it('computes installed RAM as the max of Used + Available across rows', () => {
    const text =
      'Date,Time,"Physical Memory Used [MB]","Physical Memory Available [MB]"\n' +
      '9.6.2026,12:00:00.000,19440,12944\n' +  // 32384
      '9.6.2026,12:00:02.000,20000,12300\n';   // 32300 -> max stays 32384
    const csv = parseCsv(text);
    const log = normalize(buildColumns(csv.headers), csv.rows, csv.decimal);
    expect(log.specs.ramMb).toBe(32384);
    expect(Math.round(log.specs.ramMb! / 1024)).toBe(32);
  });

  it('falls back to Used / Load% when Available is absent', () => {
    const text =
      'Date,Time,"Physical Memory Used [MB]","Physical Memory Load [%]"\n' +
      '9.6.2026,12:00:00.000,19440,60.0\n';
    const csv = parseCsv(text);
    const log = normalize(buildColumns(csv.headers), csv.rows, csv.decimal);
    expect(Math.round(log.specs.ramMb! / 1024)).toBe(32); // 19440/60*100 = 32400
  });
});

describe('timesMs', () => {
  it('is row-aligned, forward-filled, and survives midnight', () => {
    const text =
      'Date,Time,X [%]\n' +
      '7.6.2026,23:59:58,50\n' +
      '7.6.2026,,51\n' +          // unparsable time -> forward-filled
      '8.6.2026,00:00:00,52\n' +
      '8.6.2026,00:00:02,53\n';
    const csv = parseCsv(text);
    const log = normalize(buildColumns(csv.headers), csv.rows, csv.decimal);
    expect(log.timesMs).toHaveLength(4);
    expect(log.timesMs[1]).toBe(log.timesMs[0]);            // forward fill
    expect(log.timesMs[2]).toBeGreaterThan(log.timesMs[0]); // midnight handled, monotonic
    expect(log.timesMs[3] - log.timesMs[2]).toBe(2000);
  });
});

describe('core matrix', () => {
  it('captures Intel hybrid and AMD per-thread usage/effective-clock columns', () => {
    const text =
      'Date,Time,"P-core 0 T0 Usage [%]","E-core 6 T0 Usage [%]","Core 3 T1 Effective Clock [MHz]"\n' +
      '9.6.2026,12:00:00.000,40,60,3000\n' +
      '9.6.2026,12:00:02.000,97,30,3100\n';
    const csv = parseCsv(text);
    const log = normalize(buildColumns(csv.headers), csv.rows, csv.decimal);
    expect(log.cores).not.toBeNull();
    expect(log.cores!.usage.map((s) => s.label)).toEqual(['P-core 0 T0', 'E-core 6 T0']);
    expect(log.cores!.usage[0].coreType).toBe('P');
    expect(log.cores!.usage[1].coreType).toBe('E');
    expect(log.cores!.effectiveClock[0]).toMatchObject({ coreType: 'std', coreIndex: 3, thread: 1 });
    expect(log.unknownColumns.some((c) => c.includes('P-core 0 T0 Usage'))).toBe(false);
  });

  it('derives cpu.usageCoreMax from the matrix when the column is absent', () => {
    const text =
      'Date,Time,"P-core 0 T0 Usage [%]","E-core 6 T0 Usage [%]"\n' +
      '9.6.2026,12:00:00.000,40,60\n' +
      '9.6.2026,12:00:02.000,97,30\n';
    const csv = parseCsv(text);
    const log = normalize(buildColumns(csv.headers), csv.rows, csv.decimal);
    expect(log.sensors['cpu.usageCoreMax']?.values).toEqual([60, 97]);
    expect(log.sensors['cpu.usageCoreMax']?.label).toContain('derived');
  });
});

describe('ambiguity for new keys', () => {
  it('drops iGPU-section VRAM and throttle-reason flags, keeps dGPU-section ones', () => {
    // dGPU block (Hot Spot anchor) then iGPU block (GPU Utilization anchor); the
    // VRAM/flag columns appear in both.
    const text =
      'Date,Time,"GPU Memory Allocated [MB]","Throttle Reason - Power [Yes/No]",' +
      '"GPU Hot Spot Temperature [°C]","GPU Utilization [%]",' +
      '"GPU Memory Allocated [MB]","Throttle Reason - Power [Yes/No]"\n' +
      '9.6.2026,12:00:00.000,4000,No,80,30,2000,Yes\n';
    const csv = parseCsv(text);
    const log = normalize(buildColumns(csv.headers), csv.rows, csv.decimal);
    expect(log.sensors['vram.allocatedMb']).toBeDefined();   // dGPU instance claimed
    expect(log.sensors['vram.allocatedMb']!.values).toEqual([4000]);
    expect(log.flags['flag.gpu.perfLimitPower']).toBeDefined();
    expect(log.unknownColumns.filter((c) => c.includes('GPU Memory Allocated'))).toHaveLength(1);
  });
});

describe('sanitizers', () => {
  it('treats RTSS Frame Time 0 as missing', () => {
    const text =
      'Date,Time,"Frame Time [ms]"\n' +
      '9.6.2026,12:00:00.000,0\n' +
      '9.6.2026,12:00:02.000,8.3\n' +
      '9.6.2026,12:00:04.000,0\n';
    const csv = parseCsv(text);
    const log = normalize(buildColumns(csv.headers), csv.rows, csv.decimal);
    expect(log.sensors['rtss.frameTimeMs']?.values).toEqual([null, 8.3, null]);
  });
});

describe('multi-instance merge', () => {
  it('folds every Drive Temperature column into one per-row-max series', () => {
    // Intel layout: two drive sections, four temp columns, instance numbers 2 and 3.
    const text =
      'Date,Time,"Drive Temperature [°C]","Drive Temperature 2 [°C]","Drive Temperature [°C]","Drive Temperature 3 [°C]"\n' +
      '9.6.2026,12:00:00.000,41,55,38,40\n' +
      '9.6.2026,12:00:02.000,42,,39,60\n';
    const csv = parseCsv(text);
    const log = normalize(buildColumns(csv.headers), csv.rows, csv.decimal);
    expect(log.sensors['drive.tempC']!.values).toEqual([55, 60]);
    expect(log.unknownColumns).toHaveLength(0);
  });

  it('merges null-safely: null only when every instance is null on that row', () => {
    const text =
      'Date,Time,"Total Activity [%]","Total Activity [%]"\n' +
      '9.6.2026,12:00:00.000,,\n' +
      '9.6.2026,12:00:02.000,12,3\n' +
      '9.6.2026,12:00:04.000,,7\n';
    const csv = parseCsv(text);
    const log = normalize(buildColumns(csv.headers), csv.rows, csv.decimal);
    expect(log.sensors['drive.activityPct']!.values).toEqual([null, 12, 7]);
  });

  it('merges the three VRM rails to the worst rail', () => {
    const text =
      'Date,Time,"CPU VDDCR_VDD VRM (SVI3 TFN) [°C]","CPU VDDCR_SOC VRM (SVI3 TFN) [°C]","CPU VDD_MISC VRM (SVI3 TFN) [°C]"\n' +
      '9.6.2026,12:00:00.000,71,65,58\n' +
      '9.6.2026,12:00:02.000,70,74,59\n';
    const csv = parseCsv(text);
    const log = normalize(buildColumns(csv.headers), csv.rows, csv.decimal);
    expect(log.sensors['vrm.tempC']!.values).toEqual([71, 74]);
  });

  it('non-multi keys keep first-claim-wins', () => {
    const text =
      'Date,Time,"Total CPU Usage [%]","Total CPU Usage [%]"\n' +
      '9.6.2026,12:00:00.000,10,99\n';
    const csv = parseCsv(text);
    const log = normalize(buildColumns(csv.headers), csv.rows, csv.decimal);
    expect(log.sensors['cpu.usageTotal']!.values).toEqual([10]);
  });

  it('folds laptop-EC bare CPU/GPU [RPM] fan columns into the fan keys', () => {
    // ASUS NB EC layout: one bare column per fan, two GPU fans
    const text =
      'Date,Time,"CPU [RPM]","GPU [RPM]","GPU [RPM]"\n' +
      '9.6.2026,12:00:00.000,3540,2340,3300\n' +
      '9.6.2026,12:00:02.000,3600,5100,4980\n';
    const csv = parseCsv(text);
    const log = normalize(buildColumns(csv.headers), csv.rows, csv.decimal);
    expect(log.sensors['fan.cpuRpm']!.values).toEqual([3540, 3600]);
    expect(log.sensors['fan.gpuRpm']!.values).toEqual([3300, 5100]); // harder-working fan wins
    expect(log.unknownColumns).toHaveLength(0);
  });

  it('keeps bare CPU/GPU columns without the RPM unit unmapped', () => {
    const text =
      'Date,Time,"CPU [°C]","GPU [°C]"\n' +
      '9.6.2026,12:00:00.000,75,68\n';
    const csv = parseCsv(text);
    const log = normalize(buildColumns(csv.headers), csv.rows, csv.decimal);
    expect(log.sensors['fan.cpuRpm']).toBeUndefined();
    expect(log.sensors['fan.gpuRpm']).toBeUndefined();
    expect(log.unknownColumns).toEqual(['CPU [°C]', 'GPU [°C]']);
  });
});

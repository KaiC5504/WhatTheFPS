import { describe, it, expect } from 'vitest';
import { buildHeroDeltas, buildSensorDeltas } from './diff';
import { makeSlim, stat } from './testkit';

const FPS = (avg: number, p1: number, p5: number) => ({
  source: 'displayed' as const,
  sourceLabel: 'Framerate Displayed (avg)',
  stats: stat({ avg, p1Low: p1, p5Low: p5 }),
});

describe('buildHeroDeltas', () => {
  const before = makeSlim({
    stats: {
      'cpu.usageTotal': stat({ avg: 45 }), 'cpu.tempPackage': stat({ avg: 82 }),
      'gpu.usage': stat({ avg: 97 }), 'gpu.temp': stat({ avg: 80 }),
    },
    fps: FPS(112, 70, 84),
  });
  const after = makeSlim({
    stats: {
      'cpu.usageTotal': stat({ avg: 60 }), 'cpu.tempPackage': stat({ avg: 81.6 }),
      'gpu.usage': stat({ avg: 96 }), 'gpu.temp': stat({ avg: 72 }),
    },
    fps: FPS(118, 76, 90),
  });
  const hero = buildHeroDeltas(before, after);

  it('is the five hero rows in tile order', () => {
    expect(hero.map((d) => d.key)).toEqual(['fps', 'cpu.usageTotal', 'cpu.temp', 'gpu.usage', 'gpu.temp']);
  });

  it('FPS up is improved; temp down is improved; usage shift is neutral', () => {
    expect(hero[0]).toMatchObject({ before: 112, after: 118, delta: 6, direction: 'up', polarity: 'improved' });
    expect(hero[4]).toMatchObject({ before: 80, after: 72, delta: -8, direction: 'down', polarity: 'improved' });
    expect(hero[1]).toMatchObject({ direction: 'up', polarity: 'neutral' });   // CPU usage 45→60: info, not a loss
  });

  it('a sub-floor change is flat and neutral (no arrow color on jitter)', () => {
    // CPU temp 82 → 81.6: under both the 1 °C unit floor and 2% relative floor
    expect(hero[2].direction).toBe('flat');
    expect(hero[2].polarity).toBe('neutral');
  });

  it('CPU temp follows the verdict hero fallback chain on each side independently', () => {
    const b = makeSlim({ stats: { 'cpu.tempCoreMax': stat({ avg: 85 }) } });
    const a = makeSlim({ stats: { 'cpu.tempPackage': stat({ avg: 78 }) } });
    const row = buildHeroDeltas(b, a)[2];
    expect(row).toMatchObject({ before: 85, after: 78, polarity: 'improved' });
  });

  it('fps source none is a null side, not a regression', () => {
    const b = makeSlim({ fps: FPS(112, 70, 84) });
    const a = makeSlim();   // fps source 'none'
    const row = buildHeroDeltas(b, a)[0];
    expect(row).toMatchObject({ before: 112, after: null, delta: null, direction: 'flat', polarity: 'unknown' });
  });
});

describe('buildSensorDeltas', () => {
  const before = makeSlim({
    stats: { 'gpu.temp': stat({ avg: 80, max: 87 }), 'gpu.clock': stat({ avg: 2400, max: 2520 }) },
    flagCounts: { 'flag.gpu.perfLimitThermal': { fired: 12, total: 2175 } },
    fps: FPS(112, 70, 84),
  });
  const after = makeSlim({
    stats: { 'gpu.temp': stat({ avg: 72, max: 78 }), 'gpu.power': stat({ avg: 115, max: 140 }) },
    flagCounts: { 'flag.gpu.perfLimitThermal': { fired: 0, total: 2100 } },
    fps: FPS(118, 76, 90),
  });
  const rows = buildSensorDeltas(before, after);

  it('leads with fps avg + 1%/5% low rows, all higher-better', () => {
    expect(rows.slice(0, 3).map((d) => d.stat)).toEqual(['avg', 'p1Low', 'p5Low']);
    for (const d of rows.slice(0, 3)) {
      expect(d.key).toBe('fps');
      expect(d.polarity).toBe('improved');
    }
  });

  it('emits avg and max rows per sensor with the lower-better table applied', () => {
    const tempAvg = rows.find((d) => d.key === 'gpu.temp' && d.stat === 'avg')!;
    const tempMax = rows.find((d) => d.key === 'gpu.temp' && d.stat === 'max')!;
    expect(tempAvg).toMatchObject({ delta: -8, polarity: 'improved', unit: '°C' });
    expect(tempMax).toMatchObject({ before: 87, after: 78, polarity: 'improved' });
    // clocks are neutral no matter how big the swing
    const clock = rows.find((d) => d.key === 'gpu.clock' && d.stat === 'avg')!;
    expect(clock.polarity).toBe('unknown');   // gpu.clock missing in after → unknown, not worse
  });

  it('a sensor present on one side only gets nulls and unknown polarity — never NaN', () => {
    const power = rows.find((d) => d.key === 'gpu.power' && d.stat === 'avg')!;
    expect(power).toMatchObject({ before: null, after: 115, delta: null, direction: 'flat', polarity: 'unknown' });
  });

  it('flag fired-counts are lower-better rows labeled via FLAG_LABELS', () => {
    const flag = rows.find((d) => d.key === 'flag.gpu.perfLimitThermal')!;
    expect(flag).toMatchObject({
      stat: 'fired', before: 12, after: 0, delta: -12, direction: 'down', polarity: 'improved',
      label: 'GPU thermal limit',
    });
  });
});

import type {
  CanonicalKey, DeltaPolarity, DeltaStat, FlagKey, SensorDelta, SlimResult, Stats,
} from '../types';
import { FLAG_LABELS } from '../windows/snapshot';

// Lower-is-better keys. Everything not listed here (and not FPS) is neutral: usages,
// clocks, voltages, fans, VRAM MB, PresentMon busy/wait, power limits — a shift there
// is information, not a win or a loss, so it gets a Δ but no color.
const LOWER_BETTER = new Set<string>([
  'cpu.tempPackage', 'cpu.tempCoreMax', 'cpu.tempCoreAvg', 'gpu.temp', 'gpu.hotspot',
  'gpu.memJunction', 'igpu.temp', 'cpu.power', 'gpu.power',
  'ram.loadPct', 'pagefile.usagePct', 'pm.frameTimeMs', 'rtss.frameTimeMs',
]);

// Below these floors a delta is run-to-run jitter, not a change worth an arrow.
const UNIT_FLOOR: Record<string, number> = {
  '°C': 1, '%': 1, 'W': 2, 'MHz': 15, 'ms': 0.3, 'MB': 64, 'RPM': 50, 'V': 0.01,
};
const FPS_FLOOR = 1;

type Better = 'lower' | 'higher' | 'neutral';

function makeDelta(args: {
  key: string; label: string; unit: string | null; stat: DeltaStat;
  before: number | null; after: number | null; better: Better; floor?: number;
}): SensorDelta {
  const { key, label, unit, stat, before, after, better } = args;
  if (before === null || after === null) {
    return { key, label, unit, stat, before, after, delta: null, direction: 'flat', polarity: 'unknown' };
  }
  const delta = after - before;
  const floor = Math.max(
    args.floor ?? (unit !== null ? UNIT_FLOOR[unit] ?? 0 : 0),
    0.02 * Math.abs(before),
    1e-9,
  );
  if (Math.abs(delta) < floor) {
    return { key, label, unit, stat, before, after, delta, direction: 'flat', polarity: 'neutral' };
  }
  const direction = delta > 0 ? 'up' : 'down';
  let polarity: DeltaPolarity = 'neutral';
  if (better === 'lower') polarity = delta < 0 ? 'improved' : 'worse';
  if (better === 'higher') polarity = delta > 0 ? 'improved' : 'worse';
  return { key, label, unit, stat, before, after, delta, direction, polarity };
}

function fpsStat(r: SlimResult, pick: (s: Stats) => number): number | null {
  if (r.log.fps.source === 'none' || r.log.fps.stats === null) return null;
  return pick(r.log.fps.stats);
}

function avgOf(stats: SlimResult['stats'], key: CanonicalKey): number | null {
  const s = stats[key];
  return s && s.count > 0 ? s.avg : null;
}

// Same fallback chain as buildVerdict's CPU hero tile: package, then all-core avg,
// then core max. Each side resolves independently — comparing a package avg against
// a core-max avg beats showing "—" for the whole row.
function cpuTempAvg(r: SlimResult): number | null {
  return avgOf(r.stats, 'cpu.tempPackage') ?? avgOf(r.stats, 'cpu.tempCoreAvg') ?? avgOf(r.stats, 'cpu.tempCoreMax');
}

export function buildHeroDeltas(before: SlimResult, after: SlimResult): SensorDelta[] {
  return [
    makeDelta({
      key: 'fps', label: 'Avg FPS', unit: 'FPS', stat: 'avg',
      before: fpsStat(before, (s) => s.avg), after: fpsStat(after, (s) => s.avg),
      better: 'higher', floor: FPS_FLOOR,
    }),
    makeDelta({
      key: 'cpu.usageTotal', label: 'CPU usage', unit: '%', stat: 'avg',
      before: avgOf(before.stats, 'cpu.usageTotal'), after: avgOf(after.stats, 'cpu.usageTotal'),
      better: 'neutral',
    }),
    makeDelta({
      key: 'cpu.temp', label: 'CPU temp', unit: '°C', stat: 'avg',
      before: cpuTempAvg(before), after: cpuTempAvg(after), better: 'lower',
    }),
    makeDelta({
      key: 'gpu.usage', label: 'GPU usage', unit: '%', stat: 'avg',
      before: avgOf(before.stats, 'gpu.usage'), after: avgOf(after.stats, 'gpu.usage'),
      better: 'neutral',
    }),
    makeDelta({
      key: 'gpu.temp', label: 'GPU temp', unit: '°C', stat: 'avg',
      before: avgOf(before.stats, 'gpu.temp'), after: avgOf(after.stats, 'gpu.temp'),
      better: 'lower',
    }),
  ];
}

function statOf(r: SlimResult, key: CanonicalKey, stat: 'avg' | 'max'): number | null {
  const s = r.stats[key];
  return s && s.count > 0 ? s[stat] : null;
}

export function buildSensorDeltas(before: SlimResult, after: SlimResult): SensorDelta[] {
  const out: SensorDelta[] = [];

  const fpsRow = (stat: 'avg' | 'p1Low' | 'p5Low', label: string) => makeDelta({
    key: 'fps', label, unit: 'FPS', stat,
    before: fpsStat(before, (s) => s[stat]), after: fpsStat(after, (s) => s[stat]),
    better: 'higher', floor: FPS_FLOOR,
  });
  out.push(fpsRow('avg', 'FPS avg'), fpsRow('p1Low', 'FPS 1% low'), fpsRow('p5Low', 'FPS 5% low'));

  const keys = [...new Set<CanonicalKey>([
    ...(Object.keys(before.stats) as CanonicalKey[]),
    ...(Object.keys(after.stats) as CanonicalKey[]),
  ])].sort();
  for (const key of keys) {
    const meta = before.log.sensors[key] ?? after.log.sensors[key];
    const label = meta?.label ?? key;
    const unit = meta?.unit ?? null;
    const better: Better = LOWER_BETTER.has(key) ? 'lower' : 'neutral';
    out.push(makeDelta({ key, label, unit, stat: 'avg', before: statOf(before, key, 'avg'), after: statOf(after, key, 'avg'), better }));
    out.push(makeDelta({ key, label, unit, stat: 'max', before: statOf(before, key, 'max'), after: statOf(after, key, 'max'), better }));
  }

  // throttle/limit flag fired-counts: fewer is always better
  const flagKeys = [...new Set<FlagKey>([
    ...(Object.keys(before.log.flagCounts) as FlagKey[]),
    ...(Object.keys(after.log.flagCounts) as FlagKey[]),
  ])].sort();
  for (const key of flagKeys) {
    out.push(makeDelta({
      key, label: FLAG_LABELS[key], unit: null, stat: 'fired',
      before: before.log.flagCounts[key]?.fired ?? null,
      after: after.log.flagCounts[key]?.fired ?? null,
      better: 'lower', floor: 1,
    }));
  }
  return out;
}

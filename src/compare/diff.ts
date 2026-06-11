import type {
  CanonicalKey, Comparison, DeltaPolarity, DeltaStat, DiagEvent, EventDiff,
  FlagKey, FpsSource, Mismatch, SensorDelta, SlimResult, Stats,
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

export const WORKLOAD_CAVEAT =
  'HWiNFO logs carry no game or scene identity — confirm both runs were the same workload.';

const eventKey = (e: DiagEvent) => `${e.type}:${e.subtype ?? ''}`;

function uniqueByKey(events: DiagEvent[]): DiagEvent[] {
  const seen = new Set<string>();
  return events.filter((e) => {
    const k = eventKey(e);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

function buildEventDiff(before: DiagEvent[], after: DiagEvent[]): EventDiff {
  const beforeKeys = new Set(before.map(eventKey));
  const afterKeys = new Set(after.map(eventKey));
  return {
    resolved: uniqueByKey(before).filter((e) => !afterKeys.has(eventKey(e))),
    introduced: uniqueByKey(after).filter((e) => !beforeKeys.has(eventKey(e))),
    persisted: uniqueByKey(after).filter((e) => beforeKeys.has(eventKey(e))),
  };
}

const FPS_SOURCE_LABEL: Record<FpsSource, string> = {
  displayed: 'PresentMon displayed',
  presented: 'PresentMon presented',
  legacy: 'legacy framerate counter',
  none: 'no framerate logged',
};

const mins = (ms: number) => (ms / 60_000).toFixed(1);

function buildMismatches(before: SlimResult, after: SlimResult): Mismatch[] {
  const out: Mismatch[] = [];
  const b = before.log.specs;
  const a = after.log.specs;
  if (b.cpuModelGuess !== null && a.cpuModelGuess !== null && b.cpuModelGuess !== a.cpuModelGuess) {
    out.push({ kind: 'cpu', message: `Different CPUs: ${b.cpuModelGuess} vs ${a.cpuModelGuess}.` });
  }
  if (b.gpuModelGuess !== null && a.gpuModelGuess !== null && b.gpuModelGuess !== a.gpuModelGuess) {
    out.push({ kind: 'gpu', message: `Different GPUs: ${b.gpuModelGuess} vs ${a.gpuModelGuess}.` });
  }
  if (before.log.fps.source !== after.log.fps.source) {
    out.push({
      kind: 'fpsSource',
      message: `FPS sources differ: ${FPS_SOURCE_LABEL[before.log.fps.source]} vs ${FPS_SOURCE_LABEL[after.log.fps.source]} — FPS deltas may not be apples-to-apples.`,
    });
  }
  const bMs = before.windows.timeSplit.totalMs;
  const aMs = after.windows.timeSplit.totalMs;
  if (bMs > 0 && aMs > 0 && Math.max(bMs, aMs) / Math.min(bMs, aMs) > 1.5) {
    out.push({
      kind: 'duration',
      message: `Run lengths differ a lot: ${mins(bMs)} vs ${mins(aMs)} min — percentiles aren't directly comparable.`,
    });
  }
  if (before.windows.activityKind !== after.windows.activityKind) {
    out.push({
      kind: 'activityKind',
      message: 'One run is gameplay and the other a no-FPS workload (benchmark) — most deltas are meaningless across that divide.',
    });
  }
  return out;
}

function buildHeadline(heroDeltas: SensorDelta[], eventDiff: EventDiff): string {
  const parts: string[] = [];

  const fps = heroDeltas.find((d) => d.key === 'fps');
  if (fps && fps.delta !== null && fps.direction !== 'flat' && fps.before !== null && fps.before > 0) {
    const pct = Math.round((Math.abs(fps.delta) / fps.before) * 100);
    parts.push(`Average FPS ${fps.direction === 'up' ? 'went up' : 'dropped'} ${pct}% (${Math.round(fps.before)} → ${Math.round(fps.after as number)}).`);
  }

  // one temperature sentence is enough for a headline; GPU outranks CPU
  for (const key of ['gpu.temp', 'cpu.temp']) {
    const t = heroDeltas.find((d) => d.key === key);
    if (t && t.delta !== null && t.direction !== 'flat') {
      parts.push(`${key === 'gpu.temp' ? 'GPU' : 'CPU'} ran ${Math.round(Math.abs(t.delta))}°C ${t.delta < 0 ? 'cooler' : 'hotter'}.`);
      break;
    }
  }

  const { resolved, introduced } = eventDiff;
  if (resolved.length > 0) parts.push(resolved.length === 1 ? 'One earlier issue cleared.' : `${resolved.length} earlier issues cleared.`);
  if (introduced.length > 0) parts.push(introduced.length === 1 ? 'One new issue appeared.' : `${introduced.length} new issues appeared.`);

  if (parts.length === 0) return 'Essentially unchanged — no meaningful difference between these runs.';
  if (fps && fps.before !== null && fps.after !== null && fps.direction === 'flat') parts.unshift('FPS held steady.');
  return parts.slice(0, 3).join(' ');
}

export function compareRuns(before: SlimResult, after: SlimResult): Comparison {
  const heroDeltas = buildHeroDeltas(before, after);
  const eventDiff = buildEventDiff(before.events, after.events);
  return {
    before,
    after,
    heroDeltas,
    sensorDeltas: buildSensorDeltas(before, after),
    eventDiff,
    mismatches: buildMismatches(before, after),
    timeSplitDelta: {
      before: before.windows.timeSplit,
      after: after.windows.timeSplit,
      dominantChanged: before.windows.timeSplit.dominant !== after.windows.timeSplit.dominant,
    },
    headline: buildHeadline(heroDeltas, eventDiff),
    caveat: WORKLOAD_CAVEAT,
  };
}

import type {
  CanonicalKey, DiagEvent, InferredSpecs, SavedRun, SlimResult, Stats, TimeSplit,
} from '../types';

const DEFAULT_SPECS: InferredSpecs = {
  systemModel: null, cpuVendor: 'unknown', cpuModelGuess: null,
  gpuVendor: 'unknown', gpuModelGuess: null, igpuModelGuess: null,
  igpuPresent: false, isLaptop: false, ramMb: null, ramModelGuess: null, ramModules: null,
};

const DEFAULT_SPLIT: TimeSplit = { gameplayMs: 300_000, totalMs: 360_000, shares: { gpu: 1 }, dominant: 'gpu' };

// label/unit for the keys the compare tests exercise; anything else falls back to key/null
const SENSOR_META: Partial<Record<CanonicalKey, { label: string; unit: string | null }>> = {
  'cpu.tempPackage': { label: 'CPU Package', unit: '°C' },
  'cpu.tempCoreMax': { label: 'Core Temperatures (Max)', unit: '°C' },
  'cpu.usageTotal': { label: 'Total CPU Usage', unit: '%' },
  'cpu.power': { label: 'CPU Package Power', unit: 'W' },
  'gpu.temp': { label: 'GPU Temperature', unit: '°C' },
  'gpu.hotspot': { label: 'GPU Hot Spot Temperature', unit: '°C' },
  'gpu.usage': { label: 'GPU Core Load', unit: '%' },
  'gpu.clock': { label: 'GPU Clock', unit: 'MHz' },
  'gpu.power': { label: 'GPU Power', unit: 'W' },
  'pm.frameTimeMs': { label: 'Frame Time Presented', unit: 'ms' },
  'ram.loadPct': { label: 'Physical Memory Load', unit: '%' },
};

export function stat(over: { avg: number; max?: number; p1Low?: number; p5Low?: number; count?: number }): Stats {
  const max = over.max ?? over.avg;
  const p1 = over.p1Low ?? over.avg;
  return {
    count: over.count ?? 100, avg: over.avg, min: p1, max,
    p5: p1, p95: max, p99: max, p1Low: p1, p5Low: over.p5Low ?? p1,
  };
}

export function makeSlim(over: {
  specs?: Partial<InferredSpecs>;
  stats?: SlimResult['stats'];
  fps?: Partial<SlimResult['log']['fps']>;
  flagCounts?: SlimResult['log']['flagCounts'];
  events?: DiagEvent[];
  timeSplit?: Partial<TimeSplit>;
  activityKind?: 'gameplay' | 'workload';
  digest?: Partial<SlimResult['digest']>;
} = {}): SlimResult {
  const stats = over.stats ?? {};
  const sensors: SlimResult['log']['sensors'] = {};
  for (const key of Object.keys(stats) as CanonicalKey[]) {
    const meta = SENSOR_META[key] ?? { label: key, unit: null };
    sensors[key] = { key, label: meta.label, unit: meta.unit, values: [] };
  }
  const timeSplit: TimeSplit = { ...DEFAULT_SPLIT, ...over.timeSplit };
  return {
    slim: true,
    log: {
      rowCount: 180,
      pollMs: 2000,
      specs: { ...DEFAULT_SPECS, ...over.specs },
      sensors,
      flagCounts: over.flagCounts ?? {},
      fps: {
        source: 'none', sourceLabel: '', clean: [], stats: null,
        presentedAvg: null, displayedAvg: null, capped: false, capValue: null,
        series: [], presented1PctLow: null, presented01PctLow: null, rtss1PctLow: null,
        ...over.fps,
      },
      unknownColumns: [],
      timesMs: [],
      cores: null,
    },
    stats,
    events: over.events ?? [],
    verdict: {
      health: 'good', mascotMood: 'chill', headline: 'Everything looks healthy.',
      hero: [], findings: [], timeSplit, worst: [], primaryFix: null, coverage: null, guidance: [],
    },
    digest: {
      compact: 'COMPACT BODY\n\nGoal: stored per-run goal',
      full: 'FULL BODY\n\nGoal: stored per-run goal',
      tokenEstimate: { compact: 8, full: 8 },
      fpsSourceLabel: '',
      ...over.digest,
    },
    windows: {
      windows: [],
      timeSplit,
      worst: [],
      windowMs: 8000,
      lowConfidence: false,
      activityKind: over.activityKind ?? 'gameplay',
      logStartMs: 0,
    },
    durationMs: timeSplit.totalMs,
  };
}

export function makeSavedRun(result: SlimResult, over: Partial<Omit<SavedRun, 'result'>> = {}): SavedRun {
  return {
    id: over.id ?? 'run-1',
    name: over.name ?? 'Test run',
    createdAt: over.createdAt ?? 1_770_000_000_000,
    result,
  };
}

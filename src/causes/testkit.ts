import type {
  CanonicalKey, FlagKey, NormalizedLog, EvidenceTier, Limiter,
  TimeWindow, WindowActivity, WindowAnalysis, WindowClassification, WindowMetrics,
} from '../types';
import { buildTimeSplit, pickWorst } from '../windows/aggregate';

export function makeLog(over: {
  sensors?: Partial<Record<CanonicalKey, number[]>>;
  flags?: Partial<Record<FlagKey, boolean[]>>;
  fps?: Partial<NormalizedLog['fps']>;
  pollMs?: number;
}): NormalizedLog {
  const sensors: NormalizedLog['sensors'] = {};
  for (const [k, values] of Object.entries(over.sensors ?? {}))
    sensors[k as CanonicalKey] = { key: k as CanonicalKey, label: k, unit: null, values };
  const flags: NormalizedLog['flags'] = {};
  for (const [k, values] of Object.entries(over.flags ?? {}))
    flags[k as FlagKey] = { key: k as FlagKey, label: k, values };
  return {
    rowCount: over.sensors ? Object.values(over.sensors)[0]?.length ?? 0 : 0,
    pollMs: over.pollMs ?? 2000,
    specs: { systemModel: null, cpuVendor: 'unknown', cpuModelGuess: null, gpuVendor: 'unknown', gpuModelGuess: null, igpuModelGuess: null, igpuPresent: false, isLaptop: false, ramMb: null, ramModelGuess: null, ramModules: null },
    sensors, flags,
    fps: { source: 'none', sourceLabel: '', clean: [], stats: null, presentedAvg: null, displayedAvg: null, capped: false, capValue: null, series: [], presented1PctLow: null, presented01PctLow: null, rtss1PctLow: null, ...over.fps },
    unknownColumns: [],
    timesMs: [],
    cores: null,
  };
}

export function makeMetrics(over: Partial<WindowMetrics> = {}): WindowMetrics {
  return {
    fpsAvg: null, fpsCoverage: 1, frameTimeMs: null, frameTimeMaxMs: null,
    gpuBusyMs: null, cpuBusyMs: null, gpuUsage: null, cpuMaxThread: null, cpuTotal: null,
    gpuPowerW: null, gpuPowerLimitW: null, gpuClockEffMhz: null, cpuClockEffMhz: null,
    gpuTempC: null, cpuTempC: null, vramDedicatedMb: null, vramDynamicMb: null,
    ramLoadPct: null, flagsFired: [], ...over,
  };
}

export function makeWindow(i: number, over: {
  activity?: WindowActivity; limiter?: Limiter; tier?: EvidenceTier | null;
  metrics?: Partial<WindowMetrics>; durMs?: number;
} = {}): WindowClassification {
  const dur = over.durMs ?? 8000;
  const window: TimeWindow = { index: i, startRow: i * 4, endRow: i * 4 + 3, startMs: i * dur, endMs: i * dur + dur - 2000 };
  return {
    window,
    activity: over.activity ?? 'gameplay',
    limiter: over.limiter ?? 'unknown',
    tier: over.tier === undefined ? 'measured' : over.tier,
    basis: [],
    metrics: makeMetrics(over.metrics),
  };
}

export function makeWindowAnalysis(windows: WindowClassification[], over: Partial<WindowAnalysis> = {}): WindowAnalysis {
  return {
    windows,
    timeSplit: buildTimeSplit(windows),
    worst: pickWorst(windows),
    windowMs: 8000,
    lowConfidence: false,
    activityKind: 'gameplay',
    ...over,
  };
}

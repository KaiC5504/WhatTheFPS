import type { NormalizedLog, CanonicalKey, FlagKey } from '../types';

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
    fps: { source: 'none', sourceLabel: '', clean: [], stats: null, presentedAvg: null, displayedAvg: null, capped: false, capValue: null, ...over.fps },
    unknownColumns: [],
  };
}

import type { EvidenceTier, FlagKey, NormalizedLog, WindowClassification } from '../types';

export function majorityTier(windows: WindowClassification[]): EvidenceTier {
  const measured = windows.filter((w) => w.tier === 'measured').length;
  return measured * 2 >= windows.length ? 'measured' : 'inferred';
}

export function countTrue(values: boolean[]): number {
  let n = 0;
  for (const v of values) if (v) n++;
  return n;
}

// Fraction of samples where the flag fired; 0 when the flag is missing or empty.
export function flagDensity(log: NormalizedLog, key: FlagKey): number {
  const flag = log.flags[key];
  if (!flag || flag.values.length === 0) return 0;
  return countTrue(flag.values) / flag.values.length;
}

export function dedupe(items: string[]): string[] {
  return [...new Set(items)];
}

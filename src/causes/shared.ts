import type { EvidenceTier, WindowClassification } from '../types';

export function majorityTier(windows: WindowClassification[]): EvidenceTier {
  const measured = windows.filter((w) => w.tier === 'measured').length;
  return measured * 2 >= windows.length ? 'measured' : 'inferred';
}

export function dedupe(items: string[]): string[] {
  return [...new Set(items)];
}

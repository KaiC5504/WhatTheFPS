import type { InferredSpecs } from '../types';

const KEY = 'wtfps.specs.v1';

// Blank specs for the settings editor when no log has been analyzed and nothing is saved.
export const EMPTY_SPECS: InferredSpecs = {
  systemModel: null,
  cpuVendor: 'unknown',
  cpuModelGuess: null,
  gpuVendor: 'unknown',
  gpuModelGuess: null,
  igpuModelGuess: null,
  igpuPresent: false,
  isLaptop: false,
  ramMb: null,
  ramModelGuess: null,
  ramModules: null,
};

export function saveSpecs(specs: InferredSpecs): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(specs));
  } catch {
    // Quota exceeded or private browsing — silently ignore
  }
}

export function loadSpecs(): InferredSpecs | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw === null) return null;
    return JSON.parse(raw) as InferredSpecs;
  } catch {
    return null;
  }
}

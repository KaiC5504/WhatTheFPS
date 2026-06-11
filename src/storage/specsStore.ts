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

// When the same machine is re-analyzed, the saved blob carries the user's manual edits and
// wins — but a blob written by an older build can be missing fields this build now detects
// (iGPU, DIMM count, RAM kit…). Backfill only the gaps from the fresh inference so new
// detections surface without clobbering anything the user actually set.
export function reconcileSpecs(fresh: InferredSpecs, saved: InferredSpecs): InferredSpecs {
  const out: InferredSpecs = { ...fresh, ...saved };
  for (const key of Object.keys(fresh) as (keyof InferredSpecs)[]) {
    if (saved[key] == null && fresh[key] != null) Object.assign(out, { [key]: fresh[key] });
  }
  // igpuPresent is a derived boolean, never null — a saved `false` from a build that didn't
  // detect iGPUs would otherwise hide a real one, so let a fresh detection flip it on.
  if (!saved.igpuPresent && fresh.igpuPresent) {
    out.igpuPresent = true;
    if (saved.igpuModelGuess == null) out.igpuModelGuess = fresh.igpuModelGuess;
  }
  return out;
}

import type { InferredSpecs } from '../types';

const KEY = 'wtfps.specs.v1';

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

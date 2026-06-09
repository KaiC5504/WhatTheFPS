import { describe, it, expect, beforeEach } from 'vitest';
import { loadSpecs, saveSpecs } from './specsStore';
import type { InferredSpecs } from '../types';

const sample: InferredSpecs = {
  cpuVendor: 'intel',
  cpuModelGuess: 'Intel Core i9-13900K',
  gpuVendor: 'nvidia',
  gpuModelGuess: 'NVIDIA RTX 4090',
  igpuPresent: false,
  isLaptop: false,
  ramMb: 32768,
};

describe('specsStore', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('round-trips a full InferredSpecs', () => {
    saveSpecs(sample);
    expect(loadSpecs()).toEqual(sample);
  });

  it('returns null when storage is empty', () => {
    expect(loadSpecs()).toBeNull();
  });

  it('returns null on malformed JSON', () => {
    localStorage.setItem('wtfps.specs.v1', '{bad json}');
    expect(loadSpecs()).toBeNull();
  });

  it('save is a no-op on quota error (swallowed)', () => {
    const origSetItem = localStorage.setItem.bind(localStorage);
    localStorage.setItem = () => { throw new DOMException('QuotaExceededError'); };
    // Should not throw
    expect(() => saveSpecs(sample)).not.toThrow();
    localStorage.setItem = origSetItem;
  });
});

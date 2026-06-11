import { describe, it, expect, beforeEach } from 'vitest';
import { loadSpecs, saveSpecs, reconcileSpecs } from './specsStore';
import type { InferredSpecs } from '../types';

const sample: InferredSpecs = {
  systemModel: 'ASUS ROG Strix G614JI',
  cpuVendor: 'intel',
  cpuModelGuess: 'Intel Core i9-13900K',
  gpuVendor: 'nvidia',
  gpuModelGuess: 'NVIDIA RTX 4090',
  igpuModelGuess: null,
  igpuPresent: false,
  isLaptop: false,
  ramMb: 32768,
  ramModelGuess: 'Kingston KF556S40-16',
  ramModules: 2,
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

describe('reconcileSpecs', () => {
  const fresh: InferredSpecs = {
    systemModel: 'ASUS ROG Strix G614JI',
    cpuVendor: 'intel',
    cpuModelGuess: 'Intel Core i7-13650HX',
    gpuVendor: 'nvidia',
    gpuModelGuess: 'NVIDIA GeForce RTX 4070 Laptop',
    igpuModelGuess: 'Intel UHD Graphics',
    igpuPresent: true,
    isLaptop: true,
    ramMb: 32768,
    ramModelGuess: 'Kingston KF556S40-16',
    ramModules: 2,
  };

  it('backfills fields a stale saved blob is missing from the fresh detection', () => {
    // A blob written before iGPU / DIMM-count detection existed.
    const stale: InferredSpecs = {
      ...fresh,
      igpuModelGuess: null,
      igpuPresent: false,
      ramModelGuess: null,
      ramModules: null,
    };
    const out = reconcileSpecs(fresh, stale);
    expect(out.igpuPresent).toBe(true);
    expect(out.igpuModelGuess).toBe('Intel UHD Graphics');
    expect(out.ramModelGuess).toBe('Kingston KF556S40-16');
    expect(out.ramModules).toBe(2);
  });

  it('keeps the user\'s manual edits over the fresh detection', () => {
    const edited: InferredSpecs = {
      ...fresh,
      cpuModelGuess: 'My Custom CPU Name',
      ramModules: 4,
      igpuModelGuess: 'Intel Iris Xe',
    };
    const out = reconcileSpecs(fresh, edited);
    expect(out.cpuModelGuess).toBe('My Custom CPU Name');
    expect(out.ramModules).toBe(4);
    expect(out.igpuModelGuess).toBe('Intel Iris Xe');
  });

  it('flips igpuPresent on when the fresh log detects an iGPU the saved blob lacked', () => {
    const noIgpu: InferredSpecs = { ...fresh, igpuPresent: false, igpuModelGuess: null };
    expect(reconcileSpecs(fresh, noIgpu).igpuPresent).toBe(true);
  });
});

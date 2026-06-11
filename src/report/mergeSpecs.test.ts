import { describe, it, expect } from 'vitest';
import { mergeSpecs } from './mergeSpecs';
import type { InferredSpecs } from '../types';

const current: InferredSpecs = {
  systemModel: 'ASUS ROG Strix G614JI',
  cpuVendor: 'intel',
  cpuModelGuess: 'Intel hybrid (6P+8E)',
  gpuVendor: 'nvidia',
  gpuModelGuess: 'NVIDIA dGPU',
  igpuModelGuess: 'Intel UHD Graphics',
  igpuPresent: true,
  isLaptop: true,
  ramMb: 32768,
  ramModelGuess: null,
  ramModules: 2,
};

describe('mergeSpecs', () => {
  it('report fields win where present', () => {
    const merged = mergeSpecs(current, {
      cpuModelGuess: '13th Gen Intel(R) Core(TM) i7-13650HX',
      ramModelGuess: 'KF556S40-16',
    });
    expect(merged.cpuModelGuess).toBe('13th Gen Intel(R) Core(TM) i7-13650HX');
    expect(merged.ramModelGuess).toBe('KF556S40-16');
  });

  it('absent and null report fields preserve the current values', () => {
    const merged = mergeSpecs(current, { gpuModelGuess: 'NVIDIA GeForce RTX 4070 Laptop GPU', systemModel: null });
    expect(merged.systemModel).toBe('ASUS ROG Strix G614JI');
    expect(merged.cpuModelGuess).toBe('Intel hybrid (6P+8E)');
  });

  it('never touches fields the report cannot state (vendor, laptop, module count)', () => {
    const merged = mergeSpecs(current, { cpuModelGuess: 'AMD Ryzen 7 7800X3D' });
    expect(merged.cpuVendor).toBe('intel'); // vendor stays with the CSV fingerprint by design
    expect(merged.isLaptop).toBe(true);
    expect(merged.ramModules).toBe(2);
  });
});

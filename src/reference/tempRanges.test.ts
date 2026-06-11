import { describe, it, expect } from 'vitest';
import { lookupTempRange } from './tempRanges';
import type { TempComponent } from './tempRanges';
import type { InferredSpecs } from '../types';

function specs(over: Partial<InferredSpecs> = {}): InferredSpecs {
  return {
    systemModel: null, cpuVendor: 'unknown', cpuModelGuess: null,
    gpuVendor: 'unknown', gpuModelGuess: null, igpuModelGuess: null,
    igpuPresent: false, isLaptop: false, ramMb: null, ramModelGuess: null, ramModules: null,
    ...over,
  };
}

describe('lookupTempRange — CPU classes', () => {
  it('desktop Ryzen X3D class has the lowered 89 °C limit', () => {
    const r = lookupTempRange('cpu', specs({ cpuVendor: 'amd', cpuModelGuess: 'AMD Ryzen 7 7800X3D' }));
    expect(r.badAt).toBe(89);
    expect(r.warnAt).toBe(80);
  });
  it('desktop Ryzen non-X3D class limits at 95 °C', () => {
    const r = lookupTempRange('cpu', specs({ cpuVendor: 'amd', cpuModelGuess: 'AMD Ryzen 9 5900X' }));
    expect(r.badAt).toBe(95);
  });
  it('mobile Ryzen class limits at 100 °C', () => {
    const r = lookupTempRange('cpu', specs({ cpuVendor: 'amd', cpuModelGuess: 'AMD Ryzen 9 8940HX', isLaptop: true }));
    expect(r.badAt).toBe(100);
  });
  it('Intel class limits at 100 °C and unknown vendor falls back to the generic 90/100', () => {
    expect(lookupTempRange('cpu', specs({ cpuVendor: 'intel' }))).toMatchObject({ warnAt: 90, badAt: 100 });
    expect(lookupTempRange('cpu', specs())).toMatchObject({ warnAt: 90, badAt: 100 });
  });
});

describe('lookupTempRange — GPU classes', () => {
  it('laptop GeForce throttle target is 87 °C; desktop keeps 90 °C', () => {
    expect(lookupTempRange('gpu', specs({ gpuVendor: 'nvidia', isLaptop: true }))).toMatchObject({ warnAt: 80, badAt: 87 });
    expect(lookupTempRange('gpu', specs({ gpuVendor: 'nvidia' }))).toMatchObject({ warnAt: 85, badAt: 90 });
  });
  it('Radeon edge runs hotter by design; the hotspot is the limiter at 110 °C', () => {
    expect(lookupTempRange('gpu', specs({ gpuVendor: 'amd' })).badAt).toBe(100);
    expect(lookupTempRange('gpu.hotspot', specs({ gpuVendor: 'amd' })).badAt).toBe(110);
  });
  it('unknown GPU vendor falls back to the previous hardcoded 85/90', () => {
    expect(lookupTempRange('gpu', specs())).toMatchObject({ warnAt: 85, badAt: 90 });
  });
});

describe('lookupTempRange — other components', () => {
  it('NVMe drives throttle around 70 °C and are at component limits by 80 °C', () => {
    expect(lookupTempRange('drive', specs())).toMatchObject({ warnAt: 70, badAt: 80 });
  });
  it('VRM and memory-junction entries exist for any vendor', () => {
    expect(lookupTempRange('vrm', specs()).badAt).toBeGreaterThan(lookupTempRange('vrm', specs()).warnAt);
    expect(lookupTempRange('gpu.memJunction', specs()).badAt).toBeGreaterThan(90);
  });
});

describe('lookupTempRange — table invariants', () => {
  const COMPONENTS: TempComponent[] = ['cpu', 'gpu', 'gpu.hotspot', 'gpu.memJunction', 'vrm', 'drive'];
  it('every reachable entry keeps warnAt < badAt and carries a sourced note', () => {
    for (const component of COMPONENTS)
      for (const cpuVendor of ['intel', 'amd', 'unknown'] as const)
        for (const gpuVendor of ['nvidia', 'amd', 'intel', 'unknown'] as const)
          for (const isLaptop of [false, true])
            for (const cpuModelGuess of [null, 'AMD Ryzen 7 7800X3D']) {
              const r = lookupTempRange(component, specs({ cpuVendor, gpuVendor, isLaptop, cpuModelGuess }));
              expect(r.warnAt, `${component}/${cpuVendor}/${gpuVendor}/${isLaptop}`).toBeLessThan(r.badAt);
              expect(r.note.length).toBeGreaterThan(0);
            }
  });
});

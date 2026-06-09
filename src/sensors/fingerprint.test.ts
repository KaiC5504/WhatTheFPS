import { describe, it, expect } from 'vitest';
import { inferSpecs } from './fingerprint';

describe('inferSpecs', () => {
  it('detects an Intel hybrid CPU and counts P/E cores', () => {
    const headers = [
      'P-core 0 VID [V]', 'P-core 1 VID [V]', 'P-core 2 VID [V]', 'P-core 3 VID [V]',
      'P-core 4 VID [V]', 'P-core 5 VID [V]',
      'E-core 6 VID [V]', 'E-core 7 VID [V]', 'E-core 8 VID [V]', 'E-core 9 VID [V]',
      'E-core 10 VID [V]', 'E-core 11 VID [V]', 'E-core 12 VID [V]', 'E-core 13 VID [V]',
    ];
    const s = inferSpecs(headers);
    expect(s.cpuVendor).toBe('intel');
    expect(s.cpuModelGuess).toMatch(/6P\+8E/);
  });

  it('detects an AMD chiplet CPU', () => {
    const headers = ['Core0 (CCD1) [°C]', 'Infinity Fabric Clock (FCLK) [MHz]', 'CPU (Tctl/Tdie) [°C]'];
    const s = inferSpecs(headers);
    expect(s.cpuVendor).toBe('amd');
    expect(s.cpuModelGuess).toMatch(/chiplet/i);
  });

  it('detects an Nvidia discrete GPU', () => {
    expect(inferSpecs(['GPU 12VHPWR Voltage [V]']).gpuVendor).toBe('nvidia');
    expect(inferSpecs(['GPU Memory Junction Temperature [°C]']).gpuVendor).toBe('nvidia');
  });

  it('flags a laptop from battery / APU STAPM markers', () => {
    expect(inferSpecs(['Battery Voltage [V]']).isLaptop).toBe(true);
    expect(inferSpecs(['APU STAPM Limit [%]']).isLaptop).toBe(true);
    expect(inferSpecs(['CPU Package Power [W]']).isLaptop).toBe(false);
  });

  it('detects an integrated GPU', () => {
    expect(inferSpecs(['GPU Core Voltage (VDDCR_GFX) [V]']).igpuPresent).toBe(true);
    expect(inferSpecs(['iGPU VID [V]']).igpuPresent).toBe(true);
    expect(inferSpecs(['GPU Core Temperature [°C]']).igpuPresent).toBe(true);
    expect(inferSpecs(['CPU Package Power [W]']).igpuPresent).toBe(false);
  });

  it('returns unknown vendors when nothing matches', () => {
    const s = inferSpecs(['Date', 'Time', 'Some Unknown Sensor [X]']);
    expect(s.cpuVendor).toBe('unknown');
    expect(s.gpuVendor).toBe('unknown');
    expect(s.cpuModelGuess).toBeNull();
    expect(s.ramMb).toBeNull();
  });
});

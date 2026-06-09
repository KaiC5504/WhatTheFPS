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

  describe('from the HWiNFO source row', () => {
    const sources = [
      '', '', // Date / Time have no source
      'System: ASUS ROG Strix G614JI_G614JI',
      'CPU [#0]: Intel Core i7-13650HX',
      'CPU [#0]: Intel Core i7-13650HX: DTS', // suffixed duplicate must not leak into the model
      'dGPU [#1]: NVIDIA GeForce RTX 4070 Laptop',
      'iGPU [#0]: Intel UHD Graphics',
      'DDR5 DIMM [#0]: Kingston KF556S40-16 (BANK 0/Controller0-ChannelA-DIMM0)',
      'DDR5 DIMM [#2]: Kingston KF556S40-16 (BANK 0/Controller1-ChannelA-DIMM0)',
    ];
    const names = ['Date', 'Time', 'System', 'CPU Package Power [W]', 'x', 'GPU Power [W]', 'GPU Core Temperature [°C]', 'r0', 'r1'];

    it('extracts the real CPU model, stripping sub-source qualifiers', () => {
      expect(inferSpecs(names, sources).cpuModelGuess).toBe('Intel Core i7-13650HX');
    });
    it('extracts the discrete GPU model and infers its vendor from the name', () => {
      const s = inferSpecs(names, sources);
      expect(s.gpuModelGuess).toBe('NVIDIA GeForce RTX 4070 Laptop');
      expect(s.gpuVendor).toBe('nvidia');
    });
    it('extracts the iGPU model and the system model', () => {
      const s = inferSpecs(names, sources);
      expect(s.igpuModelGuess).toBe('Intel UHD Graphics');
      expect(s.igpuPresent).toBe(true);
      expect(s.systemModel).toBe('ASUS ROG Strix G614JI_G614JI');
    });
    it('extracts the RAM kit and counts populated DIMM slots', () => {
      const s = inferSpecs(names, sources);
      expect(s.ramModelGuess).toBe('Kingston KF556S40-16');
      expect(s.ramModules).toBe(2);
    });
    it('prefers the discrete GPU over the integrated one for gpuModelGuess', () => {
      const s = inferSpecs(['GPU Power [W]'], ['dGPU [#0]: NVIDIA GeForce RTX 5070 Laptop', 'iGPU [#1]: AMD Radeon 610M']);
      expect(s.gpuModelGuess).toBe('NVIDIA GeForce RTX 5070 Laptop');
    });
    it('falls back to the topology guess when the trailer lacks a CPU model', () => {
      expect(inferSpecs(['P-core 0 VID [V]', 'E-core 6 VID [V]']).cpuModelGuess).toMatch(/Intel hybrid/);
    });
  });
});

import { describe, it, expect } from 'vitest';
import { findSensor } from './registry';

const key = (name: string) => findSensor(name)?.key ?? null;

describe('findSensor', () => {
  it('resolves representative discrete-GPU temperature names', () => {
    expect(key('GPU Hot Spot Temperature')).toBe('gpu.hotspot');
    expect(key('GPU Memory Junction Temperature')).toBe('gpu.memJunction');
    expect(key('GPU Temperature')).toBe('gpu.temp');
  });
  it('resolves CPU names', () => {
    expect(key('CPU Package')).toBe('cpu.tempPackage');
    expect(key('CPU (Tctl/Tdie)')).toBe('cpu.tempPackage');
    expect(key('Total CPU Usage')).toBe('cpu.usageTotal');
    expect(key('CPU Package Power')).toBe('cpu.power');
  });
  it('resolves GPU usage and memory names', () => {
    expect(key('GPU Core Load')).toBe('gpu.usage');
    expect(key('GPU Power')).toBe('gpu.power');
    expect(key('GPU Power Limit (rated)')).toBe('gpu.powerLimit');
  });
  it('resolves memory names', () => {
    expect(key('Physical Memory Load')).toBe('ram.loadPct');
    expect(key('Physical Memory Used')).toBe('ram.usedMb');
    expect(key('Page File Usage')).toBe('pagefile.usagePct');
  });
  it('resolves GPU performance-limiter flags', () => {
    expect(key('Performance Limit - Utilization')).toBe('flag.gpu.perfLimitUtil');
    expect(key('Performance Limit - Power')).toBe('flag.gpu.perfLimitPower');
    expect(key('Performance Limit - Thermal')).toBe('flag.gpu.perfLimitThermal');
  });
  it('resolves CPU throttle flags across Intel and AMD wording', () => {
    expect(key('Core Thermal Throttling (avg)')).toBe('flag.cpu.thermalThrottle');
    expect(key('Thermal Throttling (HTC)')).toBe('flag.cpu.thermalThrottle');
    expect(key('IA: PROCHOT')).toBe('flag.cpu.prochot');
    expect(key('Thermal Throttling (PROCHOT CPU)')).toBe('flag.cpu.prochot');
    expect(key('IA: Running Average Thermal Limit')).toBe('flag.cpu.ratl');
  });
  it('returns the SensorDef shape with domain and kind', () => {
    const def = findSensor('GPU Hot Spot Temperature');
    expect(def).not.toBeNull();
    expect(def!.domain).toBe('gpu');
    expect(def!.kind).toBe('numeric');
    expect(def!.unit).toBe('°C');
  });
  it('returns null for an unknown column name', () => {
    expect(findSensor('Battery Charge Level')).toBeNull();
    expect(findSensor('Bus Clock')).toBeNull();
  });
  it('is case-insensitive', () => {
    expect(key('total cpu usage')).toBe('cpu.usageTotal');
  });
});

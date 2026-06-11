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
  it('maps the PresentMon block', () => {
    expect(key('GPU Busy (avg)')).toBe('pm.gpuBusyMs');
    expect(key('GPU Wait (avg)')).toBe('pm.gpuWaitMs');
    expect(key('CPU Busy (avg)')).toBe('pm.cpuBusyMs');
    expect(key('CPU Wait (avg)')).toBe('pm.cpuWaitMs');
    expect(key('Frame Time Presented (avg)')).toBe('pm.frameTimeMs');
  });
  it('maps RTSS frame time and VRAM MB columns', () => {
    expect(key('Frame Time')).toBe('rtss.frameTimeMs');
    expect(key('GPU Memory Allocated')).toBe('vram.allocatedMb');
    expect(key('GPU Memory Available')).toBe('vram.availableMb');
    expect(key('GPU D3D Memory Dedicated')).toBe('vram.d3dDedicatedMb');
    expect(key('GPU D3D Memory Dynamic')).toBe('vram.d3dDynamicMb');
    expect(key('GPU Memory Controller Load')).toBe('gpu.memControllerLoad');
  });
  it('maps fan and core-voltage columns', () => {
    expect(key('GPU Core Voltage')).toBe('gpu.coreVoltage');
    expect(key('Core VIDs (avg)')).toBe('cpu.coreVoltage');
    expect(key('CPU VDDCR_VDD Voltage (SVI3 TFN)')).toBe('cpu.coreVoltage');
    expect(key('CPU Core Voltage (SVI2 TFN)')).toBe('cpu.coreVoltage');
    expect(key('Vcore')).toBe('cpu.coreVoltage');
    expect(key('CPU Fan')).toBe('fan.cpuRpm');
    expect(key('GPU Fan')).toBe('fan.gpuRpm');
    expect(key('GPU Fan1')).toBe('fan.gpuRpm');
  });
  it('does not map the AMD iGPU rail onto the discrete GPU voltage key', () => {
    expect(key('GPU Core Voltage (VDDCR_GFX)')).toBeNull();
  });
  it('maps the extra GPU limiter flags, AMD throttle reasons onto the same semantic keys', () => {
    expect(key('Performance Limit - Reliability Voltage')).toBe('flag.gpu.perfLimitVRel');
    expect(key('Performance Limit - Max Operating Voltage')).toBe('flag.gpu.perfLimitVOp');
    expect(key('Throttle Reason - Power')).toBe('flag.gpu.perfLimitPower');
    expect(key('Throttle Reason - Thermal')).toBe('flag.gpu.perfLimitThermal');
    expect(key('Throttle Reason - Current')).toBe('flag.gpu.perfLimitCurrent');
    expect(key('Thermal Throttling (PROCHOT EXT)')).toBe('flag.cpu.prochot');
  });
  it('maps drive sensors including the numbered instances HWiNFO emits per extra thermal sensor', () => {
    expect(key('Drive Temperature')).toBe('drive.tempC');
    expect(key('Drive Temperature 2')).toBe('drive.tempC');   // AMD + Intel drive #1
    expect(key('Drive Temperature 3')).toBe('drive.tempC');   // Intel drive #2
    expect(key('Total Activity')).toBe('drive.activityPct');
    expect(key('Read Rate')).toBe('drive.readRateMbps');
    expect(key('Write Rate')).toBe('drive.writeRateMbps');
    // per-direction activity and wear columns stay unmapped (out of scope)
    expect(key('Read Activity')).toBeNull();
    expect(key('Drive Remaining Life')).toBeNull();
    expect(key('Drive Temperature X')).toBeNull();            // numbered means digits only
  });
  it('maps every AMD SVI3 VRM rail temp onto one worst-rail key', () => {
    expect(key('CPU VDDCR_VDD VRM (SVI3 TFN)')).toBe('vrm.tempC');
    expect(key('CPU VDDCR_SOC VRM (SVI3 TFN)')).toBe('vrm.tempC');
    expect(key('CPU VDD_MISC VRM (SVI3 TFN)')).toBe('vrm.tempC');
    // the Voltage near-miss must keep resolving to the existing voltage key
    expect(key('CPU VDDCR_VDD Voltage (SVI3 TFN)')).toBe('cpu.coreVoltage');
  });
  it('maps the Intel core VR thermal alert; GT/RING variants stay unmapped', () => {
    expect(key('IA: VR Thermal Alert')).toBe('flag.cpu.vrThermalAlert');
    expect(key('GT: VR Thermal Alert')).toBeNull();
    expect(key('RING: VR Thermal Alert')).toBeNull();
  });
  it('marks drive/VRM keys for the per-row-max merge', () => {
    const def = findSensor('Drive Temperature 2');
    expect(def!.multi).toBe('max');
    expect(def!.domain).toBe('drive');
    expect(findSensor('CPU VDDCR_VDD VRM (SVI3 TFN)')!.multi).toBe('max');
    expect(findSensor('CPU VDDCR_VDD VRM (SVI3 TFN)')!.domain).toBe('cpu');
    expect(findSensor('GPU Temperature')!.multi).toBeUndefined();
  });
});

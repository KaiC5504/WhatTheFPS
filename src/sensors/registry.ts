import type { CanonicalKey, FlagKey } from '../types';

export interface SensorDef {
  key: CanonicalKey | FlagKey;
  domain: 'cpu' | 'gpu' | 'igpu' | 'ram' | 'flag';
  kind: 'numeric' | 'flag';
  label: string;
  unit: string | null;
  match: (name: string) => boolean; // receives a lower-cased name
}

// Exact (case-insensitive) name equality — HWiNFO column names are stable strings.
const eq = (...names: string[]) => {
  const set = new Set(names.map((n) => n.toLowerCase()));
  return (name: string) => set.has(name);
};

// First matching def wins, so order specific names before generic ones
// (Hot Spot / Memory Junction must precede the bare "GPU Temperature").
const DEFS: SensorDef[] = [
  // CPU temps
  { key: 'cpu.tempPackage', domain: 'cpu', kind: 'numeric', label: 'CPU Package', unit: '°C',
    match: eq('CPU Package', 'CPU (Tctl/Tdie)') },
  { key: 'cpu.tempCoreMax', domain: 'cpu', kind: 'numeric', label: 'CPU Core Max', unit: '°C',
    match: eq('Core Max', 'CPU CCD1 (Tdie)') },
  // CPU usage
  { key: 'cpu.usageTotal', domain: 'cpu', kind: 'numeric', label: 'Total CPU Usage', unit: '%',
    match: eq('Total CPU Usage') },
  { key: 'cpu.usageCoreMax', domain: 'cpu', kind: 'numeric', label: 'Max CPU/Thread Usage', unit: '%',
    match: eq('Max CPU/Thread Usage') },
  // CPU clocks
  { key: 'cpu.clockEff', domain: 'cpu', kind: 'numeric', label: 'CPU Effective Clock', unit: 'MHz',
    match: eq('Core Effective Clocks (avg)', 'Average Effective Clock') },
  { key: 'cpu.clock', domain: 'cpu', kind: 'numeric', label: 'CPU Clock', unit: 'MHz',
    match: eq('Core Clocks (avg)') },
  // CPU power
  { key: 'cpu.power', domain: 'cpu', kind: 'numeric', label: 'CPU Package Power', unit: 'W',
    match: eq('CPU Package Power') },

  // discrete GPU temps — specific first
  { key: 'gpu.hotspot', domain: 'gpu', kind: 'numeric', label: 'GPU Hot Spot', unit: '°C',
    match: eq('GPU Hot Spot Temperature') },
  { key: 'gpu.memJunction', domain: 'gpu', kind: 'numeric', label: 'GPU Memory Junction', unit: '°C',
    match: eq('GPU Memory Junction Temperature') },
  // iGPU-only Intel temp label (unambiguous, so resolve directly)
  { key: 'igpu.temp', domain: 'igpu', kind: 'numeric', label: 'iGPU Temperature', unit: '°C',
    match: eq('GPU Core Temperature') },
  // ambiguous between dGPU and iGPU — normalize resolves by section
  { key: 'gpu.temp', domain: 'gpu', kind: 'numeric', label: 'GPU Temperature', unit: '°C',
    match: eq('GPU Temperature') },

  // discrete GPU usage
  { key: 'gpu.usage', domain: 'gpu', kind: 'numeric', label: 'GPU Usage', unit: '%',
    match: eq('GPU Core Load') },
  // AMD iGPU usage label
  { key: 'igpu.usage', domain: 'igpu', kind: 'numeric', label: 'iGPU Usage', unit: '%',
    match: eq('GPU Utilization', 'GPU Total Usage') },
  // GPU memory utilization (percent)
  { key: 'gpu.memUsagePct', domain: 'gpu', kind: 'numeric', label: 'GPU Memory Usage', unit: '%',
    match: eq('GPU Memory Usage') },

  // discrete GPU clocks
  { key: 'gpu.clockEff', domain: 'gpu', kind: 'numeric', label: 'GPU Effective Clock', unit: 'MHz',
    match: eq('GPU Effective Clock') },
  { key: 'gpu.clock', domain: 'gpu', kind: 'numeric', label: 'GPU Clock', unit: 'MHz',
    match: eq('GPU Clock') },
  // discrete GPU power
  { key: 'gpu.powerLimit', domain: 'gpu', kind: 'numeric', label: 'GPU Power Limit', unit: 'W',
    match: eq('GPU Power Limit (rated)') },
  { key: 'gpu.power', domain: 'gpu', kind: 'numeric', label: 'GPU Power', unit: 'W',
    match: eq('GPU Power') },

  // VRAM in MB — these names exist in both dGPU and iGPU blocks; normalize disambiguates
  { key: 'vram.allocatedMb', domain: 'gpu', kind: 'numeric', label: 'GPU Memory Allocated', unit: 'MB',
    match: eq('GPU Memory Allocated') },
  { key: 'vram.availableMb', domain: 'gpu', kind: 'numeric', label: 'GPU Memory Available', unit: 'MB',
    match: eq('GPU Memory Available') },
  { key: 'vram.d3dDedicatedMb', domain: 'gpu', kind: 'numeric', label: 'GPU D3D Memory Dedicated', unit: 'MB',
    match: eq('GPU D3D Memory Dedicated') },
  { key: 'vram.d3dDynamicMb', domain: 'gpu', kind: 'numeric', label: 'GPU D3D Memory Dynamic', unit: 'MB',
    match: eq('GPU D3D Memory Dynamic') },
  { key: 'gpu.memControllerLoad', domain: 'gpu', kind: 'numeric', label: 'GPU Memory Controller Load', unit: '%',
    match: eq('GPU Memory Controller Load') },

  // PresentMon block (HWiNFO 7.63+)
  { key: 'pm.gpuBusyMs', domain: 'gpu', kind: 'numeric', label: 'GPU Busy', unit: 'ms',
    match: eq('GPU Busy (avg)') },
  { key: 'pm.gpuWaitMs', domain: 'gpu', kind: 'numeric', label: 'GPU Wait', unit: 'ms',
    match: eq('GPU Wait (avg)') },
  { key: 'pm.cpuBusyMs', domain: 'cpu', kind: 'numeric', label: 'CPU Busy', unit: 'ms',
    match: eq('CPU Busy (avg)') },
  { key: 'pm.cpuWaitMs', domain: 'cpu', kind: 'numeric', label: 'CPU Wait', unit: 'ms',
    match: eq('CPU Wait (avg)') },
  { key: 'pm.frameTimeMs', domain: 'gpu', kind: 'numeric', label: 'Frame Time Presented', unit: 'ms',
    match: eq('Frame Time Presented (avg)') },
  { key: 'rtss.frameTimeMs', domain: 'gpu', kind: 'numeric', label: 'Frame Time (RTSS)', unit: 'ms',
    match: eq('Frame Time') },

  // memory
  { key: 'ram.loadPct', domain: 'ram', kind: 'numeric', label: 'Physical Memory Load', unit: '%',
    match: eq('Physical Memory Load') },
  { key: 'ram.usedMb', domain: 'ram', kind: 'numeric', label: 'Physical Memory Used', unit: 'MB',
    match: eq('Physical Memory Used') },
  { key: 'pagefile.usagePct', domain: 'ram', kind: 'numeric', label: 'Page File Usage', unit: '%',
    match: eq('Page File Usage') },

  // CPU flags
  { key: 'flag.cpu.thermalThrottle', domain: 'flag', kind: 'flag', label: 'CPU Thermal Throttling', unit: 'Yes/No',
    match: eq('Core Thermal Throttling (avg)', 'Package/Ring Thermal Throttling', 'Thermal Throttling (HTC)') },
  { key: 'flag.cpu.prochot', domain: 'flag', kind: 'flag', label: 'CPU PROCHOT', unit: 'Yes/No',
    match: eq('IA: PROCHOT', 'Thermal Throttling (PROCHOT CPU)', 'Thermal Throttling (PROCHOT EXT)') },
  { key: 'flag.cpu.ratl', domain: 'flag', kind: 'flag', label: 'CPU Running Average Thermal Limit', unit: 'Yes/No',
    match: eq('IA: Running Average Thermal Limit') },
  { key: 'flag.cpu.powerLimit', domain: 'flag', kind: 'flag', label: 'CPU Power Limit Exceeded', unit: 'Yes/No',
    match: eq('Core Power Limit Exceeded (avg)', 'Package/Ring Power Limit Exceeded') },

  // GPU performance-limiter flags (AMD's 'Throttle Reason - *' map onto the same semantic keys)
  { key: 'flag.gpu.perfLimitPower', domain: 'flag', kind: 'flag', label: 'GPU Perf Limit Power', unit: 'Yes/No',
    match: eq('Performance Limit - Power', 'Throttle Reason - Power') },
  { key: 'flag.gpu.perfLimitThermal', domain: 'flag', kind: 'flag', label: 'GPU Perf Limit Thermal', unit: 'Yes/No',
    match: eq('Performance Limit - Thermal', 'Throttle Reason - Thermal') },
  { key: 'flag.gpu.perfLimitUtil', domain: 'flag', kind: 'flag', label: 'GPU Perf Limit Utilization', unit: 'Yes/No',
    match: eq('Performance Limit - Utilization') },
  { key: 'flag.gpu.perfLimitVRel', domain: 'flag', kind: 'flag', label: 'GPU Perf Limit Reliability Voltage', unit: 'Yes/No',
    match: eq('Performance Limit - Reliability Voltage') },
  { key: 'flag.gpu.perfLimitVOp', domain: 'flag', kind: 'flag', label: 'GPU Perf Limit Max Operating Voltage', unit: 'Yes/No',
    match: eq('Performance Limit - Max Operating Voltage') },
  { key: 'flag.gpu.perfLimitCurrent', domain: 'flag', kind: 'flag', label: 'GPU Perf Limit Current', unit: 'Yes/No',
    match: eq('Throttle Reason - Current') },
];

export function findSensor(name: string): SensorDef | null {
  const lower = name.toLowerCase();
  for (const def of DEFS) if (def.match(lower)) return def;
  return null;
}

import type { FlagKey, SnapshotEntry, WindowMetrics } from '../types';
import { PLAUSIBLE_FPS_MISMATCH } from './classify';

export const FLAG_LABELS: Record<FlagKey, string> = {
  'flag.cpu.thermalThrottle': 'CPU thermal throttle',
  'flag.cpu.prochot': 'CPU PROCHOT',
  'flag.cpu.ratl': 'CPU RATL',
  'flag.cpu.powerLimit': 'CPU power limit',
  'flag.gpu.perfLimitPower': 'GPU power limit',
  'flag.gpu.perfLimitThermal': 'GPU thermal limit',
  'flag.gpu.perfLimitUtil': 'GPU underutilized (waiting on CPU)',
  'flag.gpu.perfLimitVRel': 'GPU reliability voltage limit',
  'flag.gpu.perfLimitVOp': 'GPU max voltage limit',
  'flag.gpu.perfLimitCurrent': 'GPU current limit',
};

// One formatter so the digest and the UI render identical numbers for a worst moment.
export function buildSnapshot(m: WindowMetrics): SnapshotEntry[] {
  const out: SnapshotEntry[] = [];
  const push = (label: string, v: number | null, unit: string | null, digits = 0) => {
    if (v === null) return;
    out.push({ label, value: digits ? v.toFixed(digits) : String(Math.round(v)), unit });
  };
  // PresentMon can latch onto the wrong process; a frame time that contradicts the
  // window's sampled FPS would just confuse the reader, so leave it out.
  const ftImplausible = m.frameTimeMs !== null && m.fpsAvg !== null && m.fpsAvg > 0
    && Math.abs(1000 / m.frameTimeMs - m.fpsAvg) / m.fpsAvg > PLAUSIBLE_FPS_MISMATCH;
  push('FPS', m.fpsAvg, null);
  push('Frame time', ftImplausible ? null : m.frameTimeMs, 'ms', 1);
  push('GPU busy', m.gpuBusyMs, 'ms', 1);
  push('GPU usage', m.gpuUsage, '%');
  push('GPU power', m.gpuPowerW, 'W');
  push('GPU temp', m.gpuTempC, '°C');
  push('Max CPU thread', m.cpuMaxThread, '%');
  push('Total CPU', m.cpuTotal, '%');
  push('VRAM dedicated', m.vramDedicatedMb, 'MB');
  push('RAM load', m.ramLoadPct, '%');
  if (m.flagsFired.length > 0) {
    out.push({ label: 'Flags fired', value: m.flagsFired.map((k) => FLAG_LABELS[k]).join(', '), unit: null });
  }
  return out;
}

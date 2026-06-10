import type { CanonicalKey, FlagKey, NormalizedLog, TimeWindow, WindowMetrics } from '../types';

export function windowMean(values: (number | null)[] | undefined, w: TimeWindow): number | null {
  if (!values) return null;
  let sum = 0, n = 0;
  for (let i = w.startRow; i <= w.endRow && i < values.length; i++) {
    const v = values[i];
    if (v !== null && Number.isFinite(v)) { sum += v; n++; }
  }
  return n === 0 ? null : sum / n;
}

export function windowMax(values: (number | null)[] | undefined, w: TimeWindow): number | null {
  if (!values) return null;
  let max: number | null = null;
  for (let i = w.startRow; i <= w.endRow && i < values.length; i++) {
    const v = values[i];
    if (v !== null && Number.isFinite(v) && (max === null || v > max)) max = v;
  }
  return max;
}

export function flagsFiredIn(flags: NormalizedLog['flags'], w: TimeWindow): FlagKey[] {
  const fired: FlagKey[] = [];
  for (const f of Object.values(flags)) {
    if (!f) continue;
    for (let i = w.startRow; i <= w.endRow && i < f.values.length; i++) {
      if (f.values[i]) { fired.push(f.key); break; }
    }
  }
  return fired;
}

export function buildMetrics(log: NormalizedLog, w: TimeWindow): WindowMetrics {
  const s = (k: CanonicalKey) => windowMean(log.sensors[k]?.values, w);

  const rowsInWindow = w.endRow - w.startRow + 1;
  let fpsSum = 0, fpsN = 0;
  for (let i = w.startRow; i <= w.endRow && i < log.fps.series.length; i++) {
    const v = log.fps.series[i];
    if (v !== null) { fpsSum += v; fpsN++; }
  }

  return {
    fpsAvg: fpsN ? fpsSum / fpsN : null,
    fpsCoverage: rowsInWindow > 0 ? fpsN / rowsInWindow : 0,
    frameTimeMs: s('pm.frameTimeMs') ?? s('rtss.frameTimeMs'),
    frameTimeMaxMs: windowMax(log.sensors['pm.frameTimeMs']?.values, w)
      ?? windowMax(log.sensors['rtss.frameTimeMs']?.values, w),
    gpuBusyMs: s('pm.gpuBusyMs'),
    cpuBusyMs: s('pm.cpuBusyMs'),
    gpuUsage: s('gpu.usage'),
    cpuMaxThread: s('cpu.usageCoreMax'),
    cpuTotal: s('cpu.usageTotal'),
    gpuPowerW: s('gpu.power'),
    gpuPowerLimitW: s('gpu.powerLimit'),
    gpuClockEffMhz: s('gpu.clockEff') ?? s('gpu.clock'),
    cpuClockEffMhz: s('cpu.clockEff') ?? s('cpu.clock'),
    gpuTempC: s('gpu.temp') ?? s('gpu.hotspot'),
    cpuTempC: s('cpu.tempCoreMax') ?? s('cpu.tempPackage'),
    vramDedicatedMb: s('vram.d3dDedicatedMb'),
    vramDynamicMb: s('vram.d3dDynamicMb'),
    ramLoadPct: s('ram.loadPct'),
    flagsFired: flagsFiredIn(log.flags, w),
  };
}

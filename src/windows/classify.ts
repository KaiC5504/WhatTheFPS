import type { EvidenceTier, Limiter, WindowMetrics } from '../types';

export interface LimiterCall { limiter: Limiter; tier: EvidenceTier | null; basis: string[]; }

const CAP_FPS_TOLERANCE = 3;        // window counts as "at the cap" within ±3 FPS (cap-paced windows hover slightly below)
const CAP_GPU_BUSY_FRAC = 0.9;      // …unless GPU Busy fills ≥90% of the frame anyway
const T1_GPU_BOUND_DEV = 0.10;      // (frametime − gpuBusy)/frametime below this → GPU-bound
const T1_CPU_BOUND_DEV = 0.175;     // above this → CPU/system-bound
const T1_CPU_BUSY_NEAR = 0.15;      // cpuBusy within 15% of frametime strengthens the call
const UNDERUTIL_POWER_FRAC = 0.85;  // busy≈frametime but power below this × limit → pathology
const PLAUSIBLE_BUSY_OVERSHOOT = 1.15;
export const PLAUSIBLE_FPS_MISMATCH = 0.2; // 1000/frametime vs sampled FPS disagreement → wrong process
const T2_GPU_PINNED_PCT = 97;
const T2_GPU_LOW_PCT = 90;
const T2_CORE_PINNED_PCT = 95;

export function classifyLimiter(m: WindowMetrics, cap: { capped: boolean; capValue: number | null }): LimiterCall {
  const basis: string[] = [];
  let frameTime = m.frameTimeMs;
  let gpuBusy = m.gpuBusyMs;

  // PresentMon latches onto one process and can pick the wrong one; demote implausible data.
  if (frameTime !== null && gpuBusy !== null) {
    const busyOvershoot = gpuBusy > frameTime * PLAUSIBLE_BUSY_OVERSHOOT;
    const fpsMismatch = m.fpsAvg !== null && m.fpsAvg > 0
      && Math.abs(1000 / frameTime - m.fpsAvg) / m.fpsAvg > PLAUSIBLE_FPS_MISMATCH;
    if (busyOvershoot || fpsMismatch) {
      basis.push('PresentMon data failed plausibility check — using utilization fallback');
      frameTime = null;
      gpuBusy = null;
    }
  }
  const pmPresent = frameTime !== null && gpuBusy !== null;

  // Cap gate first: under a cap, CPU Busy ≈ frametime even when the CPU is loafing.
  if (
    cap.capped && cap.capValue !== null && m.fpsAvg !== null
    && Math.abs(m.fpsAvg - cap.capValue) <= CAP_FPS_TOLERANCE
    && (!pmPresent || (gpuBusy as number) < CAP_GPU_BUSY_FRAC * (frameTime as number))
  ) {
    basis.push(`FPS pinned at the ~${cap.capValue} cap`);
    return { limiter: 'capped', tier: pmPresent ? 'measured' : 'inferred', basis };
  }

  if (pmPresent) {
    const ft = frameTime as number;
    const busy = gpuBusy as number;
    const dev = (ft - busy) / ft;
    const devPct = Math.round(dev * 100);

    if (dev < T1_GPU_BOUND_DEV) {
      const farBelowLimit = m.gpuPowerW !== null && m.gpuPowerLimitW !== null
        && m.gpuPowerW < UNDERUTIL_POWER_FRAC * m.gpuPowerLimitW;
      const limitFlagFired = m.flagsFired.includes('flag.gpu.perfLimitPower')
        || m.flagsFired.includes('flag.gpu.perfLimitThermal');
      if (farBelowLimit && !limitFlagFired) {
        basis.push(`GPU Busy ≈ frame time (${devPct}% gap) but GPU drew ${Math.round(m.gpuPowerW!)} W of a ${Math.round(m.gpuPowerLimitW!)} W limit`);
        return { limiter: 'underutilized', tier: 'measured', basis };
      }
      basis.push(`GPU Busy ${busy.toFixed(1)} ms ≈ frame time ${ft.toFixed(1)} ms (${devPct}% gap)`);
      return { limiter: 'gpu', tier: 'measured', basis };
    }

    if (dev > T1_CPU_BOUND_DEV) {
      basis.push(`GPU sat idle ${devPct}% of each frame (GPU Busy ${busy.toFixed(1)} ms vs frame time ${ft.toFixed(1)} ms)`);
      if (m.cpuBusyMs !== null && Math.abs(m.cpuBusyMs - ft) / ft < T1_CPU_BUSY_NEAR) {
        basis.push(`CPU Busy ${m.cpuBusyMs.toFixed(1)} ms ≈ frame time`);
      }
      return { limiter: 'cpu', tier: 'measured', basis };
    }

    basis.push(`GPU Busy ${devPct}% under frame time — between the GPU- and CPU-bound thresholds`);
    return { limiter: 'ambiguous', tier: 'measured', basis };
  }

  if (m.gpuUsage !== null) {
    const usage = Math.round(m.gpuUsage);
    if (m.gpuUsage >= T2_GPU_PINNED_PCT) {
      basis.push(`GPU pinned at ${usage}% across the window`);
      return { limiter: 'gpu', tier: 'inferred', basis };
    }
    if (m.gpuUsage <= T2_GPU_LOW_PCT) {
      const corePinned = m.cpuMaxThread !== null && m.cpuMaxThread >= T2_CORE_PINNED_PCT;
      if (corePinned || m.flagsFired.includes('flag.gpu.perfLimitUtil')) {
        basis.push(corePinned
          ? `GPU at ${usage}% while a CPU thread ran at ${Math.round(m.cpuMaxThread!)}%`
          : `GPU at ${usage}% and reporting a utilization limit`);
        return { limiter: 'cpu', tier: 'inferred', basis };
      }
      basis.push(`GPU not saturated (${usage}%) but no CPU-side corroboration`);
      return { limiter: 'ambiguous', tier: 'inferred', basis };
    }
    basis.push(`GPU at ${usage}% — the 90–97% band is ambiguous at this polling rate`);
    return { limiter: 'ambiguous', tier: 'inferred', basis };
  }

  return { limiter: 'unknown', tier: null, basis };
}

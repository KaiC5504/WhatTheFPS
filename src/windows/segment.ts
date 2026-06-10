import type { WindowActivity, WindowMetrics } from '../types';

const GAMEPLAY_MIN_COVERAGE = 0.5;
const GAMEPLAY_MIN_FPS = 10;
const IDLE_GPU_PCT = 15;
const IDLE_CPU_PCT = 25;
// Without FPS there is no "gameplay" — sustained load marks the active workload instead.
const ACTIVE_GPU_PCT = 40;
const ACTIVE_CPU_PCT = 60;

function classifyOne(m: WindowMetrics, fpsAvailable: boolean): WindowActivity {
  if (fpsAvailable) {
    if (m.fpsCoverage >= GAMEPLAY_MIN_COVERAGE && (m.fpsAvg ?? 0) >= GAMEPLAY_MIN_FPS) return 'gameplay';
    if (m.fpsCoverage < GAMEPLAY_MIN_COVERAGE && (m.gpuUsage ?? 0) < IDLE_GPU_PCT && (m.cpuTotal ?? 0) < IDLE_CPU_PCT) return 'idle';
    return 'unknown';
  }
  if ((m.gpuUsage ?? 0) >= ACTIVE_GPU_PCT || (m.cpuTotal ?? 0) >= ACTIVE_CPU_PCT) return 'gameplay';
  return 'idle';
}

export function segmentActivity(metrics: WindowMetrics[], fpsAvailable: boolean): WindowActivity[] {
  const acts = metrics.map((m) => classifyOne(m, fpsAvailable));

  if (fpsAvailable) {
    // A no-FPS window touching gameplay is a loading screen / level transition, not idle desk time.
    for (let i = 0; i < acts.length; i++) {
      if (acts[i] !== 'unknown') continue;
      if (acts[i - 1] === 'gameplay' || acts[i + 1] === 'gameplay') acts[i] = 'loading';
    }
  }

  // One morphological pass: a lone dissenter between equal neighbors adopts their label.
  for (let i = 1; i < acts.length - 1; i++) {
    if (acts[i] !== acts[i - 1] && acts[i - 1] === acts[i + 1]) acts[i] = acts[i - 1];
  }
  return acts;
}

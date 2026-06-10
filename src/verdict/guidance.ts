import type { NormalizedLog, SensorGuidance } from '../types';

const SLOW_POLL_MS = 1000;

// What's missing from this log, and exactly how to get it next run. Order = impact.
export function buildGuidance(log: NormalizedLog): SensorGuidance[] {
  const out: SensorGuidance[] = [];

  if (!log.sensors['pm.gpuBusyMs'] || !log.sensors['pm.frameTimeMs']) {
    out.push({
      what: 'PresentMon frame data (GPU Busy / frame time)',
      how: 'Update HWiNFO to 7.63+ and keep its PresentMon sensors enabled — start HWiNFO before launching the game.',
    });
  }
  if (log.fps.source === 'none') {
    out.push({
      what: 'a logged framerate',
      how: 'Run RTSS (RivaTuner Statistics Server) while logging, or enable HWiNFO’s PresentMon framerate sensors.',
    });
  }
  if (log.pollMs > SLOW_POLL_MS) {
    out.push({
      what: `finer polling (this log is ~${Math.round(log.pollMs)} ms per sample)`,
      how: 'Set the HWiNFO logging interval to 500–1000 ms for diagnosis runs.',
    });
  }
  if (!log.cores || log.cores.usage.length === 0) {
    out.push({
      what: 'per-core CPU usage',
      how: 'Keep HWiNFO’s per-core usage sensors enabled so single-thread limits can be pinpointed.',
    });
  }
  return out;
}

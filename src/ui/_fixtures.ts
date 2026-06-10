import type { AnalysisResult, Verdict, WindowAnalysis } from '../types';
import { makeLog, makeWindow, makeWindowAnalysis } from '../causes/testkit';

export function fixtureWindows(): WindowAnalysis {
  return makeWindowAnalysis([
    makeWindow(0, { limiter: 'gpu', metrics: { fpsAvg: 100, frameTimeMs: 10, gpuBusyMs: 9.6, gpuUsage: 99 } }),
    makeWindow(1, { limiter: 'gpu', metrics: { fpsAvg: 98, frameTimeMs: 10.2, gpuBusyMs: 9.8, gpuUsage: 99 } }),
    makeWindow(2, { limiter: 'cpu', metrics: { fpsAvg: 45, frameTimeMs: 22, gpuBusyMs: 12, cpuMaxThread: 98, cpuTotal: 40 } }),
    makeWindow(3, { limiter: 'gpu', metrics: { fpsAvg: 97, frameTimeMs: 10.3, gpuBusyMs: 9.9, gpuUsage: 99 } }),
    makeWindow(4, { activity: 'idle' }),
  ]);
}

export function fixtureVerdict(over: Partial<Verdict> = {}): Verdict {
  const wa = fixtureWindows();
  return {
    health: 'warn',
    mascotMood: 'concerned',
    headline: 'GPU-bound for 75% of gameplay — your graphics card is the limit.',
    hero: [
      { key: 'fps', label: 'Avg FPS', value: '95', severity: 'info' },
      { key: 'cpu.usageTotal', label: 'CPU usage', value: '42%', severity: 'info' },
      { key: 'cpu.temp', label: 'CPU temp', value: '78°C', severity: 'info' },
      { key: 'gpu.usage', label: 'GPU usage', value: '97%', severity: 'info' },
      { key: 'gpu.temp', label: 'GPU temp', value: '74°C', severity: 'info' },
    ],
    findings: [{
      severity: 'warn',
      text: 'The CPU held the GPU back for 25% of gameplay.',
      fix: 'Lower CPU-heavy settings.',
      evidence: { tier: 'measured', basis: ['GPU sat idle 45% of each frame'] },
    }],
    timeSplit: wa.timeSplit,
    worst: wa.worst,
    primaryFix: { severity: 'warn', text: 'The CPU held the GPU back for 25% of gameplay.', fix: 'Lower CPU-heavy settings.' },
    coverage: { gameplayMs: wa.timeSplit.gameplayMs, totalMs: wa.timeSplit.totalMs },
    guidance: [],
    ...over,
  };
}

export function fixtureResult(over: Partial<AnalysisResult> = {}): AnalysisResult {
  const log = makeLog({
    sensors: { 'gpu.usage': [99, 99, 60, 99, 5], 'cpu.usageTotal': [40, 40, 80, 40, 5] },
    fps: { source: 'displayed', sourceLabel: 'Framerate Displayed (avg)', series: [100, 98, 45, 97, null] },
  });
  const windows = fixtureWindows();
  return {
    log,
    stats: {},
    events: [],
    verdict: fixtureVerdict(),
    digest: { compact: 'compact digest', full: 'full digest', tokenEstimate: { compact: 10, full: 20 }, fpsSourceLabel: 'Framerate Displayed (avg)' },
    windows,
    ...over,
  };
}

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { analyze } from '../engine/analyze';
import { saveRun, loadRuns, renameRun, deleteRun, clearRuns } from './runsStore';

const tinyCsv = [
  'Date,Time,"Total CPU Usage [%]","CPU Package [°C]","GPU Temperature [°C]","GPU Core Load [%]","Framerate Displayed (avg) [FPS]",',
  '9.6.2026,12:00:00.000,45.0,70.0,75.0,99.0,120.0,',
  '9.6.2026,12:00:02.000,55.0,72.0,77.0,98.0,118.0,',
].join('\n');
const result = analyze(new TextEncoder().encode(tinyCsv));

beforeEach(() => localStorage.clear());
afterEach(() => vi.restoreAllMocks());

describe('runsStore', () => {
  it('saveRun returns a SavedRun with a slim result and persists it', () => {
    const run = saveRun(result, 'undervolt test');
    expect(run).not.toBeNull();
    expect(run!.name).toBe('undervolt test');
    expect(run!.result.slim).toBe(true);
    expect(run!.result.log.fps.series).toEqual([]);
    const loaded = loadRuns();
    expect(loaded).toHaveLength(1);
    expect(loaded[0]).toEqual(run);
  });

  it('auto-names from gpuModelGuess ?? "Run" plus HH:MM', () => {
    // tinyCsv has no HWiNFO trailer, so gpuModelGuess is null → 'Run'
    const run = saveRun(result)!;
    expect(run.name).toMatch(/^Run — \d{2}:\d{2}$/);
  });

  it('renameRun, deleteRun and clearRuns round-trip through storage', () => {
    const a = saveRun(result, 'a')!;
    const b = saveRun(result, 'b')!;
    renameRun(a.id, 'renamed');
    expect(loadRuns().find((r) => r.id === a.id)?.name).toBe('renamed');
    deleteRun(b.id);
    expect(loadRuns().map((r) => r.id)).toEqual([a.id]);
    clearRuns();
    expect(loadRuns()).toEqual([]);
  });

  it('renaming an unknown id is a harmless no-op', () => {
    saveRun(result, 'only');
    renameRun('nope', 'x');
    expect(loadRuns()[0].name).toBe('only');
  });

  it('keeps the 20 most recent: the 21st save evicts the oldest', () => {
    for (let i = 0; i < 21; i++) saveRun(result, `run-${i}`);
    const runs = loadRuns();
    expect(runs).toHaveLength(20);
    expect(runs[0].name).toBe('run-1');           // run-0 fell off the front
    expect(runs[19].name).toBe('run-20');
  });

  it('tolerates malformed storage: bad JSON, non-array, invalid entries', () => {
    localStorage.setItem('wtfps.runs.v1', '{not json');
    expect(loadRuns()).toEqual([]);
    localStorage.setItem('wtfps.runs.v1', JSON.stringify({ nope: 1 }));
    expect(loadRuns()).toEqual([]);
    localStorage.setItem('wtfps.runs.v1', JSON.stringify([{ id: 'x' }]));
    expect(loadRuns()).toEqual([]);
  });

  it('swallows quota errors: saveRun returns null instead of throwing', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });
    expect(saveRun(result)).toBeNull();
  });
});

import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useRuns } from './useRuns';
import { saveRun } from '../storage/runsStore';
import { analyze } from '../engine/analyze';

const tinyCsv = [
  'Date,Time,"Total CPU Usage [%]","CPU Package [°C]","GPU Temperature [°C]","GPU Core Load [%]","Framerate Displayed (avg) [FPS]",',
  '9.6.2026,12:00:00.000,45.0,70.0,75.0,99.0,120.0,',
  '9.6.2026,12:00:02.000,55.0,72.0,77.0,98.0,118.0,',
].join('\n');
const result = analyze(new TextEncoder().encode(tinyCsv));

beforeEach(() => localStorage.clear());

describe('useRuns', () => {
  it('initializes from storage', () => {
    saveRun(result, 'pre-existing');
    const { result: hook } = renderHook(() => useRuns());
    expect(hook.current.runs.map((r) => r.name)).toEqual(['pre-existing']);
  });

  it('save / rename / remove / clear keep state and storage in sync', () => {
    const { result: hook } = renderHook(() => useRuns());
    let savedId = '';
    act(() => { savedId = hook.current.save(result)!.id; });
    expect(hook.current.runs).toHaveLength(1);
    act(() => hook.current.rename(savedId, 'renamed'));
    expect(hook.current.runs[0].name).toBe('renamed');
    act(() => hook.current.remove(savedId));
    expect(hook.current.runs).toEqual([]);
    act(() => { hook.current.save(result); hook.current.clear(); });
    expect(hook.current.runs).toEqual([]);
    expect(localStorage.getItem('wtfps.runs.v1')).toBeNull();
  });
});

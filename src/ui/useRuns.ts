import { useCallback, useState } from 'react';
import type { AnalysisResult, SavedRun } from '../types';
import { clearRuns, deleteRun, loadRuns, renameRun, saveRun } from '../storage/runsStore';

export interface UseRunsReturn {
  runs: SavedRun[];
  save: (result: AnalysisResult) => SavedRun | null;
  rename: (id: string, name: string) => void;
  remove: (id: string) => void;
  clear: () => void;
}

// Thin state wrapper over runsStore: every mutation re-reads storage so the list
// always reflects what actually persisted (a quota-failed save changes nothing).
export function useRuns(): UseRunsReturn {
  const [runs, setRuns] = useState<SavedRun[]>(() => loadRuns());

  const save = useCallback((result: AnalysisResult) => {
    const run = saveRun(result);
    setRuns(loadRuns());
    return run;
  }, []);
  const rename = useCallback((id: string, name: string) => {
    renameRun(id, name);
    setRuns(loadRuns());
  }, []);
  const remove = useCallback((id: string) => {
    deleteRun(id);
    setRuns(loadRuns());
  }, []);
  const clear = useCallback(() => {
    clearRuns();
    setRuns([]);
  }, []);

  return { runs, save, rename, remove, clear };
}

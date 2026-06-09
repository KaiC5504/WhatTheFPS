import { useState, useRef, useCallback } from 'react';
import type { AnalysisResult } from '../types';

export type AnalysisStatus = 'idle' | 'parsing' | 'ready' | 'error';

interface UseAnalysisOptions {
  createWorker?: () => Worker;
}

interface UseAnalysisReturn {
  status: AnalysisStatus;
  result: AnalysisResult | null;
  error: string | null;
  analyzeFile: (file: File) => void;
  reset: () => void;
}

function defaultCreateWorker(): Worker {
  return new Worker(new URL('../worker/analyze.worker.ts', import.meta.url), { type: 'module' });
}

export function useAnalysis(opts?: UseAnalysisOptions): UseAnalysisReturn {
  const [status, setStatus] = useState<AnalysisStatus>('idle');
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const workerRef = useRef<Worker | null>(null);
  const createWorker = opts?.createWorker ?? defaultCreateWorker;

  const getWorker = useCallback((): Worker => {
    if (!workerRef.current) {
      const w = createWorker();
      w.onmessage = (e: MessageEvent<{ ok: true; result: AnalysisResult } | { ok: false; error: string }>) => {
        if (e.data.ok) {
          setStatus('ready');
          setResult(e.data.result);
        } else {
          setStatus('error');
          setError(e.data.error);
        }
      };
      w.onerror = (e: ErrorEvent) => {
        setStatus('error');
        setError(e.message);
      };
      workerRef.current = w;
    }
    return workerRef.current;
  }, [createWorker]);

  const analyzeFile = useCallback(async (file: File) => {
    setStatus('parsing');
    setResult(null);
    setError(null);

    const worker = getWorker();
    const bytes = await file.arrayBuffer();
    worker.postMessage({ bytes }, [bytes]);
  }, [getWorker]);

  const reset = useCallback(() => {
    setStatus('idle');
    setResult(null);
    setError(null);
  }, []);

  return { status, result, error, analyzeFile, reset };
}

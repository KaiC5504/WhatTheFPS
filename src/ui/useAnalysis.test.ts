import { renderHook, act, waitFor } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useAnalysis } from './useAnalysis';
import type { AnalysisResult } from '../types';

// Minimal fake AnalysisResult for testing the hook state machine.
const fakeResult = { log: {}, stats: {}, events: [], verdict: {}, digest: {} } as unknown as AnalysisResult;

// jsdom's File doesn't implement arrayBuffer(); add it so the hook can proceed.
function makeFile(name: string): File {
  const f = new File(['x'], name);
  if (!f.arrayBuffer) {
    Object.defineProperty(f, 'arrayBuffer', {
      value: () => Promise.resolve(new ArrayBuffer(1)),
    });
  }
  return f;
}

function makeFakeWorker() {
  const worker = {
    postMessage: vi.fn(),
    terminate: vi.fn(),
    onmessage: null as ((e: MessageEvent) => void) | null,
    onerror: null as ((e: ErrorEvent) => void) | null,
  };
  return worker;
}

describe('useAnalysis', () => {
  let fakeWorker: ReturnType<typeof makeFakeWorker>;

  beforeEach(() => {
    fakeWorker = makeFakeWorker();
  });

  it('starts in idle state', () => {
    const { result } = renderHook(() =>
      useAnalysis({ createWorker: () => fakeWorker as unknown as Worker })
    );
    expect(result.current.status).toBe('idle');
    expect(result.current.result).toBeNull();
    expect(result.current.error).toBeNull();
  });

  it('transitions to parsing then ready on success', async () => {
    const { result } = renderHook(() =>
      useAnalysis({ createWorker: () => fakeWorker as unknown as Worker })
    );

    act(() => {
      result.current.analyzeFile(makeFile('hwinfo.CSV'));
    });

    await waitFor(() => expect(result.current.status).toBe('parsing'));

    act(() => {
      fakeWorker.onmessage?.({ data: { ok: true, result: fakeResult } } as MessageEvent);
    });

    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.result).toBe(fakeResult);
    expect(result.current.error).toBeNull();
  });

  it('transitions to error when worker reports failure', async () => {
    const { result } = renderHook(() =>
      useAnalysis({ createWorker: () => fakeWorker as unknown as Worker })
    );

    act(() => {
      result.current.analyzeFile(makeFile('log.CSV'));
    });

    await waitFor(() => expect(result.current.status).toBe('parsing'));

    act(() => {
      fakeWorker.onmessage?.({ data: { ok: false, error: 'boom' } } as MessageEvent);
    });

    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current.error).toBe('boom');
    expect(result.current.result).toBeNull();
  });

  it('transitions to error on worker onerror', async () => {
    const { result } = renderHook(() =>
      useAnalysis({ createWorker: () => fakeWorker as unknown as Worker })
    );

    act(() => {
      result.current.analyzeFile(makeFile('log.CSV'));
    });

    await waitFor(() => expect(result.current.status).toBe('parsing'));

    act(() => {
      fakeWorker.onerror?.({ message: 'worker crashed' } as ErrorEvent);
    });

    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current.error).toBe('worker crashed');
  });

  it('reset returns to idle and clears result/error', async () => {
    const { result } = renderHook(() =>
      useAnalysis({ createWorker: () => fakeWorker as unknown as Worker })
    );

    act(() => {
      result.current.analyzeFile(makeFile('log.CSV'));
    });
    await waitFor(() => expect(result.current.status).toBe('parsing'));

    act(() => {
      fakeWorker.onmessage?.({ data: { ok: true, result: fakeResult } } as MessageEvent);
    });
    await waitFor(() => expect(result.current.status).toBe('ready'));

    act(() => {
      result.current.reset();
    });

    expect(result.current.status).toBe('idle');
    expect(result.current.result).toBeNull();
    expect(result.current.error).toBeNull();
  });
});

import type { AnalysisResult, SavedRun } from '../types';
import { slimResult } from '../compare/slim';

const KEY = 'wtfps.runs.v1';
const MAX_RUNS = 20;

function isSavedRun(r: unknown): r is SavedRun {
  if (typeof r !== 'object' || r === null) return false;
  const run = r as SavedRun;
  return typeof run.id === 'string'
    && typeof run.name === 'string'
    && typeof run.createdAt === 'number'
    && run.result?.slim === true;
}

function readAll(): SavedRun[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw === null) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(isSavedRun) : [];
  } catch {
    return [];
  }
}

function writeAll(runs: SavedRun[]): boolean {
  try {
    localStorage.setItem(KEY, JSON.stringify(runs));
    return true;
  } catch {
    return false;   // quota exceeded or private browsing — the change just isn't persisted
  }
}

function makeId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function autoName(result: AnalysisResult, when: Date): string {
  const hh = String(when.getHours()).padStart(2, '0');
  const mm = String(when.getMinutes()).padStart(2, '0');
  return `${result.log.specs.gpuModelGuess ?? 'Run'} — ${hh}:${mm}`;
}

export function loadRuns(): SavedRun[] {
  return readAll();
}

export function saveRun(result: AnalysisResult, name?: string): SavedRun | null {
  const createdAt = Date.now();
  const run: SavedRun = {
    id: makeId(),
    name: name ?? autoName(result, new Date(createdAt)),
    createdAt,
    result: slimResult(result),
  };
  const runs = [...readAll(), run].slice(-MAX_RUNS);   // FIFO: oldest fall off the front
  return writeAll(runs) ? run : null;
}

export function renameRun(id: string, name: string): void {
  writeAll(readAll().map((r) => (r.id === id ? { ...r, name } : r)));
}

export function deleteRun(id: string): void {
  writeAll(readAll().filter((r) => r.id !== id));
}

export function clearRuns(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // nothing to clear
  }
}

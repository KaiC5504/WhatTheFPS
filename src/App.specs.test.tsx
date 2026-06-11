// @vitest-environment jsdom
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { analyze } from './engine/analyze';
import type { AnalysisResult } from './types';

const bytes = new Uint8Array(
  readFileSync(join(process.cwd(), 'HWINFO samples', 'Intel + Nvidia', 'StrixG16_NTE.CSV')),
);
const result: AnalysisResult = analyze(bytes);

const mockState: { status: string; result: AnalysisResult | null } = {
  status: 'ready',
  result,
};

vi.mock('./ui/useAnalysis', () => ({
  useAnalysis: () => ({
    status: mockState.status,
    result: mockState.result,
    error: null,
    analyzeFile: vi.fn(),
    reset: vi.fn(),
  }),
}));

import { App } from './App';

const REPORT_TXT = 'CPU Brand Name: ZZZ TEST CPU\nVideo Chipset: ZZZ TEST GPU\n';

function seedStaleSpecs() {
  // A blob written by an older build: correct CPU+GPU (so it's restored as the same
  // machine), but missing the iGPU / DIMM-count fields this build now detects.
  localStorage.setItem(
    'wtfps.specs.v1',
    JSON.stringify({
      systemModel: null,
      cpuVendor: 'intel',
      cpuModelGuess: result.log.specs.cpuModelGuess,
      gpuVendor: 'nvidia',
      gpuModelGuess: result.log.specs.gpuModelGuess,
      igpuModelGuess: null,
      igpuPresent: false,
      isLaptop: true,
      ramMb: 32768,
      ramModelGuess: null,
      ramModules: null,
    }),
  );
}

describe('App: specs detection and report import', () => {
  afterEach(cleanup);
  beforeEach(() => localStorage.clear());

  it('shows iGPU + RAM sticks inferred from the Strix log', () => {
    render(<App />);
    expect((screen.getByLabelText('Integrated GPU model') as HTMLInputElement).value).toBe(
      'Intel UHD Graphics',
    );
    expect((screen.getByLabelText('RAM modules') as HTMLInputElement).value).toBe('2');
  });

  it('importing a report through the main-page card populates the CPU field', async () => {
    const { container } = render(<App />);
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, {
      target: { files: [new File([REPORT_TXT], 'report.txt', { type: 'text/plain' })] },
    });
    await waitFor(() =>
      expect((screen.getByLabelText('CPU model') as HTMLInputElement).value).toBe('ZZZ TEST CPU'),
    );
  });

  // Regression for the "iGPU + RAM sticks not detected" bug: a stale saved blob from an
  // older schema must not shadow freshly-detected hardware fields.
  it('stale saved specs no longer shadow freshly-detected iGPU / RAM sticks', () => {
    seedStaleSpecs();
    render(<App />);
    expect((screen.getByLabelText('Integrated GPU model') as HTMLInputElement).value).toBe(
      'Intel UHD Graphics',
    );
    expect((screen.getByLabelText('RAM modules') as HTMLInputElement).value).toBe('2');
  });

  it('main-page import still works with stale saved specs present', async () => {
    seedStaleSpecs();
    const { container } = render(<App />);
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, {
      target: { files: [new File([REPORT_TXT], 'report.txt', { type: 'text/plain' })] },
    });
    await waitFor(() =>
      expect((screen.getByLabelText('CPU model') as HTMLInputElement).value).toBe('ZZZ TEST CPU'),
    );
  });
});

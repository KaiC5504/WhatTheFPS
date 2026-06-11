import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SpecsCard } from './SpecsCard';
import { loadSpecs } from '../storage/specsStore';
import type { InferredSpecs } from '../types';

const sampleSpecs: InferredSpecs = {
  systemModel: 'ASUS ROG Strix G614JI',
  cpuVendor: 'intel',
  cpuModelGuess: 'Intel Core i9-13900K',
  gpuVendor: 'nvidia',
  gpuModelGuess: 'NVIDIA RTX 4090',
  igpuModelGuess: 'Intel UHD Graphics',
  igpuPresent: true,
  isLaptop: false,
  ramMb: 32768,
  ramModelGuess: 'Kingston KF556S40-16',
  ramModules: 2,
};

describe('SpecsCard', () => {
  afterEach(cleanup);

  beforeEach(() => {
    localStorage.clear();
  });

  it('prefills inputs from the inferred specs', () => {
    render(<SpecsCard specs={sampleSpecs} onChange={vi.fn()} />);
    expect((screen.getByLabelText('CPU model') as HTMLInputElement).value).toBe('Intel Core i9-13900K');
    expect((screen.getByLabelText('GPU model') as HTMLInputElement).value).toBe('NVIDIA RTX 4090');
    expect((screen.getByLabelText('RAM in GB') as HTMLInputElement).value).toBe('32');
  });

  it('shows the richer detected fields: system, iGPU, RAM kit + module count', () => {
    render(<SpecsCard specs={sampleSpecs} onChange={vi.fn()} />);
    expect((screen.getByLabelText('System model') as HTMLInputElement).value).toBe('ASUS ROG Strix G614JI');
    expect((screen.getByLabelText('Integrated GPU model') as HTMLInputElement).value).toBe('Intel UHD Graphics');
    expect((screen.getByLabelText('RAM kit') as HTMLInputElement).value).toBe('Kingston KF556S40-16');
    expect((screen.getByLabelText('RAM modules') as HTMLInputElement).value).toBe('2');
  });

  it('hides the iGPU field when no integrated GPU is present', () => {
    render(<SpecsCard specs={{ ...sampleSpecs, igpuPresent: false }} onChange={vi.fn()} />);
    expect(screen.queryByLabelText('Integrated GPU model')).toBeNull();
  });

  it('calls onChange with updated cpuModelGuess when CPU field changes', () => {
    const onChange = vi.fn();
    render(<SpecsCard specs={sampleSpecs} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText('CPU model'), { target: { value: 'AMD Ryzen 9 7950X' } });
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ cpuModelGuess: 'AMD Ryzen 9 7950X' }));
  });

  it('persists to localStorage when a field changes', () => {
    render(<SpecsCard specs={sampleSpecs} onChange={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('CPU model'), { target: { value: 'AMD Ryzen 9 7950X' } });
    expect(loadSpecs()?.cpuModelGuess).toBe('AMD Ryzen 9 7950X');
  });

  it('renders the card header', () => {
    render(<SpecsCard specs={sampleSpecs} onChange={vi.fn()} />);
    expect(screen.getByRole('heading', { name: /system \(inferred/i })).toBeInTheDocument();
  });

  it('converts RAM from Mb to GB in display and back on change', () => {
    const onChange = vi.fn();
    render(<SpecsCard specs={sampleSpecs} onChange={onChange} />);
    const ramInput = screen.getByLabelText('RAM in GB');
    expect((ramInput as HTMLInputElement).value).toBe('32');
    fireEvent.change(ramInput, { target: { value: '64' } });
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ ramMb: 65536 }));
  });

  it('sets ramMb to null when RAM field is cleared', () => {
    const onChange = vi.fn();
    render(<SpecsCard specs={sampleSpecs} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText('RAM in GB'), { target: { value: '' } });
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ ramMb: null }));
  });
});

const REPORT_TXT = [
  'Computer Brand Name: Custom Desktop',
  'CPU Brand Name: AMD Ryzen 7 7800X3D 8-Core Processor',
  'Video Chipset: AMD Radeon RX 7800 XT',
  'Total Memory Size: 64 GBytes',
].join('\n');

function dropOnReportZone(content: string, name = 'report.txt') {
  const zone = screen.getByRole('group', { name: /hwinfo report/i });
  fireEvent.drop(zone, { dataTransfer: { files: [new File([content], name, { type: 'text/plain' })] } });
}

describe('SpecsCard report import', () => {
  afterEach(cleanup);
  beforeEach(() => localStorage.clear());

  it('dropping a HWiNFO report merges the exact names and persists them', async () => {
    const onChange = vi.fn();
    render(<SpecsCard specs={sampleSpecs} onChange={onChange} />);
    dropOnReportZone(REPORT_TXT);
    await waitFor(() => expect(onChange).toHaveBeenCalledWith(expect.objectContaining({
      cpuModelGuess: 'AMD Ryzen 7 7800X3D 8-Core Processor',
      gpuModelGuess: 'AMD Radeon RX 7800 XT',
      ramMb: 64 * 1024,
    })));
    expect(loadSpecs()?.cpuModelGuess).toBe('AMD Ryzen 7 7800X3D 8-Core Processor');
  });

  it('only patches what the report states — other fields survive', async () => {
    const onChange = vi.fn();
    render(<SpecsCard specs={sampleSpecs} onChange={onChange} />);
    dropOnReportZone('CPU Brand Name: AMD Ryzen 7 7800X3D 8-Core Processor\n');
    await waitFor(() => expect(onChange).toHaveBeenCalled());
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({
      cpuModelGuess: 'AMD Ryzen 7 7800X3D 8-Core Processor',
      gpuModelGuess: sampleSpecs.gpuModelGuess,
      ramModules: sampleSpecs.ramModules,
    }));
  });

  it('manual edits after a report import still win', async () => {
    const onChange = vi.fn();
    render(<SpecsCard specs={sampleSpecs} onChange={onChange} />);
    dropOnReportZone(REPORT_TXT);
    await waitFor(() => expect(onChange).toHaveBeenCalled());
    fireEvent.change(screen.getByLabelText('CPU model'), { target: { value: 'My Custom CPU' } });
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ cpuModelGuess: 'My Custom CPU' }));
  });

  it('a file that is not a report shows an inline note and changes nothing', async () => {
    const onChange = vi.fn();
    render(<SpecsCard specs={sampleSpecs} onChange={onChange} />);
    dropOnReportZone('definitely not a hwinfo report');
    expect(await screen.findByRole('alert')).toHaveTextContent(/couldn't read/i);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('a successful import clears a previous error note', async () => {
    render(<SpecsCard specs={sampleSpecs} onChange={vi.fn()} />);
    dropOnReportZone('garbage');
    await screen.findByRole('alert');
    dropOnReportZone(REPORT_TXT);
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
  });
});

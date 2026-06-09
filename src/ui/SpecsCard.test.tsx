import { render, screen, cleanup, fireEvent } from '@testing-library/react';
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

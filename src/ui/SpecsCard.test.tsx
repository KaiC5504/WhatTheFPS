import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SpecsCard } from './SpecsCard';
import { loadSpecs } from '../storage/specsStore';
import type { InferredSpecs } from '../types';

const sampleSpecs: InferredSpecs = {
  cpuVendor: 'intel',
  cpuModelGuess: 'Intel Core i9-13900K',
  gpuVendor: 'nvidia',
  gpuModelGuess: 'NVIDIA RTX 4090',
  igpuPresent: false,
  isLaptop: false,
  ramMb: 32768,
};

describe('SpecsCard', () => {
  afterEach(cleanup);

  beforeEach(() => {
    localStorage.clear();
  });

  it('prefills inputs from the inferred specs', () => {
    render(<SpecsCard specs={sampleSpecs} onChange={vi.fn()} />);
    expect((screen.getByLabelText(/cpu/i) as HTMLInputElement).value).toBe('Intel Core i9-13900K');
    expect((screen.getByLabelText(/gpu/i) as HTMLInputElement).value).toBe('NVIDIA RTX 4090');
    expect((screen.getByLabelText(/ram/i) as HTMLInputElement).value).toBe('32');
  });

  it('calls onChange with updated cpuModelGuess when CPU field changes', () => {
    const onChange = vi.fn();
    render(<SpecsCard specs={sampleSpecs} onChange={onChange} />);
    const cpuInput = screen.getByLabelText(/cpu/i);
    fireEvent.change(cpuInput, { target: { value: 'AMD Ryzen 9 7950X' } });
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ cpuModelGuess: 'AMD Ryzen 9 7950X' })
    );
  });

  it('persists to localStorage when a field changes', () => {
    const onChange = vi.fn();
    render(<SpecsCard specs={sampleSpecs} onChange={onChange} />);
    const cpuInput = screen.getByLabelText(/cpu/i);
    fireEvent.change(cpuInput, { target: { value: 'AMD Ryzen 9 7950X' } });
    const stored = loadSpecs();
    expect(stored?.cpuModelGuess).toBe('AMD Ryzen 9 7950X');
  });

  it('renders the card header', () => {
    render(<SpecsCard specs={sampleSpecs} onChange={vi.fn()} />);
    expect(screen.getByText(/system/i)).toBeInTheDocument();
  });

  it('converts RAM from Mb to GB in display and back on change', () => {
    const onChange = vi.fn();
    render(<SpecsCard specs={sampleSpecs} onChange={onChange} />);
    const ramInput = screen.getByLabelText(/ram/i);
    // 32768 Mb -> 32 GB displayed
    expect((ramInput as HTMLInputElement).value).toBe('32');
    // Change to 64 GB -> 65536 Mb
    fireEvent.change(ramInput, { target: { value: '64' } });
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ ramMb: 65536 })
    );
  });

  it('sets ramMb to null when RAM field is cleared', () => {
    const onChange = vi.fn();
    render(<SpecsCard specs={sampleSpecs} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText(/ram/i), { target: { value: '' } });
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ ramMb: null })
    );
  });
});

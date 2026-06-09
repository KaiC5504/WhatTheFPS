import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { DropZone } from './DropZone';

describe('DropZone', () => {
  afterEach(cleanup);

  it('calls onFile with a valid .CSV file on input change', async () => {
    const onFile = vi.fn();
    const { container } = render(<DropZone onFile={onFile} />);
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;

    const file = new File(['sensor,value\n'], 'log.CSV', { type: 'text/csv' });
    fireEvent.change(input, { target: { files: [file] } });

    expect(onFile).toHaveBeenCalledWith(file);
  });

  it('does not call onFile and shows error for a non-.csv file', () => {
    const onFile = vi.fn();
    const { container } = render(<DropZone onFile={onFile} />);
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;

    const file = new File(['data'], 'report.txt', { type: 'text/plain' });
    fireEvent.change(input, { target: { files: [file] } });

    expect(onFile).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  it('accepts lowercase .csv extension', async () => {
    const onFile = vi.fn();
    const { container } = render(<DropZone onFile={onFile} />);
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;

    const file = new File(['data'], 'hwinfo.csv', { type: 'text/csv' });
    fireEvent.change(input, { target: { files: [file] } });

    expect(onFile).toHaveBeenCalledWith(file);
  });

  it('is disabled when disabled=true', () => {
    const onFile = vi.fn();
    const { container } = render(<DropZone onFile={onFile} disabled />);
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    expect(input).toBeDisabled();
  });

  it('shows a drag-over highlight class on dragenter', () => {
    const { container } = render(<DropZone onFile={vi.fn()} />);
    const dropTarget = container.firstChild as HTMLElement;
    fireEvent.dragOver(dropTarget, { preventDefault: () => {} });
    expect(dropTarget.classList.contains('dropzone--over')).toBe(true);
  });

  it('removes the drag-over highlight class on dragleave', () => {
    const { container } = render(<DropZone onFile={vi.fn()} />);
    const dropTarget = container.firstChild as HTMLElement;
    fireEvent.dragOver(dropTarget);
    fireEvent.dragLeave(dropTarget);
    expect(dropTarget.classList.contains('dropzone--over')).toBe(false);
  });
});

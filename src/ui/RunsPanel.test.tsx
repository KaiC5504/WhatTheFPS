import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { RunsPanel } from './RunsPanel';
import { makeSlim, makeSavedRun } from '../compare/testkit';

// createdAt descending so the displayed (newest-first) order matches the array order
const r1 = makeSavedRun(makeSlim(), { id: 'r1', name: 'Run one', createdAt: 3000 });
const r2 = makeSavedRun(makeSlim(), { id: 'r2', name: 'Run two', createdAt: 2000 });
const r3 = makeSavedRun(makeSlim(), { id: 'r3', name: 'Run three', createdAt: 1000 });

function setup(runs = [r1, r2, r3]) {
  const handlers = {
    onClose: vi.fn(), onOpenRun: vi.fn(), onCompare: vi.fn(),
    onRename: vi.fn(), onDelete: vi.fn(), onClearAll: vi.fn(),
  };
  render(<RunsPanel runs={runs} {...handlers} />);
  return handlers;
}

describe('RunsPanel', () => {
  it('Compare is enabled only with exactly two selected; a third checkbox is blocked', () => {
    setup();
    const compare = screen.getByRole('button', { name: 'Compare' });
    const boxes = screen.getAllByRole('checkbox');
    expect(compare).toBeDisabled();
    fireEvent.click(boxes[0]);
    expect(compare).toBeDisabled();
    fireEvent.click(boxes[1]);
    expect(compare).toBeEnabled();
    expect(boxes[2]).toBeDisabled();   // only two can be picked
    fireEvent.click(boxes[0]);         // unselect → third frees up
    expect(boxes[2]).toBeEnabled();
  });

  it('Compare passes the runs in chronological order (older = before)', () => {
    const h = setup();
    // select Run one (newest, createdAt 3000) and Run three (oldest, 1000)
    fireEvent.click(screen.getByRole('checkbox', { name: /select run one/i }));
    fireEvent.click(screen.getByRole('checkbox', { name: /select run three/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Compare' }));
    expect(h.onCompare).toHaveBeenCalledWith(r3, r1);
  });

  it('clicking a run name reopens it', () => {
    const h = setup();
    fireEvent.click(screen.getByRole('button', { name: /run two/i }));
    expect(h.onOpenRun).toHaveBeenCalledWith(r2);
  });

  it('rename: edit inline and commit with Enter', () => {
    const h = setup();
    fireEvent.click(screen.getAllByRole('button', { name: 'Rename' })[0]);   // first row = r1
    const input = screen.getByRole('textbox', { name: /run name/i });
    fireEvent.change(input, { target: { value: 'Undervolt -75' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(h.onRename).toHaveBeenCalledWith('r1', 'Undervolt -75');
  });

  it('the edited row’s Rename button is disabled so re-clicking can’t discard the draft', () => {
    setup();
    const renames = screen.getAllByRole('button', { name: 'Rename' });
    fireEvent.click(renames[0]);   // first row = r1, now in edit mode
    // the input occupies r1's name slot; r1's Rename stays in the DOM but disabled
    const r1Rename = screen.getAllByRole('button', { name: 'Rename' })[0];
    expect(r1Rename).toBeDisabled();
  });

  it('delete and clear-all fire their callbacks', () => {
    const h = setup();
    fireEvent.click(screen.getAllByRole('button', { name: 'Delete' })[1]);   // second row = r2
    expect(h.onDelete).toHaveBeenCalledWith('r2');
    fireEvent.click(screen.getByRole('button', { name: /clear all/i }));
    expect(h.onClearAll).toHaveBeenCalled();
  });

  it('empty state explains manual save and disables Clear all', () => {
    setup([]);
    expect(screen.getByText(/hit save run to keep it here/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /clear all/i })).toBeDisabled();
  });
});

import { render, cleanup, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { TopBar } from './TopBar';

describe('TopBar', () => {
  afterEach(cleanup);

  it('renders the brand wordmark with WT, F, and PS', () => {
    const { container } = render(<TopBar mode="easy" onModeChange={vi.fn()} />);
    // The wordmark span contains text nodes "WT" and "PS" around the <span>F</span>
    const wordmark = container.querySelector('.wordmark') as HTMLElement;
    expect(wordmark).toBeInTheDocument();
    expect(wordmark.textContent).toContain('WT');
    expect(wordmark.textContent).toContain('F');
    expect(wordmark.textContent).toContain('PS');
    // The F is in its own span
    expect(container.querySelector('.wordmark__f')?.textContent).toBe('F');
  });

  it('marks the active mode button with aria-pressed="true"', () => {
    const { container } = render(<TopBar mode="easy" onModeChange={vi.fn()} />);
    const scope = within(container as HTMLElement);
    const easyBtn = scope.getByRole('tab', { name: /easy/i });
    const nerdBtn = scope.getByRole('tab', { name: /nerd/i });
    expect(easyBtn).toHaveAttribute('aria-pressed', 'true');
    expect(nerdBtn).toHaveAttribute('aria-pressed', 'false');
  });

  it('reflects nerd mode as active when mode="nerd"', () => {
    const { container } = render(<TopBar mode="nerd" onModeChange={vi.fn()} />);
    const scope = within(container as HTMLElement);
    expect(scope.getByRole('tab', { name: /nerd/i })).toHaveAttribute('aria-pressed', 'true');
    expect(scope.getByRole('tab', { name: /easy/i })).toHaveAttribute('aria-pressed', 'false');
  });

  it('calls onModeChange with the other mode when inactive button is clicked', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const { container } = render(<TopBar mode="easy" onModeChange={onChange} />);
    const scope = within(container as HTMLElement);
    await user.click(scope.getByRole('tab', { name: /nerd/i }));
    expect(onChange).toHaveBeenCalledWith('nerd');
  });

  it('does not call onModeChange when the already-active button is clicked', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const { container } = render(<TopBar mode="easy" onModeChange={onChange} />);
    const scope = within(container as HTMLElement);
    await user.click(scope.getByRole('tab', { name: /easy/i }));
    expect(onChange).not.toHaveBeenCalled();
  });

  it('shows a specs settings button only when onOpenSettings is provided, and fires it', async () => {
    const user = userEvent.setup();
    const { container, rerender } = render(<TopBar mode="easy" onModeChange={vi.fn()} />);
    expect(within(container as HTMLElement).queryByRole('button', { name: /specs/i })).toBeNull();

    const onOpen = vi.fn();
    rerender(<TopBar mode="easy" onModeChange={vi.fn()} onOpenSettings={onOpen} />);
    await user.click(within(container as HTMLElement).getByRole('button', { name: /specs/i }));
    expect(onOpen).toHaveBeenCalledOnce();
  });
});

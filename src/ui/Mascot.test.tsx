import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Mascot } from './Mascot';

describe('Mascot', () => {
  it('exposes its mood on the root and is an accessible image', () => {
    render(<Mascot mood="chill" />);
    expect(screen.getByRole('img')).toHaveAttribute('data-mood', 'chill');
  });

  it('shows the overheating flame only when panicking', () => {
    const { rerender, container } = render(<Mascot mood="concerned" />);
    expect(container.querySelector('[data-part="flame"]')).toBeNull();
    rerender(<Mascot mood="panic" />);
    expect(container.querySelector('[data-part="flame"]')).not.toBeNull();
  });

  it('tints by mood — panic uses the bad token', () => {
    const { container } = render(<Mascot mood="panic" />);
    expect(container.innerHTML).toContain('var(--bad)');
  });

  it('renders the waveform mouth with the frame-drop dot in every mood', () => {
    (['chill', 'concerned', 'panic'] as const).forEach((mood) => {
      const { container, unmount } = render(<Mascot mood={mood} />);
      const wave = container.querySelector('[data-part="waveform"]');
      expect(wave, `waveform missing for ${mood}`).not.toBeNull();
      expect(wave?.querySelector('polyline')).not.toBeNull();
      expect(wave?.querySelector('circle[fill="#ff7a18"]')).not.toBeNull();
      unmount();
    });
  });
});

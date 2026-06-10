import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { EvidenceBadge } from './EvidenceBadge';

describe('EvidenceBadge', () => {
  it('renders the tier with the basis as tooltip', () => {
    render(<EvidenceBadge evidence={{ tier: 'measured', basis: ['GPU Busy ≈ frame time'] }} />);
    const badge = screen.getByText('measured');
    expect(badge).toHaveAttribute('title', expect.stringContaining('GPU Busy'));
  });
  it('renders nothing without evidence', () => {
    const { container } = render(<EvidenceBadge />);
    expect(container).toBeEmptyDOMElement();
  });
});

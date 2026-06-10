import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { GuidanceCard } from './GuidanceCard';

describe('GuidanceCard', () => {
  it('lists each missing sensor with how to enable it', () => {
    render(<GuidanceCard guidance={[{ what: 'per-core CPU usage', how: 'Enable it in HWiNFO.' }]} />);
    expect(screen.getByText(/per-core CPU usage/)).toBeInTheDocument();
    expect(screen.getByText(/Enable it in HWiNFO/)).toBeInTheDocument();
  });
  it('renders nothing when guidance is empty', () => {
    const { container } = render(<GuidanceCard guidance={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});

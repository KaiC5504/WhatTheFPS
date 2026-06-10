import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import type { CoreMatrix } from '../types';
import { CoreGrid } from './CoreGrid';

describe('CoreGrid', () => {
  it('renders one row per thread with avg/max in mono', () => {
    const cores: CoreMatrix = {
      usage: [
        { label: 'P-core 0 T0', coreType: 'P', coreIndex: 0, thread: 0, values: [10, 90] },
        { label: 'E-core 6 T0', coreType: 'E', coreIndex: 6, thread: 0, values: [5, 15] },
      ],
      effectiveClock: [],
    };
    render(<CoreGrid cores={cores} />);
    expect(screen.getByText('P-core 0 T0')).toBeInTheDocument();
    expect(screen.getByText('50')).toBeInTheDocument();
    expect(screen.getByText('90')).toBeInTheDocument();
  });
  it('renders nothing without a core matrix', () => {
    const { container } = render(<CoreGrid cores={null} />);
    expect(container).toBeEmptyDOMElement();
  });
});

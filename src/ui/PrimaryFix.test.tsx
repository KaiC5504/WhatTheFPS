import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { PrimaryFix } from './PrimaryFix';

describe('PrimaryFix', () => {
  it('renders the one fix with friendly framing', () => {
    render(<PrimaryFix fix={{ severity: 'warn', text: 'The CPU held the GPU back.', fix: 'Lower CPU-heavy settings.' }} />);
    expect(screen.getByText('The CPU held the GPU back.')).toBeInTheDocument();
    expect(screen.getByText(/Lower CPU-heavy settings/)).toBeInTheDocument();
    expect(screen.getByText(/one thing to try/i)).toBeInTheDocument();
  });
  it('renders a healthy message when there is no fix', () => {
    render(<PrimaryFix fix={null} />);
    expect(screen.getByText(/looks healthy/i)).toBeInTheDocument();
  });
});

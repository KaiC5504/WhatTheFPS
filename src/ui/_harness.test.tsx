import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';

// Guards the UI test stack: src/ui/** runs under jsdom, RTL renders, jest-dom matchers load.
describe('ui test harness', () => {
  it('renders into a jsdom document with jest-dom matchers available', () => {
    render(<output data-testid="probe">ready</output>);
    expect(screen.getByTestId('probe')).toHaveTextContent('ready');
  });
});

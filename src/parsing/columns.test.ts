import { describe, it, expect } from 'vitest';
import { buildColumns } from './columns';

describe('buildColumns', () => {
  it('extracts unit and assigns dupIndex to repeated names', () => {
    const cols = buildColumns(['Date', 'GPU Temperature [°C]', 'GPU [RPM]', 'GPU Temperature [°C]']);
    expect(cols[1]).toMatchObject({ name: 'GPU Temperature', unit: '°C', index: 1, dupIndex: 0 });
    expect(cols[3]).toMatchObject({ name: 'GPU Temperature', unit: '°C', index: 3, dupIndex: 1 });
    expect(cols[0]).toMatchObject({ name: 'Date', unit: null });
  });
  it('keeps raw text verbatim including the unit bracket', () => {
    const cols = buildColumns(['CPU Package Power [W]']);
    expect(cols[0].raw).toBe('CPU Package Power [W]');
    expect(cols[0].name).toBe('CPU Package Power');
    expect(cols[0].unit).toBe('W');
  });
  it('handles a Yes/No unit and a bracketed name without trailing unit', () => {
    const cols = buildColumns(['Core Thermal Throttling (avg) [Yes/No]', 'Core0 (CCD1)']);
    expect(cols[0]).toMatchObject({ name: 'Core Thermal Throttling (avg)', unit: 'Yes/No' });
    expect(cols[1]).toMatchObject({ name: 'Core0 (CCD1)', unit: null });
  });
  it('dedups independently per distinct name', () => {
    const cols = buildColumns(['GPU Temperature [°C]', 'CPU Package [°C]', 'CPU Package [°C]']);
    expect(cols[0].dupIndex).toBe(0);
    expect(cols[1].dupIndex).toBe(0);
    expect(cols[2].dupIndex).toBe(1);
  });
});

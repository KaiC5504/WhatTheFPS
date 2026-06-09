import { describe, it, expect } from 'vitest';
import { decodeBytes } from './decode';

describe('decodeBytes', () => {
  it('decodes Windows-1252 degree sign (0xB0) to °, not �', () => {
    // 'GPU [°C]' with 0xB0 for the degree sign (Win-1252)
    const bytes = new Uint8Array([0x47, 0x50, 0x55, 0x20, 0x5B, 0xB0, 0x43, 0x5D]);
    expect(decodeBytes(bytes)).toBe('GPU [°C]');
  });
  it('keeps valid UTF-8 intact', () => {
    const bytes = new TextEncoder().encode('GPU [°C]');
    expect(decodeBytes(bytes)).toBe('GPU [°C]');
  });
  it('strips a UTF-8 BOM if present', () => {
    const bom = new Uint8Array([0xef, 0xbb, 0xbf]);
    const rest = new TextEncoder().encode('Date,Time');
    const bytes = new Uint8Array(bom.length + rest.length);
    bytes.set(bom, 0);
    bytes.set(rest, bom.length);
    expect(decodeBytes(bytes)).toBe('Date,Time');
  });
});

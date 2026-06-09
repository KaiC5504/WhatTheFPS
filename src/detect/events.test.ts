import { describe, it, expect } from 'vitest';
import { makeEvent } from './events';

describe('makeEvent', () => {
  it('builds a DiagEvent with a deterministic id from type + slug', () => {
    const e = makeEvent({
      type: 'throttling',
      severity: 'bad',
      sentence: 'CPU thermal throttled in 3 samples (peak 98°C).',
      fix: 'Improve cooling or lower the power limit.',
      sampleCount: 3,
    });
    expect(e).toMatchObject({
      type: 'throttling',
      severity: 'bad',
      sentence: 'CPU thermal throttled in 3 samples (peak 98°C).',
      fix: 'Improve cooling or lower the power limit.',
      sampleCount: 3,
    });
    expect(e.id).toBe('throttling-cpu-thermal-throttled-in-3-samples-peak-98c');
  });

  it('produces a stable id for the same inputs', () => {
    const input = { type: 'fps-cap', severity: 'info' as const, sentence: 'FPS is capped at ~60.', sampleCount: 10 };
    expect(makeEvent(input).id).toBe(makeEvent(input).id);
  });

  it('omits fix when not provided', () => {
    const e = makeEvent({ type: 'ram', severity: 'warn', sentence: 'Memory was ~95% full.', sampleCount: 5 });
    expect(e.fix).toBeUndefined();
  });
});

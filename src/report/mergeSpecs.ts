import type { InferredSpecs } from '../types';

// Report fields are authoritative where present; everything else keeps the
// CSV-inferred value. Object.assign sidesteps the union-typed keyed write TS
// strict would otherwise reject.
export function mergeSpecs(current: InferredSpecs, fromReport: Partial<InferredSpecs>): InferredSpecs {
  const patch: Partial<InferredSpecs> = {};
  for (const key of Object.keys(fromReport) as (keyof InferredSpecs)[]) {
    const v = fromReport[key];
    if (v !== null && v !== undefined) Object.assign(patch, { [key]: v });
  }
  return { ...current, ...patch };
}

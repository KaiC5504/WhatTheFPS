import type { Limiter } from '../types';

export const LIMITER_LABEL: Record<Limiter, string> = {
  gpu: 'GPU-bound', cpu: 'CPU-bound', capped: 'capped', underutilized: 'GPU underutilized',
  ambiguous: 'unclear', unknown: 'unclassified',
};

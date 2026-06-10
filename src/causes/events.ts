import type { DiagEvent, Evidence, Severity } from '../types';

function slug(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')   // strip combining diacritics (é→e, etc.)
    .replace(/°/g, '')          // degree sign attaches to its number (98°c → 98c)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function makeEvent(input: {
  type: string;
  severity: Severity;
  sentence: string;
  fix?: string;
  sampleCount: number;
  evidence?: Evidence;
  windowIndexes?: number[];
}): DiagEvent {
  const event: DiagEvent = {
    id: `${input.type}-${slug(input.sentence)}`,
    type: input.type,
    severity: input.severity,
    sentence: input.sentence,
    sampleCount: input.sampleCount,
  };
  if (input.fix !== undefined) event.fix = input.fix;
  if (input.evidence !== undefined) event.evidence = input.evidence;
  if (input.windowIndexes !== undefined) event.windowIndexes = input.windowIndexes;
  return event;
}

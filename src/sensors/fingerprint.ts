import type { InferredSpecs, CpuVendor, GpuVendor } from '../types';

// Receives raw header strings (may include the trailing '[unit]'); matchers use
// substring/regex tests so the unit suffix is irrelevant.
export function inferSpecs(columnNames: string[]): InferredSpecs {
  const has = (re: RegExp) => columnNames.some((c) => re.test(c));

  const intel = has(/\bP-core \d+ VID\b/i) || has(/\bIA:\s/i) || has(/Ring\/LLC Clock/i);
  const amd = has(/\(CCD\d\)/i) || has(/Infinity Fabric Clock \(FCLK\)/i) || has(/\(Tctl\/Tdie\)/i) || has(/VDDCR/i);
  const cpuVendor: CpuVendor = intel ? 'intel' : amd ? 'amd' : 'unknown';

  let cpuModelGuess: string | null = null;
  if (cpuVendor === 'intel') {
    const pCores = countCores(columnNames, /\bP-core (\d+) VID\b/i);
    const eCores = countCores(columnNames, /\bE-core (\d+) VID\b/i);
    cpuModelGuess = pCores || eCores
      ? `Intel hybrid (${pCores}P+${eCores}E)`
      : 'Intel';
  } else if (cpuVendor === 'amd') {
    const ccds = new Set(
      columnNames.flatMap((c) => {
        const m = /\(CCD(\d)\)/i.exec(c);
        return m ? [m[1]] : [];
      }),
    );
    cpuModelGuess = ccds.size > 0 ? `AMD chiplet (${ccds.size} CCD)` : 'AMD chiplet';
  }

  const nvidia = has(/GPU 12VHPWR/i) || has(/GPU Memory Junction Temperature/i);
  const gpuVendor: GpuVendor = nvidia ? 'nvidia' : 'unknown';

  const isLaptop = has(/Battery Voltage/i) || has(/APU STAPM Limit/i);

  const igpuPresent =
    has(/GPU Core Voltage \(VDDCR_GFX\)/i) ||
    has(/\biGPU VID\b/i) ||
    has(/GPU Core Temperature/i) ||
    has(/APU STAPM Limit/i);

  return {
    cpuVendor,
    cpuModelGuess,
    gpuVendor,
    gpuModelGuess: null,
    igpuPresent,
    isLaptop,
    ramMb: null,
  };
}

function countCores(columnNames: string[], re: RegExp): number {
  let max = -1;
  for (const c of columnNames) {
    const m = re.exec(c);
    if (m) max = Math.max(max, Number(m[1]));
  }
  if (max < 0) return 0;
  // E-core indices continue P-core numbering (P 0..5, E 6..13); count = distinct indices seen.
  const seen = new Set<number>();
  for (const c of columnNames) {
    const m = re.exec(c);
    if (m) seen.add(Number(m[1]));
  }
  return seen.size;
}

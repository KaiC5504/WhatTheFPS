import type { InferredSpecs, CpuVendor, GpuVendor } from '../types';

// Two inputs per column: the sensor label (e.g. 'P-core 0 VID [V]') drives vendor/topology
// heuristics, while the HWiNFO trailer source (e.g. 'dGPU [#1]: NVIDIA GeForce RTX 4070
// Laptop') carries the real device model. Sources are optional — when absent we fall back
// to the label-only guesses.
export function inferSpecs(columnNames: string[], sources: string[] = []): InferredSpecs {
  const has = (re: RegExp) => columnNames.some((c) => re.test(c));
  // Models never contain a colon, so capture up to the first ':' (HWiNFO appends sub-source
  // qualifiers like ': DTS', ': Enhanced') or end of cell.
  const srcMatch = (re: RegExp): string | null => {
    for (const s of sources) {
      const m = re.exec(s);
      if (m) return m[1].trim();
    }
    return null;
  };

  const intel = has(/\bP-core \d+ VID\b/i) || has(/\bIA:\s/i) || has(/Ring\/LLC Clock/i);
  const amd = has(/\(CCD\d\)/i) || has(/Infinity Fabric Clock \(FCLK\)/i) || has(/\(Tctl\/Tdie\)/i) || has(/VDDCR/i);

  const cpuFromSource = srcMatch(/^CPU \[#\d+\]:\s*(.+?)\s*(?::|$)/i);
  let cpuVendor: CpuVendor = intel ? 'intel' : amd ? 'amd' : 'unknown';
  if (cpuVendor === 'unknown' && cpuFromSource) {
    if (/intel/i.test(cpuFromSource)) cpuVendor = 'intel';
    else if (/amd|ryzen/i.test(cpuFromSource)) cpuVendor = 'amd';
  }
  const cpuModelGuess = cpuFromSource ?? topologyGuess(columnNames, cpuVendor);

  const dgpu = srcMatch(/^dGPU \[#\d+\]:\s*(.+?)\s*(?::|$)/i);
  const gpuBare = srcMatch(/^GPU \[#\d+\]:\s*(.+?)\s*(?::|$)/i);
  const igpuModelGuess = srcMatch(/^iGPU \[#\d+\]:\s*(.+?)\s*(?::|$)/i);
  const gpuModelGuess = dgpu ?? gpuBare ?? igpuModelGuess;

  let gpuVendor: GpuVendor =
    has(/GPU 12VHPWR/i) || has(/GPU Memory Junction Temperature/i) ? 'nvidia' : 'unknown';
  if (gpuModelGuess) {
    if (/nvidia|geforce|rtx|gtx/i.test(gpuModelGuess)) gpuVendor = 'nvidia';
    else if (/radeon|amd/i.test(gpuModelGuess)) gpuVendor = 'amd';
    else if (/intel|arc|iris|uhd/i.test(gpuModelGuess)) gpuVendor = 'intel';
  }

  const systemModel = srcMatch(/^System:\s*(.+?)\s*$/i);
  const isLaptop = has(/Battery Voltage/i) || has(/APU STAPM Limit/i);
  const igpuPresent =
    !!igpuModelGuess ||
    has(/GPU Core Voltage \(VDDCR_GFX\)/i) ||
    has(/\biGPU VID\b/i) ||
    has(/GPU Core Temperature/i) ||
    has(/APU STAPM Limit/i);

  let ramModelGuess: string | null = null;
  const dimmSlots = new Set<number>();
  for (const s of sources) {
    const m = /^DDR\d?\s*DIMM \[#(\d+)\]:\s*([^(:]+)/i.exec(s);
    if (m) {
      dimmSlots.add(Number(m[1]));
      if (!ramModelGuess) ramModelGuess = m[2].trim();
    }
  }

  return {
    systemModel,
    cpuVendor,
    cpuModelGuess,
    gpuVendor,
    gpuModelGuess,
    igpuModelGuess,
    igpuPresent,
    isLaptop,
    ramMb: null, // size is computed from the data in normalize(), not the trailer
    ramModelGuess,
    ramModules: dimmSlots.size > 0 ? dimmSlots.size : null,
  };
}

// Fallback when the trailer has no model: describe the chip by its core topology.
function topologyGuess(columnNames: string[], cpuVendor: CpuVendor): string | null {
  if (cpuVendor === 'intel') {
    const pCores = countCores(columnNames, /\bP-core (\d+) VID\b/i);
    const eCores = countCores(columnNames, /\bE-core (\d+) VID\b/i);
    return pCores || eCores ? `Intel hybrid (${pCores}P+${eCores}E)` : 'Intel';
  }
  if (cpuVendor === 'amd') {
    const ccds = new Set(
      columnNames.flatMap((c) => {
        const m = /\(CCD(\d)\)/i.exec(c);
        return m ? [m[1]] : [];
      }),
    );
    return ccds.size > 0 ? `AMD chiplet (${ccds.size} CCD)` : 'AMD chiplet';
  }
  return null;
}

function countCores(columnNames: string[], re: RegExp): number {
  const seen = new Set<number>();
  for (const c of columnNames) {
    const m = re.exec(c);
    if (m) seen.add(Number(m[1]));
  }
  return seen.size;
}

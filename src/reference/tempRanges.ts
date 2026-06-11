import type { InferredSpecs } from '../types';

export interface TempRange { warnAt: number; badAt: number; note: string }
export type TempComponent = 'cpu' | 'gpu' | 'gpu.hotspot' | 'gpu.memJunction' | 'vrm' | 'drive';

// Class-level (vendor × form factor), never per-SKU. warnAt = "running close",
// badAt = the class's throttle/limit point. Unknown vendors fall back to the values
// the verdict hardcoded before this table existed, so behavior only changes where
// we actually know more about the hardware class.
export function lookupTempRange(component: TempComponent, specs: InferredSpecs): TempRange {
  switch (component) {
    case 'cpu': return cpuRange(specs);
    case 'gpu': return gpuEdgeRange(specs);
    case 'gpu.hotspot': return hotspotRange(specs);
    case 'gpu.memJunction':
      return { warnAt: 94, badAt: 104, note: 'GDDR6/6X junction TjMax is 105–110 °C; GDDR6X starts thermal management around 104 °C.' };
    case 'vrm':
      return { warnAt: 90, badAt: 105, note: 'Power-stage MOSFETs are rated 125 °C+, but sustained 90+ °C means weak airflow; 105+ °C risks protection throttling.' };
    case 'drive':
      return { warnAt: 70, badAt: 80, note: 'NVMe controllers begin thermal throttling around 70–75 °C; 80 °C is at component limits.' };
  }
}

function cpuRange(specs: InferredSpecs): TempRange {
  if (specs.cpuVendor === 'amd') {
    // X3D is a class test (the stacked-cache parts share the lowered limit), not a SKU lookup.
    if (!specs.isLaptop && /x3d/i.test(specs.cpuModelGuess ?? '')) {
      return { warnAt: 80, badAt: 89, note: 'Desktop Ryzen X3D class: TjMax lowered to 89 °C for the stacked cache.' };
    }
    if (specs.isLaptop) {
      return { warnAt: 90, badAt: 100, note: 'Mobile Ryzen class: Tctl limit 100 °C; sustained 90s are normal under load but near the limit.' };
    }
    return { warnAt: 85, badAt: 95, note: 'Desktop Ryzen class: Tctl limit 95 °C on Zen 3–5 non-X3D parts.' };
  }
  if (specs.cpuVendor === 'intel') {
    return { warnAt: 90, badAt: 100, note: 'Intel class: TjMax 100 °C across recent desktop and mobile parts.' };
  }
  return { warnAt: 90, badAt: 100, note: 'Generic CPU fallback: most consumer parts throttle at 95–100 °C.' };
}

function gpuEdgeRange(specs: InferredSpecs): TempRange {
  switch (specs.gpuVendor) {
    case 'nvidia':
      return specs.isLaptop
        ? { warnAt: 80, badAt: 87, note: 'Laptop GeForce class: the thermal throttle target is 87 °C.' }
        : { warnAt: 85, badAt: 90, note: 'Desktop GeForce class: slowdown begins in the low 90s °C edge.' };
    case 'amd':
      return { warnAt: 90, badAt: 100, note: 'Radeon class: edge runs hot by design; the 110 °C hotspot is the real limiter.' };
    case 'intel':
      return { warnAt: 90, badAt: 100, note: 'Arc class: 100 °C throttle point.' };
    default:
      return { warnAt: 85, badAt: 90, note: 'Generic GPU fallback (matches the previous hardcoded thresholds).' };
  }
}

function hotspotRange(specs: InferredSpecs): TempRange {
  if (specs.gpuVendor === 'amd') {
    return { warnAt: 100, badAt: 110, note: 'AMD specifies hotspot up to 110 °C as in-spec; throttle at 110 °C.' };
  }
  return { warnAt: 95, badAt: 105, note: 'GeForce hotspot throttles ~105 °C; sustained 95+ °C usually means core-contact or pad wear.' };
}

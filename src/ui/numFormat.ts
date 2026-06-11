export function n(x: number): string {
  return Number.isInteger(x) ? String(x) : x.toFixed(1);
}

// '%' hugs the number; every other unit gets a space.
export function unitSuffix(unit: string | null): string {
  return unit ? (unit === '%' ? '%' : ` ${unit}`) : '';
}

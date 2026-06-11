import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseReport } from './parseReport';

const fixture = (name: string) => new Uint8Array(readFileSync(new URL(`./__fixtures__/${name}`, import.meta.url)));
const toBytes = (s: string) => new TextEncoder().encode(s);

// Synthetic report in the documented Save Report shape. Keeps the format tests
// deterministic; the fixture tests below prove the labels match what HWiNFO writes.
const TXT_REPORT = [
  '<<< HWiNFO v8.04 Report >>>',
  '',
  'Computer:',
  '  Computer Brand Name: ASUS ROG Strix G614JI',
  '',
  'Central Processor(s):',
  '  CPU Brand Name: 13th Gen Intel(R) Core(TM) i7-13650HX',
  '',
  'Video Adapter:',
  '  Video Chipset: NVIDIA GeForce RTX 4070 Laptop GPU',
  '  Video Card: ASUS GeForce RTX 4070 Laptop GPU',
  '',
  'Memory Modules:',
  '  Module Part Number: KF556S40-16',
  '',
  'Total Memory Size: 32 GBytes',
].join('\r\n');

describe('parseReport (TXT format)', () => {
  it('extracts exactly the authoritative spec fields', () => {
    const specs = parseReport(toBytes(TXT_REPORT));
    expect(specs).not.toBeNull();
    expect(specs!.cpuModelGuess).toBe('13th Gen Intel(R) Core(TM) i7-13650HX');
    expect(specs!.gpuModelGuess).toBe('NVIDIA GeForce RTX 4070 Laptop GPU'); // Video Chipset preferred over Video Card
    expect(specs!.systemModel).toBe('ASUS ROG Strix G614JI');
    expect(specs!.ramModelGuess).toBe('KF556S40-16');
    expect(specs!.ramMb).toBe(32 * 1024);
  });

  it('never emits fields the report does not state (vendor/topology stay with the CSV)', () => {
    const allowed = new Set(['cpuModelGuess', 'gpuModelGuess', 'ramMb', 'ramModelGuess', 'systemModel']);
    const specs = parseReport(toBytes(TXT_REPORT))!;
    expect(Object.keys(specs).every((k) => allowed.has(k))).toBe(true);
  });

  it('a CPU-only report still parses (partial is fine)', () => {
    const specs = parseReport(toBytes('CPU Brand Name: AMD Ryzen 7 7800X3D 8-Core Processor\n'));
    expect(specs).toEqual({ cpuModelGuess: 'AMD Ryzen 7 7800X3D 8-Core Processor' });
  });

  it('prefers the discrete GPU when the report lists the iGPU first', () => {
    // Real HWiNFO reports list the integrated adapter before the discrete one; the
    // GPU Type marker, not document order, must decide which Video Chipset wins.
    const dualGpu = [
      'Intel UHD Graphics',
      '  Video Chipset: Intel UHD Graphics',
      '  GPU Type: Integrated',
      'NVIDIA GeForce RTX 4070 Laptop',
      '  Video Chipset: NVIDIA GeForce RTX 4070 Laptop',
      '  GPU Type: Discrete',
    ].join('\n');
    expect(parseReport(toBytes(dualGpu))!.gpuModelGuess).toBe('NVIDIA GeForce RTX 4070 Laptop');
  });
});

describe('parseReport (HTM format)', () => {
  it('parses table-form HTML without a DOM', () => {
    const htm =
      '<html><head><style>td{color:red}</style></head><body><table>' +
      '<tr><td>Computer Brand Name</td><td>ASUS ROG Strix G614JI</td></tr>' +
      '<tr><td>CPU Brand Name</td><td>13th Gen Intel(R) Core(TM) i7-13650HX</td></tr>' +
      '<tr><td>Video Chipset</td><td>NVIDIA GeForce RTX 4070 Laptop GPU</td></tr>' +
      '<tr><td>Total Memory Size</td><td>32 GBytes</td></tr>' +
      '</table></body></html>';
    const specs = parseReport(toBytes(htm));
    expect(specs).not.toBeNull();
    expect(specs!.cpuModelGuess).toBe('13th Gen Intel(R) Core(TM) i7-13650HX');
    expect(specs!.gpuModelGuess).toBe('NVIDIA GeForce RTX 4070 Laptop GPU');
    expect(specs!.ramMb).toBe(32 * 1024);
  });
});

describe('parseReport (real fixtures)', () => {
  // The fixtures are trimmed real HWiNFO Save Reports — the exact-string assertions
  // are the provenance record proving the regexes match real HWiNFO output. The TXT
  // is Windows-1252, the HTM is UTF-8, so both decode paths are exercised.
  it('TXT fixture yields the machine\'s exact hardware names', () => {
    const specs = parseReport(fixture('report.txt'));
    expect(specs).not.toBeNull();
    expect(specs!.cpuModelGuess).toBe('Intel Core i7-13650HX');
    expect(specs!.gpuModelGuess).toBe('NVIDIA GeForce RTX 4070 Laptop'); // discrete, not the Intel iGPU listed first
    expect(specs!.systemModel).toBe('ASUS ROG Strix G614JI_G614JI');
    expect(specs!.ramModelGuess).toBe('KF556S40-16');
    expect(specs!.ramMb).toBe(32 * 1024);
  });
  it('HTM fixture parses to the same names as the TXT fixture', () => {
    const txt = parseReport(fixture('report.txt'))!;
    const htm = parseReport(fixture('report.htm'))!;
    expect(htm.cpuModelGuess).toBe(txt.cpuModelGuess);
    expect(htm.gpuModelGuess).toBe(txt.gpuModelGuess);
    expect(htm.ramMb).toBe(txt.ramMb);
    expect(htm.ramModelGuess).toBe(txt.ramModelGuess);
    expect(htm.systemModel).toBe(txt.systemModel);
  });
});

describe('parseReport (rejection)', () => {
  it('returns null for garbage, an empty file, and an HWiNFO CSV log', () => {
    expect(parseReport(toBytes('not a report at all'))).toBeNull();
    expect(parseReport(new Uint8Array(0))).toBeNull();
    const csv = 'Date,Time,"GPU Temperature [°C]","Total CPU Usage [%]"\n9.6.2026,12:00:00.000,74.1,42\n';
    expect(parseReport(toBytes(csv))).toBeNull();
  });
});

export type Delimiter = ',' | ';';
export type Decimal = '.' | ',';

export interface ParsedCsv {
  headers: string[];        // raw header cells, order preserved, includes duplicates
  rows: string[][];         // data rows only (footers stripped), cells as raw strings
  delimiter: Delimiter;
  decimal: Decimal;
}

export interface ColumnMeta {
  raw: string;              // original header text e.g. 'GPU Hot Spot Temperature [°C]'
  name: string;             // without the unit, trimmed e.g. 'GPU Hot Spot Temperature'
  unit: string | null;      // '°C' | 'MHz' | '%' | 'W' | 'V' | 'FPS' | 'Yes/No' | ... | null
  index: number;            // position in headers
  dupIndex: number;         // 0 for first occurrence of `name`, 1 for second, ...
}

export type CanonicalKey =
  // CPU
  | 'cpu.tempPackage' | 'cpu.tempCoreMax' | 'cpu.usageTotal' | 'cpu.usageCoreMax'
  | 'cpu.clock' | 'cpu.clockEff' | 'cpu.power'
  // discrete (gaming) GPU
  | 'gpu.temp' | 'gpu.hotspot' | 'gpu.memJunction' | 'gpu.usage'
  | 'gpu.clock' | 'gpu.clockEff' | 'gpu.power' | 'gpu.powerLimit' | 'gpu.memUsagePct'
  // integrated GPU (laptops)
  | 'igpu.temp' | 'igpu.usage'
  // memory
  | 'ram.loadPct' | 'ram.usedMb' | 'pagefile.usagePct'
  // fps (filled via FpsData, not a plain series)
  ;

export type FlagKey =
  | 'flag.cpu.thermalThrottle' | 'flag.cpu.prochot' | 'flag.cpu.ratl' | 'flag.cpu.powerLimit'
  | 'flag.gpu.perfLimitPower' | 'flag.gpu.perfLimitThermal' | 'flag.gpu.perfLimitUtil';

export interface NumericSensor { key: CanonicalKey; label: string; unit: string | null; values: (number | null)[]; }
export interface FlagSensor { key: FlagKey; label: string; values: boolean[]; }

export type CpuVendor = 'intel' | 'amd' | 'unknown';
export type GpuVendor = 'nvidia' | 'amd' | 'intel' | 'unknown';

export interface InferredSpecs {
  cpuVendor: CpuVendor;
  cpuModelGuess: string | null;     // e.g. 'Intel hybrid (6P+8E)' — a guess, user-editable
  gpuVendor: GpuVendor;
  gpuModelGuess: string | null;
  igpuPresent: boolean;
  isLaptop: boolean;
  ramMb: number | null;
}

export interface Stats { count: number; avg: number; min: number; max: number; p5: number; p95: number; p99: number; p1Low: number; p5Low: number; }

export type FpsSource = 'displayed' | 'presented' | 'legacy' | 'none';
export interface FpsData {
  source: FpsSource;
  sourceLabel: string;              // e.g. 'Framerate Displayed (avg)'
  clean: number[];                  // post-cleaning samples used for stats
  stats: Stats | null;              // null when source === 'none'
  presentedAvg: number | null;      // exposed in Nerd mode
  displayedAvg: number | null;
  capped: boolean;
  capValue: number | null;          // detected ceiling, when capped
}

export interface NormalizedLog {
  rowCount: number;
  pollMs: number;                   // median sample interval
  specs: InferredSpecs;
  sensors: Partial<Record<CanonicalKey, NumericSensor>>;
  flags: Partial<Record<FlagKey, FlagSensor>>;
  fps: FpsData;
  unknownColumns: string[];
}

export type Severity = 'info' | 'warn' | 'bad';
export interface DiagEvent { id: string; type: string; severity: Severity; sentence: string; fix?: string; sampleCount: number; }

export type Health = 'good' | 'warn' | 'bad';
export type MascotMood = 'chill' | 'concerned' | 'panic';
export interface HeroNumber { key: string; label: string; value: string; severity: Severity; }
export interface Finding { severity: Severity; text: string; fix?: string; }
export interface Verdict { health: Health; mascotMood: MascotMood; headline: string; hero: HeroNumber[]; findings: Finding[]; }

export type DigestMode = 'compact' | 'full';
export interface Digest { compact: string; full: string; tokenEstimate: Record<DigestMode, number>; fpsSourceLabel: string; }

export interface AnalysisResult { log: NormalizedLog; stats: Partial<Record<CanonicalKey, Stats>>; events: DiagEvent[]; verdict: Verdict; digest: Digest; }

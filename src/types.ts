export type Delimiter = ',' | ';';
export type Decimal = '.' | ',';

export interface ParsedCsv {
  headers: string[];        // raw header cells, order preserved, includes duplicates
  rows: string[][];         // data rows only (footers stripped), cells as raw strings
  sources: string[];        // per-column device source from HWiNFO's trailer row, aligned to headers; [] if absent
  delimiter: Delimiter;
  decimal: Decimal;
}

export interface ColumnMeta {
  raw: string;              // original header text e.g. 'GPU Hot Spot Temperature [°C]'
  name: string;             // without the unit, trimmed e.g. 'GPU Hot Spot Temperature'
  unit: string | null;      // '°C' | 'MHz' | '%' | 'W' | 'V' | 'FPS' | 'Yes/No' | ... | null
  index: number;            // position in headers
  dupIndex: number;         // 0 for first occurrence of `name`, 1 for second, ...
  source: string | null;    // owning device, e.g. 'dGPU [#1]: NVIDIA GeForce RTX 4070 Laptop'
}

export type CanonicalKey =
  // CPU
  | 'cpu.tempPackage' | 'cpu.tempCoreMax' | 'cpu.usageTotal' | 'cpu.usageCoreMax'
  | 'cpu.clock' | 'cpu.clockEff' | 'cpu.power'
  // discrete (gaming) GPU
  | 'gpu.temp' | 'gpu.hotspot' | 'gpu.memJunction' | 'gpu.usage'
  | 'gpu.clock' | 'gpu.clockEff' | 'gpu.power' | 'gpu.powerLimit' | 'gpu.memUsagePct'
  | 'gpu.memControllerLoad'
  // integrated GPU (laptops)
  | 'igpu.temp' | 'igpu.usage'
  // memory
  | 'ram.loadPct' | 'ram.usedMb' | 'pagefile.usagePct'
  // VRAM in absolute MB (dGPU section only; iGPU instances are dropped)
  | 'vram.allocatedMb' | 'vram.availableMb' | 'vram.d3dDedicatedMb' | 'vram.d3dDynamicMb'
  // PresentMon block (HWiNFO 7.63+) — per-interval ms aggregates
  | 'pm.gpuBusyMs' | 'pm.gpuWaitMs' | 'pm.cpuBusyMs' | 'pm.cpuWaitMs' | 'pm.frameTimeMs'
  // RTSS frametime (0 = not armed, sanitized to null at normalize time)
  | 'rtss.frameTimeMs'
  // fps (filled via FpsData, not a plain series)
  ;

export type FlagKey =
  | 'flag.cpu.thermalThrottle' | 'flag.cpu.prochot' | 'flag.cpu.ratl' | 'flag.cpu.powerLimit'
  | 'flag.gpu.perfLimitPower' | 'flag.gpu.perfLimitThermal' | 'flag.gpu.perfLimitUtil'
  | 'flag.gpu.perfLimitVRel' | 'flag.gpu.perfLimitVOp' | 'flag.gpu.perfLimitCurrent';

export interface NumericSensor { key: CanonicalKey; label: string; unit: string | null; values: (number | null)[]; }
export interface FlagSensor { key: FlagKey; label: string; values: boolean[]; }

export type CoreType = 'P' | 'E' | 'std';
export interface CoreThreadSeries {
  label: string;                  // e.g. 'P-core 0 T1', 'Core 7 T0'
  coreType: CoreType;
  coreIndex: number;
  thread: number;
  values: (number | null)[];      // row-aligned
}
export interface CoreMatrix {
  usage: CoreThreadSeries[];
  effectiveClock: CoreThreadSeries[];
}

export type CpuVendor = 'intel' | 'amd' | 'unknown';
export type GpuVendor = 'nvidia' | 'amd' | 'intel' | 'unknown';

export interface InferredSpecs {
  systemModel: string | null;       // e.g. 'ASUS ROG Strix G614JI' from the log trailer
  cpuVendor: CpuVendor;
  cpuModelGuess: string | null;     // real model when the trailer has it, else a topology guess
  gpuVendor: GpuVendor;
  gpuModelGuess: string | null;     // discrete GPU preferred, e.g. 'NVIDIA GeForce RTX 4070 Laptop'
  igpuModelGuess: string | null;    // e.g. 'Intel UHD Graphics'
  igpuPresent: boolean;
  isLaptop: boolean;
  ramMb: number | null;
  ramModelGuess: string | null;     // DIMM kit, e.g. 'Kingston KF556S40-16'
  ramModules: number | null;        // populated DIMM slot count
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
  series: (number | null)[];        // row-aligned, cleaned (0 / >1000 → null); [] when source==='none'
  presented1PctLow: number | null;  // last finite value of the cumulative PresentMon column
  presented01PctLow: number | null;
  rtss1PctLow: number | null;       // RTSS 'Framerate 1% Low'; 0 means not armed → null
}

export interface NormalizedLog {
  rowCount: number;
  pollMs: number;                   // median sample interval
  specs: InferredSpecs;
  sensors: Partial<Record<CanonicalKey, NumericSensor>>;
  flags: Partial<Record<FlagKey, FlagSensor>>;
  fps: FpsData;
  unknownColumns: string[];
  timesMs: number[];                // row-aligned, monotonic (midnight-corrected), forward-filled
  cores: CoreMatrix | null;
}

export type Severity = 'info' | 'warn' | 'bad';
export interface DiagEvent {
  id: string; type: string; severity: Severity; sentence: string; fix?: string; sampleCount: number;
  evidence?: Evidence;
  windowIndexes?: number[];
}

export type EvidenceTier = 'measured' | 'inferred';
export interface SensorGuidance { what: string; how: string; }
export interface Evidence { tier: EvidenceTier; basis: string[]; missing?: SensorGuidance[]; }

export interface TimeWindow { index: number; startRow: number; endRow: number; startMs: number; endMs: number; }
export type WindowActivity = 'gameplay' | 'idle' | 'loading' | 'unknown';
export type Limiter = 'gpu' | 'cpu' | 'capped' | 'underutilized' | 'ambiguous' | 'unknown';

export interface WindowMetrics {
  fpsAvg: number | null;
  fpsCoverage: number;              // fraction of window rows with a finite FPS sample
  frameTimeMs: number | null;       // PresentMon preferred, RTSS fallback
  frameTimeMaxMs: number | null;
  gpuBusyMs: number | null;
  cpuBusyMs: number | null;
  gpuUsage: number | null;
  cpuMaxThread: number | null;
  cpuTotal: number | null;
  gpuPowerW: number | null;
  gpuPowerLimitW: number | null;
  gpuClockEffMhz: number | null;
  cpuClockEffMhz: number | null;
  gpuTempC: number | null;
  cpuTempC: number | null;
  vramDedicatedMb: number | null;
  vramDynamicMb: number | null;
  ramLoadPct: number | null;
  flagsFired: FlagKey[];            // flags with any true sample inside the window
}

export interface WindowClassification {
  window: TimeWindow;
  activity: WindowActivity;
  limiter: Limiter;                 // 'unknown' for non-gameplay windows
  tier: EvidenceTier | null;
  basis: string[];
  metrics: WindowMetrics;
}

export interface TimeSplit {
  gameplayMs: number;
  totalMs: number;
  shares: Partial<Record<Limiter, number>>;  // fraction of gameplay time per limiter
  dominant: Limiter | 'mixed' | null;        // null when no gameplay windows
}

export interface SnapshotEntry { label: string; value: string; unit: string | null; }
export interface WorstMoment { classification: WindowClassification; fpsDropPct: number; snapshot: SnapshotEntry[]; }

export interface WindowAnalysis {
  windows: WindowClassification[];
  timeSplit: TimeSplit;
  worst: WorstMoment[];
  windowMs: number;                 // actual window size used
  lowConfidence: boolean;           // log too short for real windowing
  activityKind: 'gameplay' | 'workload';  // 'workload' when no FPS was logged (benchmark logs)
}

export type Health = 'good' | 'warn' | 'bad';
export type MascotMood = 'chill' | 'concerned' | 'panic';
export interface HeroNumber { key: string; label: string; value: string; severity: Severity; }
export interface Finding { severity: Severity; text: string; fix?: string; evidence?: Evidence; }

export interface Verdict {
  health: Health;
  mascotMood: MascotMood;
  headline: string;
  hero: HeroNumber[];
  findings: Finding[];
  timeSplit: TimeSplit | null;
  worst: WorstMoment[];
  primaryFix: Finding | null;
  coverage: { gameplayMs: number; totalMs: number } | null;
  guidance: SensorGuidance[];
}

export type DigestMode = 'compact' | 'full';
export interface Digest { compact: string; full: string; tokenEstimate: Record<DigestMode, number>; fpsSourceLabel: string; }

export interface AnalysisResult { log: NormalizedLog; stats: Partial<Record<CanonicalKey, Stats>>; events: DiagEvent[]; verdict: Verdict; digest: Digest; windows: WindowAnalysis; }

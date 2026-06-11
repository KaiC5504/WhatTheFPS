# Graph Report - .  (2026-06-12)

## Corpus Check
- 193 files · ~156,364 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 823 nodes · 2160 edges · 31 communities (30 shown, 1 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 11 edges (avg confidence: 0.88)
- Token cost: 291,112 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Root-Cause Analyzers|Root-Cause Analyzers]]
- [[_COMMUNITY_UI Primitives & Components|UI Primitives & Components]]
- [[_COMMUNITY_Sensor Normalization & Fingerprint|Sensor Normalization & Fingerprint]]
- [[_COMMUNITY_Timeline Selection UI|Timeline Selection UI]]
- [[_COMMUNITY_LLM Digest Builder|LLM Digest Builder]]
- [[_COMMUNITY_Golden Tests & App Integration|Golden Tests & App Integration]]
- [[_COMMUNITY_CSV Parsing & Decoding|CSV Parsing & Decoding]]
- [[_COMMUNITY_Chart Theme & Plugins|Chart Theme & Plugins]]
- [[_COMMUNITY_Package Dependencies|Package Dependencies]]
- [[_COMMUNITY_Run Comparison Diff Engine|Run Comparison Diff Engine]]
- [[_COMMUNITY_App TypeScript Config|App TypeScript Config]]
- [[_COMMUNITY_Project Architecture Docs|Project Architecture Docs]]
- [[_COMMUNITY_UI Test Kit|UI Test Kit]]
- [[_COMMUNITY_Evidence Engine Design|Evidence Engine Design]]
- [[_COMMUNITY_UI Design Contract|UI Design Contract]]
- [[_COMMUNITY_Branding, PWA & Privacy|Branding, PWA & Privacy]]
- [[_COMMUNITY_Compare Digest Renderer|Compare Digest Renderer]]
- [[_COMMUNITY_Compare View Tests|Compare View Tests]]
- [[_COMMUNITY_Mascot Visual Identity|Mascot Visual Identity]]
- [[_COMMUNITY_Node TypeScript Config|Node TypeScript Config]]
- [[_COMMUNITY_Digest Profiles & Guardrails|Digest Profiles & Guardrails]]
- [[_COMMUNITY_Compare & Run History|Compare & Run History]]
- [[_COMMUNITY_V2 Diagnostics & Timelines|V2 Diagnostics & Timelines]]
- [[_COMMUNITY_Compare Digest Tests|Compare Digest Tests]]
- [[_COMMUNITY_Compare Table|Compare Table]]
- [[_COMMUNITY_Root TypeScript Config|Root TypeScript Config]]

## God Nodes (most connected - your core abstractions)
1. `computeStats()` - 36 edges
2. `CanonicalKey` - 35 edges
3. `analyze()` - 31 edges
4. `makeLog()` - 30 edges
5. `makeEvent()` - 28 edges
6. `makeWindowAnalysis()` - 27 edges
7. `Stats` - 27 edges
8. `makeWindow()` - 26 edges
9. `cx()` - 25 edges
10. `DiagEvent` - 23 edges

## Surprising Connections (you probably didn't know these)
- `Mascot()` --implements--> `Mascot face language (big white oval eyes, tinted pupils, eye-shine, antenna)`  [INFERRED]
  src/ui/Mascot.tsx → public/wtfps-icon.svg
- `WTFPS App Icon (robot mascot face with FPS-waveform mouth)` --references--> `Accent color token --accent (#3b9eff)`  [INFERRED]
  public/wtfps-icon.svg → src/ui/theme.css
- `Mascot()` --references--> `WTFPS App Icon (robot mascot face with FPS-waveform mouth)`  [EXTRACTED]
  src/ui/Mascot.tsx → public/wtfps-icon.svg
- `HWiNFO Save Report Fixture (report.txt)` --shares_data_with--> `parseReport (HWiNFO Save Report Parser)`  [INFERRED]
  src/report/__fixtures__/report.txt → docs/superpowers/plans/completed/2026-06-11-wtfps-v2-specs-breadth.md
- `Copy Prompt for My LLM Digest` --conceptually_related_to--> `Client-Side Privacy Architecture`  [INFERRED]
  docs/superpowers/specs/2026-06-09-wtfps-hwinfo-analyzer-design.md → README.md

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **WTFPS v2 Roadmap Plans (strict-order items 1-6)** — completed_2026_06_11_wtfps_v2_compare_history, completed_2026_06_11_wtfps_v2_interactive_timelines, completed_2026_06_11_wtfps_v2_deeper_diagnostics, completed_2026_06_11_wtfps_v2_specs_breadth, plans_2026_06_11_wtfps_v2_digest_profiles, plans_2026_06_11_wtfps_v2_packaging_a11y, plans_2026_06_09_wtfps_hwinfo_analyzer_v2_roadmap [EXTRACTED 1.00]
- **v1.5 Evidence Engine three-phase release** — completed_2026_06_10_wtfps_v1_5_evidence_engine_design, completed_2026_06_10_wtfps_v1_5_phase1_engine, completed_2026_06_10_wtfps_v1_5_phase2_verdict_digest, completed_2026_06_10_wtfps_v1_5_phase3_ui_modes [EXTRACTED 1.00]
- **Analyzers implementing (log, stats, windows) => DiagEvent[]** — completed_2026_06_11_wtfps_v2_deeper_diagnostics_frame_pacing, completed_2026_06_11_wtfps_v2_deeper_diagnostics_fan_curve, completed_2026_06_11_wtfps_v2_deeper_diagnostics_storage_stutter, completed_2026_06_10_wtfps_v1_5_evidence_engine_design_cause_analyzers [EXTRACTED 1.00]
- **WTFPS mascot visual identity (icon and in-app mascot as one character)** — public_wtfps_icon, ui_mascot_mascot, public_wtfps_icon_mascot_face, public_wtfps_icon_fps_waveform_mouth [INFERRED 0.85]

## Communities (31 total, 1 thin omitted)

### Community 0 - "Root-Cause Analyzers"
Cohesion: 0.05
Nodes (93): causeCpuBound(), hottestThread(), noStats, makeEvent(), slug(), causeFanCurve(), mean(), Pair (+85 more)

### Community 1 - "UI Primitives & Components"
Cohesion: 0.05
Nodes (59): Button(), ButtonProps, Card(), CardProps, GlassCard(), StatTile(), mergeSpecs(), current (+51 more)

### Community 2 - "Sensor Normalization & Fingerprint"
Cohesion: 0.05
Nodes (60): FlagCheck, countCores(), inferSpecs(), topologyGuess(), AMBIGUOUS, AMBIGUOUS_FLAGS, buildTimesMs(), computeRamMb() (+52 more)

### Community 3 - "Timeline Selection UI"
Cohesion: 0.06
Nodes (31): CoreMatrix, SelectionAnalysis, Verdict, WorstMoment, SelectionPanel(), SelectionPanelProps, fixtureSelection(), stats() (+23 more)

### Community 4 - "LLM Digest Builder"
Cohesion: 0.07
Nodes (47): fatResult(), ramp(), buildDigest(), COMPACT_SENSORS, contextBlock(), coverageLine(), eventsBlock(), fpsLine() (+39 more)

### Community 5 - "Golden Tests & App Integration"
Cohesion: 0.07
Nodes (29): slimResult(), SAMPLES_ROOT, App(), bytes, mockState, result, AnalysisResult, SlimLog (+21 more)

### Community 6 - "CSV Parsing & Decoding"
Cohesion: 0.08
Nodes (32): buildColumns(), detectDelimiter(), dropTrailingEmpty(), parseCsv(), sourceScore(), load(), tokenize(), decodeBytes() (+24 more)

### Community 7 - "Chart Theme & Plugins"
Cohesion: 0.10
Nodes (24): ChartTheme, readChartTheme(), decimateRows(), firstOfRun(), timeToRow(), buildEventMarkers(), buildRailSegments(), buildWorstMarkers() (+16 more)

### Community 8 - "Package Dependencies"
Cohesion: 0.07
Nodes (29): dependencies, @fontsource/chakra-petch, @fontsource/jetbrains-mono, @fontsource-variable/hanken-grotesk, react, react-dom, uplot, devDependencies (+21 more)

### Community 9 - "Run Comparison Diff Engine"
Cohesion: 0.13
Nodes (23): avgOf(), Better, buildEventDiff(), buildHeadline(), buildHeroDeltas(), buildMismatches(), buildSensorDeltas(), compareRuns() (+15 more)

### Community 10 - "App TypeScript Config"
Cohesion: 0.10
Nodes (20): compilerOptions, allowImportingTsExtensions, composite, isolatedModules, jsx, lib, module, moduleDetection (+12 more)

### Community 11 - "Project Architecture Docs"
Cohesion: 0.18
Nodes (18): CLAUDE.md — Project Instructions, Fixed Linear Analysis Pipeline (analyze()), dGPU vs iGPU Section-Anchor Disambiguation, Hardware Fingerprint Inference (No Hardware Database), Midnight Timestamp Crossing Correction, specsStore localStorage Persistence, src/types.ts as Central Contract, Windows-1252 Byte Decoding (+10 more)

### Community 12 - "UI Test Kit"
Cohesion: 0.14
Nodes (13): DEFAULT_SPECS, DEFAULT_SPLIT, makeSavedRun(), makeSlim(), SENSOR_META, TimeSplit, result, tinyCsv (+5 more)

### Community 13 - "Evidence Engine Design"
Cohesion: 0.20
Nodes (17): FPS Cap Detection Heuristic, v1.5 Evidence Engine Design Spec, FPS Cap Gate (runs before busy-ratio logic), Root-Cause Analyzers (src/causes/), Evidence Tiers: measured vs inferred, Never-Assert List, PresentMon GPU-Busy/Wait Limiter Classification, Time-Split + Worst-Moments Verdict (+9 more)

### Community 14 - "UI Design Contract"
Cohesion: 0.23
Nodes (14): Ambient Glass Restyle Plan, Fixed Aurora + Film Grain Atmosphere, Panel No-Blur Performance Policy, v1.5 Phase 3 Real Easy/Nerd Modes Plan, Explicit Run Save Implementation Plan, Easy/Nerd Mode Toggle, Explicit Run Save Design Spec, Explicit Save Run Button (+6 more)

### Community 15 - "Branding, PWA & Privacy"
Cohesion: 0.19
Nodes (14): Mascot + Logo Restyle Plan, Mascot + Icon Restyle Design Spec, Shared Mascot/Icon Language, FPS-Waveform Mouth, index.html — App Shell, v2 #6 PWA Packaging + Accessibility Plan, vitest-axe Smoke Suite, PWA Precache-Everything Offline Strategy (+6 more)

### Community 16 - "Compare Digest Renderer"
Cohesion: 0.22
Nodes (13): buildCompareDigest(), deltaLine(), eventLine(), fmt(), n(), POLARITY_TAG, render(), splitSummary() (+5 more)

### Community 17 - "Compare View Tests"
Cohesion: 0.18
Nodes (9): FPS(), stat(), CompareView(), after, before, comparison, FPS(), runA (+1 more)

### Community 18 - "Mascot Visual Identity"
Cohesion: 0.21
Nodes (10): WTFPS App Icon (robot mascot face with FPS-waveform mouth), FPS-waveform mouth with orange frame-drop dot, Mascot face language (big white oval eyes, tinted pupils, eye-shine, antenna), MascotMood, EYE, Mascot(), MascotProps, TINT (+2 more)

### Community 19 - "Node TypeScript Config"
Cohesion: 0.18
Nodes (10): compilerOptions, allowSyntheticDefaultImports, composite, module, moduleResolution, noEmit, skipLibCheck, strict (+2 more)

### Community 20 - "Digest Profiles & Guardrails"
Cohesion: 0.27
Nodes (10): Golden Integration Tests on Real Logs, Golden No-False-Positive Guardrail, readChartTheme Token-to-Canvas Reader, v2 #5 Digest Profiles & HTML Report Card Plan, Byte-for-Byte Back-Compat Pins, Goal Presets (GOAL_PRESETS chips), Profile-Parameterized Digest Renderer, Self-Contained HTML Report Card (+2 more)

### Community 21 - "Compare & Run History"
Cohesion: 0.36
Nodes (10): Before/After Compare Design Spec, buildCompareDigest (stacked BEFORE/AFTER digest), Warn-but-Allow Mismatch Guardrails, v2 #1 Compare + Session History Plan, compareRuns Diff Engine, Event Diff (resolved/introduced/persisted), Delta Polarity Table, RunsPanel Modal (+2 more)

### Community 22 - "V2 Diagnostics & Timelines"
Cohesion: 0.39
Nodes (9): v2 #3 Deeper Diagnostics Plan, fanCurve Unresponsive-Fan Analyzer, framePacing Micro-Stutter Analyzer, Shared Pacing Math (causes/pacing.ts), storageStutter Co-Location Analyzer, v2 #2 Interactive uPlot Timelines Plan, computeSelection Brush Analysis, Event-Marker Contract (windowIndexes) (+1 more)

### Community 23 - "Compare Digest Tests"
Cohesion: 0.33
Nodes (5): after, before, comparison, runA, runB

### Community 24 - "Compare Table"
Cohesion: 0.33
Nodes (5): CompareTable(), after, before, comparison, throttle

## Knowledge Gaps
- **173 isolated node(s):** `name`, `private`, `type`, `dev`, `build` (+168 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **1 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `CanonicalKey` connect `Root-Cause Analyzers` to `Sensor Normalization & Fingerprint`, `Timeline Selection UI`, `LLM Digest Builder`, `Golden Tests & App Integration`, `Chart Theme & Plugins`, `Run Comparison Diff Engine`, `UI Test Kit`?**
  _High betweenness centrality (0.022) - this node is a cross-community bridge._
- **Why does `analyze()` connect `Root-Cause Analyzers` to `Sensor Normalization & Fingerprint`, `Timeline Selection UI`, `LLM Digest Builder`, `Golden Tests & App Integration`, `CSV Parsing & Decoding`, `UI Test Kit`?**
  _High betweenness centrality (0.013) - this node is a cross-community bridge._
- **Why does `DiagEvent` connect `Root-Cause Analyzers` to `UI Primitives & Components`, `Sensor Normalization & Fingerprint`, `LLM Digest Builder`, `Chart Theme & Plugins`, `Run Comparison Diff Engine`, `UI Test Kit`, `Compare Digest Renderer`, `Compare View Tests`, `Compare Table`?**
  _High betweenness centrality (0.012) - this node is a cross-community bridge._
- **What connects `name`, `private`, `type` to the rest of the system?**
  _174 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Root-Cause Analyzers` be split into smaller, more focused modules?**
  _Cohesion score 0.05273047563123899 - nodes in this community are weakly interconnected._
- **Should `UI Primitives & Components` be split into smaller, more focused modules?**
  _Cohesion score 0.050087361677344205 - nodes in this community are weakly interconnected._
- **Should `Sensor Normalization & Fingerprint` be split into smaller, more focused modules?**
  _Cohesion score 0.05143638850889193 - nodes in this community are weakly interconnected._
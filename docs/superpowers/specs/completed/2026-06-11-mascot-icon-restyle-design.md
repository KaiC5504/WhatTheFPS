# Mascot + logo restyle — shared icon language

Date: 2026-06-11
Status: approved (brainstormed with visual companion; user picked every option below)

## Goal

The in-app mascot (`src/ui/Mascot.tsx`) and the app icon (`public/wtfps-icon.svg`) should
read as the same character. Today they diverge: the mascot has small lozenge eyes and a
plain smile; the icon has big white oval eyes with blue pupils and an FPS-waveform mouth
with an orange "frame drop" dot.

## Decisions (user-approved)

1. **Mascot direction — "icon face on the monitor body."** Keep the monitor-creature
   chassis, stand, status LED, flame, sweat and brows. Swap in the icon's face: big white
   oval eyes with tinted pupils and an eye-shine highlight, and replace the smile with the
   icon's waveform + orange dot.
2. **Waveform tints with mood** (blue → amber → red, same tint as pupils/LED), and its
   *shape* tells the FPS story per mood:
   - `chill` — calm baseline with one healthy spike up; orange dot on the peak.
   - `concerned` — a frame-drop dip; orange dot in the dip.
   - `panic` — chaotic spikes; orange dot at the bottom of the crash.
   The orange dot stays orange (`#ff7a18`) in every mood.
3. **Icon treatment — "the tile is the head."** `public/wtfps-icon.svg` becomes the
   creature's face cropped to the rounded-square tile: the tile is the chassis, with an
   inset screen well, a blue LED centered on the top bezel, the big eyes, and the blue
   waveform + orange dot (chill mood). This stays bold at 16–32 px favicon sizes.

## Mascot geometry (100×100 viewBox, unchanged component API)

Unchanged: `MascotProps` (`mood`, `size`), `data-mood` attribute, `role="img"` +
`aria-label`, chassis/stand/screen-well rects, flame group (`data-part="flame"`, panic
only, replaces the LED), LED tinting, theme-token-only colors (plus the already-hardcoded
flame/orange hexes).

New face, all moods:

| Part | Geometry |
|---|---|
| Eye whites | ellipses cx 39 / 61, `fill var(--text)`, rx 8, per-mood cy/ry below |
| Pupils | circles cx 39.7 / 61.7, cy = eyeCy + py, per-mood radius, `fill` = mood tint |
| Eye-shine | white circles r 1.3 sitting on each pupil (offset −1.4, −1.4 from pupil center) so they actually read against the white sclera (in the source icon they're lost inside the white) |
| Waveform | polyline, `stroke` = mood tint, width 2.4, round caps/joins, per-mood points below |
| Orange dot | circle r 2.1, `fill #ff7a18`, sits on the waveform's extreme point |

Per-mood table (replaces the old `EYE`/`MOUTH` records):

| mood | eye cy | eye ry | pupil py | pupil r | waveform points | dot |
|---|---|---|---|---|---|---|
| chill | 44 | 9.5 | +2.8 | 3.7 | `31,63 37,63 42,60.8 46,65 50,57 54,65 58,60.8 63,63 69,63` | 50, 57 |
| concerned | 44 | 11 | +3 | 3.7 | `31,61.5 36,61.5 41,63.5 45,60 50,67.5 55,60 59,63.5 64,61.5 69,61.5` | 50, 67.5 |
| panic | 43 | 12.5 | +0.5 | 3 | `31,60 35,65 39,57 43,66.5 47,56.5 50,68 54,57 58,66 62,58 66,64.5 69,60.5` | 50, 68 |

Brows move up to clear the bigger eyes: concerned `M32 33 L45 30` / `M55 30 L68 33`;
panic `M31 31.5 L45 27.5` / `M55 27.5 L69 31.5`. The concerned sweat drop moves to
x 70–76 (`M76 44 …`) so it clears the wider right eye.

## Icon (`public/wtfps-icon.svg`, 512 viewBox)

Standalone asset — hardcoded hexes matching the theme tokens: chassis `#1a1f2e`
(surface-2), well `#0e1119` (inset), accent `#3b9eff`, orange `#ff7a18`.

- Tile = chassis: `rect 512×512 rx 112`.
- Screen well: `rect x41 y61 430×389 rx 72`.
- LED: `circle (256, 33) r 15` accent.
- Eyes: white ellipses (174, 205) / (338, 205) rx 61 ry 74; accent pupils (179, 227) /
  (343, 227) r 28; white eye-shine (168, 216) / (332, 216) r 10.
- Waveform: `82,358 133,358 174,340 215,374 256,307 297,374 338,340 379,358 430,358`,
  accent stroke 20, round caps/joins; orange dot (256, 307) r 18.

`index.html` (favicon) and `README.md` (header `<img>`) already point at this file — no
edits needed there.

## Tests

Existing `Mascot.test.tsx` assertions (data-mood, flame only on panic, `var(--bad)` tint)
remain valid. Add: the waveform group (`data-part="waveform"`) and orange dot render in
every mood.

## Out of scope / roadmap (v2+)

- Animated waveform (scrolling heartbeat) and animated mood transitions.
- PNG favicon fallbacks and an og:image social banner using the same creature.
- Mood-aware favicon (swap icon while a log with a bad verdict is open).

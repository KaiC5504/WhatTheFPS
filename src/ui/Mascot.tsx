import type { MascotMood } from '../types';

interface MascotProps {
  mood: MascotMood;
  size?: number;
}

const TINT: Record<MascotMood, string> = {
  chill: 'var(--accent)',
  concerned: 'var(--warn)',
  panic: 'var(--bad)',
};

// Per-mood eye geometry: center height, openness, pupil vertical offset, pupil radius.
const EYE: Record<MascotMood, { cy: number; ry: number; py: number; pr: number }> = {
  chill: { cy: 44, ry: 9.5, py: 2.8, pr: 3.7 },
  concerned: { cy: 44, ry: 11, py: 3, pr: 3.7 },
  panic: { cy: 43, ry: 12.5, py: 0.5, pr: 3 },
};

// The mouth is an FPS trace: a healthy spike when chill, a frame-drop dip when
// concerned, a crash when panicking. The orange dot marks the extreme frame.
const WAVE: Record<MascotMood, { points: string; dotX: number; dotY: number }> = {
  chill: {
    points: '31,63 37,63 42,60.8 46,65 50,57 54,65 58,60.8 63,63 69,63',
    dotX: 50,
    dotY: 57,
  },
  concerned: {
    points: '31,61.5 36,61.5 41,63.5 45,60 50,67.5 55,60 59,63.5 64,61.5 69,61.5',
    dotX: 50,
    dotY: 67.5,
  },
  panic: {
    points: '31,60 35,65 39,57 43,66.5 47,56.5 50,68 54,57 58,66 62,58 66,64.5 69,60.5',
    dotX: 50,
    dotY: 68,
  },
};

// "WTFPS" mascot: a little monitor-creature whose face reports how the run went.
// Face language matches public/wtfps-icon.svg: big white eyes, tinted pupils,
// waveform mouth. chill = calm blue, concerned = amber + sweat, panic = red + flame.
export function Mascot({ mood, size = 116 }: MascotProps) {
  const tint = TINT[mood];
  const eye = EYE[mood];
  const wave = WAVE[mood];

  return (
    <svg
      data-mood={mood}
      role="img"
      aria-label={`mascot feeling ${mood}`}
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      {mood === 'panic' && (
        <g data-part="flame">
          <path d="M50 1 C43 11 39 16 39 23 a11 11 0 0 0 22 0 C61 16 57 11 50 1 Z" fill="#ff8a3d" />
          <path d="M50 9 C46 15 44 18 44 22 a6 6 0 0 0 12 0 C56 18 54 15 50 9 Z" fill="#ffd24a" />
        </g>
      )}

      {/* chassis + monitor stand */}
      <rect x={32} y={78} width={36} height={6} rx={3} fill="var(--surface-3)" />
      <rect x={45} y={73} width={10} height={8} fill="var(--surface-3)" />
      <rect
        x={16}
        y={20}
        width={68}
        height={58}
        rx={16}
        fill="var(--surface-2)"
        stroke="var(--border-strong)"
        strokeWidth={2}
      />
      {/* screen well */}
      <rect x={23} y={27} width={54} height={44} rx={11} fill="var(--inset)" />
      {/* status LED, lit in the mood color (hidden behind the flame on panic) */}
      {mood !== 'panic' && <circle cx={50} cy={16} r={2.4} fill={tint} />}

      {/* eyes */}
      <ellipse cx={39} cy={eye.cy} rx={8} ry={eye.ry} fill="var(--text)" />
      <ellipse cx={61} cy={eye.cy} rx={8} ry={eye.ry} fill="var(--text)" />
      <circle cx={39.7} cy={eye.cy + eye.py} r={eye.pr} fill={tint} />
      <circle cx={61.7} cy={eye.cy + eye.py} r={eye.pr} fill={tint} />
      {/* eye-shine sits on the pupil so it reads against the white sclera */}
      <circle cx={38.3} cy={eye.cy + eye.py - 1.4} r={1.3} fill="var(--text)" />
      <circle cx={60.3} cy={eye.cy + eye.py - 1.4} r={1.3} fill="var(--text)" />

      {/* worried brows for the unhappy moods (inner corners raised) */}
      {mood === 'concerned' && (
        <g stroke={tint} strokeWidth={2.4} strokeLinecap="round">
          <path d="M32 33 L45 30" />
          <path d="M55 30 L68 33" />
        </g>
      )}
      {mood === 'panic' && (
        <g stroke={tint} strokeWidth={2.6} strokeLinecap="round">
          <path d="M31 31.5 L45 27.5" />
          <path d="M55 27.5 L69 31.5" />
        </g>
      )}

      {/* waveform mouth: the FPS trace this mood is living through */}
      <g data-part="waveform">
        <polyline
          points={wave.points}
          fill="none"
          stroke={tint}
          strokeWidth={2.4}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx={wave.dotX} cy={wave.dotY} r={2.1} fill="#ff7a18" />
      </g>

      {/* a bead of sweat when merely concerned */}
      {mood === 'concerned' && (
        <path d="M76 44 C76 48 73 49 73 49 C73 49 70 48 70 44 C70 41 73 39 73 39 C73 39 76 41 76 44 Z" fill="var(--accent)" />
      )}
    </svg>
  );
}

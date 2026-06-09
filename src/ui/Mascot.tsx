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

// Per-mood geometry: eye openness, pupil vertical offset, pupil radius.
const EYE: Record<MascotMood, { ry: number; py: number; pr: number }> = {
  chill: { ry: 5.5, py: 0.5, pr: 3 },
  concerned: { ry: 7, py: 0.8, pr: 3 },
  panic: { ry: 8.4, py: -1.6, pr: 2.3 },
};

const MOUTH: Record<MascotMood, JSX.Element> = {
  chill: <path d="M41 60 Q50 66 59 60" fill="none" stroke="var(--text-dim)" strokeWidth={2.6} strokeLinecap="round" />,
  concerned: <path d="M43 63 Q50 60 57 63" fill="none" stroke="var(--text-dim)" strokeWidth={2.6} strokeLinecap="round" />,
  panic: <ellipse cx={50} cy={64} rx={5} ry={6.2} fill="var(--inset)" stroke="var(--bad)" strokeWidth={2} />,
};

// "WTFPS" mascot: a little monitor-creature whose face reports how the run went.
// chill = calm blue, concerned = amber + sweat, panic = red + an overheating flame.
export function Mascot({ mood, size = 116 }: MascotProps) {
  const tint = TINT[mood];
  const eye = EYE[mood];

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
      <ellipse cx={40} cy={47} rx={7} ry={eye.ry} fill="var(--text)" />
      <ellipse cx={60} cy={47} rx={7} ry={eye.ry} fill="var(--text)" />
      <circle cx={40} cy={47 + eye.py} r={eye.pr} fill={tint} />
      <circle cx={60} cy={47 + eye.py} r={eye.pr} fill={tint} />

      {/* worried brows for the unhappy moods (inner corners raised) */}
      {mood === 'concerned' && (
        <g stroke={tint} strokeWidth={2.4} strokeLinecap="round">
          <path d="M33 39 L45 36" />
          <path d="M55 36 L67 39" />
        </g>
      )}
      {mood === 'panic' && (
        <g stroke={tint} strokeWidth={2.6} strokeLinecap="round">
          <path d="M32 40 L45 34" />
          <path d="M55 34 L68 40" />
        </g>
      )}

      {MOUTH[mood]}

      {/* a bead of sweat when merely concerned */}
      {mood === 'concerned' && (
        <path d="M73 44 C73 48 70 49 70 49 C70 49 67 48 67 44 C67 41 70 39 70 39 C70 39 73 41 73 44 Z" fill="var(--accent)" />
      )}
    </svg>
  );
}

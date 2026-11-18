// The traditional metronome settings, so tempo moves in the steps players are used to
export const TEMPOS = [40, 42, 44, 46, 48, 50, 52, 54, 56, 58, 60, 63, 66, 69, 72, 76, 80, 84, 88, 92, 96, 100, 104, 108, 112, 116, 120, 126, 132, 138, 144, 152, 160];

/** The nearest metronome setting to a tempo. */
export function snapTempo(bpm: number): number {
  return TEMPOS.reduce((best, t) => (Math.abs(t - bpm) < Math.abs(best - bpm) ? t : best), TEMPOS[0]);
}

/** One setting faster (+1) or slower (-1), staying within the range. */
export function stepTempo(bpm: number, direction: 1 | -1): number {
  const i = TEMPOS.indexOf(snapTempo(bpm)) + direction;
  return TEMPOS[Math.max(0, Math.min(TEMPOS.length - 1, i))];
}

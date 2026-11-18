// Note and tuning maths for the guitar tuner. Notes are MIDI numbers (A4 = 69 = 440 Hz).

const A4_HZ = 440;
const NOTE_NAMES = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];

export const midiToFreq = (midi: number) => A4_HZ * 2 ** ((midi - 69) / 12);
export const noteName = (midi: number) => NOTE_NAMES[((midi % 12) + 12) % 12];
export const noteOctave = (midi: number) => Math.floor(midi / 12) - 1;
export const centsBetween = (freq: number, target: number) => 1200 * Math.log2(freq / target);

export interface Tuning {
  id: string;
  name: string;
  strings: number[]; // MIDI notes, lowest string first
}

// E2 A2 D3 G3 B3 E4 = 40 45 50 55 59 64
export const TUNINGS: Tuning[] = [
  { id: 'standard', name: 'Standard (E A D G B E)', strings: [40, 45, 50, 55, 59, 64] },
  { id: 'drop-d', name: 'Drop D (D A D G B E)', strings: [38, 45, 50, 55, 59, 64] },
  { id: 'half-down', name: 'Half step down (E♭)', strings: [39, 44, 49, 54, 58, 63] },
  { id: 'full-down', name: 'Full step down (D)', strings: [38, 43, 48, 53, 57, 62] },
  { id: 'dadgad', name: 'DADGAD', strings: [38, 45, 50, 55, 57, 62] },
  { id: 'open-g', name: 'Open G (D G D G B D)', strings: [38, 43, 50, 55, 59, 62] },
];

export interface TunerReading {
  stringIndex: number; // index into tuning.strings of the closest string
  targetMidi: number;
  freq: number;
  cents: number; // how far the played pitch is from that string; positive = sharp
}

/** Matches a detected frequency to the closest string of the tuning. */
export function readingFor(freq: number, tuning: Tuning): TunerReading {
  let best = 0;
  let bestCents = Infinity;
  tuning.strings.forEach((midi, i) => {
    const c = centsBetween(freq, midiToFreq(midi));
    if (Math.abs(c) < Math.abs(bestCents)) {
      best = i;
      bestCents = c;
    }
  });
  return { stringIndex: best, targetMidi: tuning.strings[best], freq, cents: bestCents };
}

export const IN_TUNE_CENTS = 5;

/** Search range for the pitch detector: a little beyond the lowest and highest string. */
export function tuningRange(tuning: Tuning): { min: number; max: number } {
  const lo = midiToFreq(Math.min(...tuning.strings));
  const hi = midiToFreq(Math.max(...tuning.strings));
  // Capping the top at 1.5x the highest string keeps its 2nd harmonic out of range
  return { min: lo * 0.75, max: hi * 1.5 };
}

/**
 * Folds a detected frequency by whole octaves onto the nearest string. Guitars often have a weak
 * fundamental, so detectors read a low E an octave high (or a high E an octave low) and the
 * needle would flip between notes. A pitch already within 60 cents of a string is left alone.
 *
 * A pitch between two strings an octave apart (E3 sits between E2 and E4) fits both. `hint` is
 * the note currently shown, and wins that tie; without one, the lower note is assumed because a
 * weak fundamental on a low string is the usual cause.
 */
export function snapToTuning(freq: number, tuning: Tuning, hint: number | null = null): number {
  const nearest = (f: number) => Math.abs(readingFor(f, tuning).cents);
  if (nearest(freq) <= 60) return freq;

  const fits = [freq / 2, freq * 2].map((f) => ({ f, c: nearest(f) })).filter((x) => x.c <= 60);
  if (fits.length === 0) return freq;
  const bestCents = Math.min(...fits.map((x) => x.c));
  const ties = fits.filter((x) => x.c - bestCents <= 15);
  if (hint) ties.sort((a, b) => Math.abs(Math.log2(a.f / hint)) - Math.abs(Math.log2(b.f / hint)));
  else ties.sort((a, b) => a.f - b.f);
  return ties[0].f;
}

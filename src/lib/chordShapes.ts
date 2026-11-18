// Guitar fingerings for chord names. A shape lists the fret for each string from low E to high e
// (-1 = not played). Common open chords are listed by hand; everything else is built by sliding
// an E-form or A-form barre chord to the right fret.

export type Shape = number[];

export const OPEN_STRINGS = [40, 45, 50, 55, 59, 64]; // MIDI notes of E2 A2 D3 G3 B3 E4

const SEMI: Record<string, number> = { C: 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4, F: 5, 'F#': 6, Gb: 6, G: 7, 'G#': 8, Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11 };
const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

type Quality = '' | 'm' | '7' | 'm7' | 'maj7' | 'sus4' | 'sus2' | 'dim' | '6' | 'add9';

// Hand-picked open shapes, keyed by root (sharp spelling) + quality
const OPEN: Record<string, Shape> = {
  C: [-1, 3, 2, 0, 1, 0],
  C7: [-1, 3, 2, 3, 1, 0],
  Cmaj7: [-1, 3, 2, 0, 0, 0],
  Cadd9: [-1, 3, 2, 0, 3, 0],
  D: [-1, -1, 0, 2, 3, 2],
  Dm: [-1, -1, 0, 2, 3, 1],
  D7: [-1, -1, 0, 2, 1, 2],
  Dm7: [-1, -1, 0, 2, 1, 1],
  Dmaj7: [-1, -1, 0, 2, 2, 2],
  Dsus2: [-1, -1, 0, 2, 3, 0],
  Dsus4: [-1, -1, 0, 2, 3, 3],
  G: [3, 2, 0, 0, 0, 3],
  G7: [3, 2, 0, 0, 0, 1],
  Gmaj7: [3, 2, 0, 0, 0, 2],
  Fmaj7: [-1, -1, 3, 2, 1, 0],
};

// Movable forms: offsets from the barre fret. E-form has its root on the low E string, A-form on the A string.
const E_FORM: Partial<Record<Quality, Shape>> = {
  '': [0, 2, 2, 1, 0, 0],
  m: [0, 2, 2, 0, 0, 0],
  '7': [0, 2, 0, 1, 0, 0],
  m7: [0, 2, 0, 0, 0, 0],
  maj7: [0, 2, 1, 1, 0, 0],
  sus4: [0, 2, 2, 2, 0, 0],
  sus2: [0, 2, 4, 4, 0, 0],
  '6': [0, 2, 2, 1, 2, 0],
  add9: [0, 2, 2, 1, 0, 2],
};
const A_FORM: Partial<Record<Quality, Shape>> = {
  '': [-1, 0, 2, 2, 2, 0],
  m: [-1, 0, 2, 2, 1, 0],
  '7': [-1, 0, 2, 0, 2, 0],
  m7: [-1, 0, 2, 0, 1, 0],
  maj7: [-1, 0, 2, 1, 2, 0],
  sus4: [-1, 0, 2, 2, 3, 0],
  sus2: [-1, 0, 2, 2, 0, 0],
  dim: [-1, 0, 1, 2, 1, -1],
  '6': [-1, 0, 2, 2, 2, 2],
  add9: [-1, 0, 2, 4, 2, 0],
};

/** Maps the many ways of writing a chord quality onto the ones we have shapes for. */
export function normalizeQuality(q: string): Quality {
  if (/^(maj|Maj|M|Δ)(7|9|11|13)/.test(q)) return 'maj7';
  if (/^(m|min|-)(7|9|11|13)/.test(q)) return 'm7';
  if (/^dim/.test(q)) return 'dim';
  if (/^(m|min|-)(?!aj)/.test(q)) return 'm';
  if (/^(7|9|11|13)/.test(q)) return '7';
  if (/^sus2/.test(q)) return 'sus2';
  if (/^sus/.test(q)) return 'sus4';
  if (/^6/.test(q)) return '6';
  if (/^(add9|add2|2)/.test(q)) return 'add9';
  return ''; // plain, power chords, augmented and anything unfamiliar
}

/** The fingering for a chord such as "F#m7" or "G/B" (the bass note is ignored), or null for something that isn't a chord. */
export function chordShape(chord: string): Shape | null {
  const m = chord.trim().match(/^([A-G][#b]?)([^/]*)(?:\/.*)?$/);
  if (!m) return null;
  const root = SEMI[m[1]];
  if (root === undefined) return null;
  const quality = normalizeQuality(m[2]);

  const open = OPEN[`${NAMES[root]}${quality}`];
  if (open) return open;

  const candidates: Shape[] = [];
  const e = E_FORM[quality];
  const a = A_FORM[quality];
  if (e) candidates.push(slide(e, (root - 4 + 12) % 12));
  if (a) candidates.push(slide(a, (root - 9 + 12) % 12));
  candidates.sort((x, y) => Math.max(...x) - Math.max(...y)); // the one lower on the neck
  return candidates[0] ?? null;
}

const slide = (form: Shape, fret: number): Shape => form.map((f) => (f < 0 ? -1 : f + fret));

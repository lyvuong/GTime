// Fills: a few notes that replace the end of a bar and lead into the next chord. All rule-based:
// the key is worked out from the chords, and each style picks its notes from that key.
import { OPEN_STRINGS, parseChord, type Shape } from './chordShapes.ts';

export type FillStyle = 'none' | 'bass-run' | 'approach' | 'hammer' | 'lick';
export type FillWhere = 'end' | 'every'; // only at the end of the loop, or at every chord change

export interface FillOptions {
  style: FillStyle;
  where: FillWhere;
  keyHint?: string; // the key written on the sheet, if any
  bars?: Set<number>; // for a whole song: exactly which bars get a fill (the song does not loop back to its start)
}

export const FILLS: { id: FillStyle; name: string; desc: string }[] = [
  { id: 'none', name: 'No fill', desc: 'Play the rhythm as it is, with no extra notes.' },
  {
    id: 'bass-run',
    name: 'Bass run',
    desc: 'The bass walks step by step through the key from one chord to the next. G to C becomes G, A, B, C. A classic way to join two chords.',
  },
  {
    id: 'approach',
    name: 'Approach note',
    desc: 'A single bass note a half step below (or above) the next chord\'s bass note, so it leans into the chord. Subtle, and very common in folk and bolero.',
  },
  {
    id: 'hammer',
    name: 'Chord hammer',
    desc: 'A hammer-on and pull-off on one string of the chord, like D to Dsus4 and back. It adds movement without leaving the chord.',
  },
  {
    id: 'lick',
    name: 'Melodic lick',
    desc: 'Two or three high notes from the key\'s pentatonic scale, falling or rising into the next chord. Use it at the end of a phrase.',
  },
];

export interface KeyInfo {
  root: number; // 0 = C ... 11 = B
  minor: boolean;
}

const MAJOR = [0, 2, 4, 5, 7, 9, 11];
const MINOR = [0, 2, 3, 5, 7, 8, 10];
const MAJOR_CHORDS = ['maj', 'min', 'min', 'maj', 'maj', 'min', 'min']; // I ii iii IV V vi vii°
const MINOR_CHORDS = ['min', 'min', 'maj', 'min', 'min', 'maj', 'maj']; // i ii° III iv v VI VII
const PENT_MAJOR = [0, 2, 4, 7, 9];
const PENT_MINOR = [0, 3, 5, 7, 10];

const pc = (n: number) => ((n % 12) + 12) % 12;
const isMinorQuality = (q: string) => q === 'm' || q === 'm7' || q === 'dim';

/** The most likely key for a set of chords: how many fit it, plus a nudge for starting or ending on its home chord. */
export function guessKey(chords: string[], hint?: string): KeyInfo {
  const parsed = chords.flatMap((c) => parseChord(c) ?? []);
  if (parsed.length === 0) return { root: 0, minor: false };
  const hinted = hint ? parseChord(hint) : null;
  let best: KeyInfo = { root: 0, minor: false };
  let bestScore = -Infinity;
  for (let root = 0; root < 12; root++) {
    for (const minor of [false, true]) {
      const degrees = minor ? MINOR : MAJOR;
      const expected = minor ? MINOR_CHORDS : MAJOR_CHORDS;
      let score = 0;
      for (const c of parsed) {
        const d = degrees.indexOf(pc(c.root - root));
        if (d < 0) continue;
        score += 1;
        if ((expected[d] === 'min') === isMinorQuality(c.quality)) score += 1;
        else if (minor && d === 4) score += 0.5; // the major V of a minor key is normal
      }
      if (parsed[0].root === root) score += 0.6;
      if (parsed[parsed.length - 1].root === root) score += 0.4;
      if (hinted && hinted.root === root && isMinorQuality(hinted.quality) === minor) score += 2;
      if (score > bestScore) {
        bestScore = score;
        best = { root, minor };
      }
    }
  }
  return best;
}

const inScale = (k: KeyInfo, midi: number) => (k.minor ? MINOR : MAJOR).includes(pc(midi - k.root));
const inPent = (k: KeyInfo, midi: number) => (k.minor ? PENT_MINOR : PENT_MAJOR).includes(pc(midi - k.root));

/** The pitch of the lowest string a shape plays: its bass note. */
export function bassMidi(shape: Shape): number {
  const s = shape.findIndex((f) => f >= 0);
  return OPEN_STRINGS[s] + shape[s];
}

export interface FillNote {
  string: number; // 0 = low E ... 5 = high e
  fret: number;
}

// A bass note goes where it is lowest on the neck; a high note goes on the thinnest string it fits
function locateBass(midi: number): FillNote | null {
  let best: FillNote | null = null;
  for (let s = 0; s < 6; s++) {
    const fret = midi - OPEN_STRINGS[s];
    if (fret >= 0 && fret <= 12 && (!best || fret < best.fret)) best = { string: s, fret };
  }
  return best;
}
function locateTreble(midi: number): FillNote | null {
  for (let s = 5; s >= 0; s--) {
    const fret = midi - OPEN_STRINGS[s];
    if (fret >= 0 && fret <= 15) return { string: s, fret };
  }
  return null;
}
const keep = (notes: (FillNote | null)[]) => notes.filter((n): n is FillNote => n !== null);

export interface FillContext {
  chord: string;
  next: string | null; // the chord that follows
  shape: Shape;
  nextShape: Shape | null;
  key: KeyInfo;
  slots: number; // how many slots make up the last beat of the bar
  bar: number;
}

function bassRun(c: FillContext): FillNote[] {
  if (!c.nextShape) return [];
  const from = bassMidi(c.shape);
  const to = bassMidi(c.nextShape);
  if (from === to) return [];
  const step = to > from ? 1 : -1;
  const between: number[] = [];
  for (let p = from + step; p !== to; p += step) if (inScale(c.key, p)) between.push(p);
  if (between.length === 0) return approach(c); // neighbours in the scale: nothing to walk through
  return keep(between.slice(-c.slots).map(locateBass));
}

function approach(c: FillContext): FillNote[] {
  if (!c.nextShape) return [];
  const from = bassMidi(c.shape);
  const to = bassMidi(c.nextShape);
  if (from === to) return [];
  const note = to + (to > from ? -1 : 1); // from below when going up, from above when going down
  return note === from ? [] : keep([locateBass(note)]);
}

function hammer(c: FillContext): FillNote[] {
  const chord = parseChord(c.chord);
  if (!chord) return [];
  const minor = isMinorQuality(chord.quality);
  const third = pc(chord.root + (minor ? 3 : 4));
  // The thinnest string that plays the chord's third
  let string = -1;
  for (let s = 0; s < 6; s++) if (c.shape[s] >= 0 && pc(OPEN_STRINGS[s] + c.shape[s]) === third) string = s;
  if (string < 0) return []; // sus and power chords have no third to move
  const fret = c.shape[string];
  // A major third rises to the 4th (sus4); a minor third drops to the 2nd (sus2), or rises if it is an open string
  const moved = fret + (minor ? (fret >= 1 ? -1 : 2) : 1);
  return [
    { string, fret: moved },
    { string, fret },
  ];
}

function lick(c: FillContext): FillNote[] {
  if (!c.next || !c.nextShape) return [];
  const next = parseChord(c.next);
  if (!next) return [];
  const pent: number[] = [];
  for (let m = 48; m <= 90; m++) if (inPent(c.key, m)) pent.push(m);

  // Aim for a note of the next chord that the key's pentatonic scale contains, near the chord's root in the treble
  let aim = 60 + next.root;
  if (aim < 62) aim += 12;
  const tones = [next.root, next.root + (isMinorQuality(next.quality) ? 3 : 4), next.root + 7].map(pc);
  const pool = pent.filter((m) => m >= 57 && m <= 84);
  const chordTones = pool.filter((m) => tones.includes(pc(m)));
  const candidates = chordTones.length ? chordTones : pool;
  const target = candidates.reduce((best, m) => (Math.abs(m - aim) < Math.abs(best - aim) ? m : best), candidates[0]);
  const at = pent.indexOf(target);
  const count = Math.min(c.slots, 3);
  const falling = c.bar % 2 === 0; // alternate so repeated fills don't all sound the same
  const midis = falling ? pent.slice(at + 1, at + 1 + count).reverse() : pent.slice(Math.max(0, at - count), at);
  return keep(midis.map(locateTreble));
}

/** The notes of a fill, in time order. They fill the last slots of the bar, and may be fewer than the slots offered. */
export function fillNotes(style: FillStyle, c: FillContext): FillNote[] {
  switch (style) {
    case 'bass-run': return bassRun(c);
    case 'approach': return approach(c);
    case 'hammer': return hammer(c);
    case 'lick': return lick(c);
    default: return [];
  }
}

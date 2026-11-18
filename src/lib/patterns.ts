// Picking and strumming patterns that turn a chord into notes, plus a plain-text tab of the result.
import { chordShape, OPEN_STRINGS, type Shape } from './chordShapes.ts';

// Picked patterns name a string by role; strums use all the strings.
//   B = lowest played string   A = next one up   M1 / M2 = middle strings   T = highest played string
//   D = down-strum             U = up-strum (top strings only)
export type Token = 'B' | 'A' | 'M1' | 'M2' | 'T' | 'D' | 'U';

export interface Pattern {
  id: string;
  name: string;
  kind: 'pick' | 'strum';
  steps: (Token | null)[]; // one slot per eighth note in the bar
}

const P8: Pattern[] = [
  { id: 'arpeggio', name: 'Arpeggio', kind: 'pick', steps: ['B', 'M1', 'M2', 'T', 'M2', 'M1', 'M2', 'M1'] },
  { id: 'alt-bass', name: 'Alternating bass', kind: 'pick', steps: ['B', 'T', 'A', 'M2', 'B', 'T', 'A', 'M2'] },
  { id: 'slow-arp', name: 'Slow arpeggio', kind: 'pick', steps: ['B', null, 'M1', null, 'M2', null, 'T', null] },
  { id: 'pop-strum', name: 'Pop strum', kind: 'strum', steps: ['D', null, 'D', 'U', null, 'U', 'D', 'U'] },
  { id: 'steady-strum', name: 'Steady strum', kind: 'strum', steps: ['D', 'U', 'D', 'U', 'D', 'U', 'D', 'U'] },
  { id: 'down-strum', name: 'Down strum', kind: 'strum', steps: ['D', null, 'D', null, 'D', null, 'D', null] },
];

// Waltz and 6/8 feel: six eighth notes per bar
const P6: Pattern[] = [
  { id: 'arpeggio', name: 'Arpeggio', kind: 'pick', steps: ['B', 'M1', 'M2', 'T', 'M2', 'M1'] },
  { id: 'slow-arp', name: 'Slow arpeggio', kind: 'pick', steps: ['B', null, 'M2', null, 'T', null] },
  { id: 'waltz-strum', name: 'Waltz strum', kind: 'strum', steps: ['D', null, 'D', 'U', 'D', 'U'] },
  { id: 'down-strum', name: 'Down strum', kind: 'strum', steps: ['D', null, 'D', null, 'D', null] },
];

/** The patterns that fit a time signature such as "4/4" or "6/8" (4/4 when it isn't known). */
export function patternsFor(time?: string): Pattern[] {
  return /^\s*(3\/4|6\/8|3\/8|9\/8|12\/8)/.test(time ?? '') ? P6 : P8;
}

export interface NoteEvent {
  bar: number;
  step: number; // eighth note within the bar
  order: number; // position within a strum, so the strings can be spread slightly
  string: number; // 0 = low E ... 5 = high e
  fret: number;
  midi: number; // sounding pitch, with the capo
  gain: number;
}

export interface Phrase {
  events: NoteEvent[];
  stepsPerBar: number;
  bars: number;
  shapes: (Shape | null)[]; // the fingering used for each bar
}

function stringFor(token: Token, played: number[]): number {
  const n = played.length;
  switch (token) {
    case 'B': return played[0];
    case 'A': return played[Math.min(1, n - 1)];
    case 'T': return played[n - 1];
    case 'M2': return played[Math.max(0, n - 2)];
    case 'M1': return played[Math.max(0, n - 3)];
    default: return played[0];
  }
}

/** One bar per chord, repeated `repeat` times, played with the pattern. */
export function buildPhrase(chords: string[], pattern: Pattern, repeat = 1, capo = 0): Phrase {
  const sequence = Array.from({ length: Math.max(1, repeat) }, () => chords).flat();
  const shapes = sequence.map((c) => chordShape(c));
  const events: NoteEvent[] = [];

  shapes.forEach((shape, bar) => {
    if (!shape) return; // not a chord: that bar rests
    const played = shape.flatMap((f, s) => (f >= 0 ? [s] : []));
    const note = (step: number, order: number, s: number, gain: number): NoteEvent => ({
      bar, step, order, string: s, fret: shape[s], midi: OPEN_STRINGS[s] + shape[s] + capo, gain,
    });
    pattern.steps.forEach((token, step) => {
      if (!token) return;
      if (token === 'D') played.forEach((s, i) => events.push(note(step, i, s, step % 2 === 0 ? 0.32 : 0.26)));
      else if (token === 'U') played.slice(-3).reverse().forEach((s, i) => events.push(note(step, i, s, 0.2)));
      else events.push(note(step, 0, stringFor(token, played), token === 'B' ? 0.5 : 0.38));
    });
  });
  return { events, stepsPerBar: pattern.steps.length, bars: sequence.length, shapes };
}

export interface TabBar {
  chord: string;
  marks: string; // strum direction markers above the staff
  rows: string[]; // high e first, then B G D A E
}

const CELL = 3;

/** Plain-text guitar tab of one pass through the chords. */
export function tabBars(chords: string[], pattern: Pattern): TabBar[] {
  const phrase = buildPhrase(chords, pattern);
  return chords.map((chord, bar) => {
    const cells: string[][] = Array.from({ length: 6 }, () => Array(pattern.steps.length).fill(''));
    for (const e of phrase.events) if (e.bar === bar) cells[e.string][e.step] = String(e.fret);
    const rows = [5, 4, 3, 2, 1, 0].map((s) => cells[s].map((c) => c.padEnd(CELL, '-')).join(''));
    const marks = pattern.steps.map((t) => (t === 'D' ? '↓' : t === 'U' ? '↑' : '').padEnd(CELL, ' ')).join('');
    return { chord, marks, rows };
  });
}

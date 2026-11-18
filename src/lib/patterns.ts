// Picking patterns and rhythm styles that turn a chord into notes, plus a plain-text tab of the result.
// The rhythms are simplified guitar versions of the usual accompaniment for each style.
import { chordShape, OPEN_STRINGS, type Shape } from './chordShapes.ts';
import type { BassEvent } from './bass.ts';
import type { DrumEvent } from './drums.ts';
import { fillNotes, guessKey, type FillOptions } from './fills.ts';

// Picked patterns name a string by role; strums and rhythms use several strings.
//   B = lowest played string   A = next one up   M1 / M2 = middle strings   T = highest played string
//   D = down-strum, all strings   C = down-strum on the upper strings (a "chick" without the bass)
//   U = up-strum, top three strings
export type Token = 'B' | 'A' | 'M1' | 'M2' | 'T' | 'D' | 'C' | 'U';

export interface Pattern {
  id: string;
  name: string;
  kind: 'pick' | 'strum';
  beats: number; // beats per bar (4 for 4/4 and 12/8, 3 for 3/4)
  steps: (Token | null)[]; // evenly spaced slots across the bar
  bpm: number; // a comfortable starting tempo for the style
  desc: string; // what it sounds like, for the rhythm guide
  meter?: string; // shown when it isn't plain 4/4
}

const p = (id: string, name: string, kind: Pattern['kind'], beats: number, bpm: number, steps: (Token | null)[], desc: string, meter?: string): Pattern => ({ id, name, kind, beats, bpm, steps, desc, meter });

export const PATTERNS: Pattern[] = [
  // Picking
  p('arpeggio', 'Arpeggio', 'pick', 4, 80, ['B', 'M1', 'M2', 'T', 'M2', 'M1', 'M2', 'M1'],
    'The chord picked one string at a time, bass first, rising to the top and back down. Soft and flowing, so it suits gentle ballads and quiet intros.'),
  p('alt-bass', 'Alternating bass', 'pick', 4, 90, ['B', 'T', 'A', 'M2', 'B', 'T', 'A', 'M2'],
    'Low bass notes alternate with the high strings, like a fingerstyle "boom-chick". Busier and more folk-like than a plain arpeggio.'),
  p('slow-arp', 'Slow arpeggio', 'pick', 4, 70, ['B', null, 'M1', null, 'M2', null, 'T', null],
    'One note per beat, climbing from the bass to the top string. Very sparse and calm, and it leaves plenty of room for the voice.'),
  p('slow-rock-arp', 'Slow Rock arpeggio', 'pick', 4, 60, ['B', 'M1', 'M2', 'T', 'M2', 'M1', 'B', 'M1', 'M2', 'T', 'M2', 'M1'],
    'An arpeggio in triplets: every beat holds three notes, which gives the rolling, swaying feel of a slow romantic song.', '12/8'),
  p('waltz-arp', 'Waltz arpeggio', 'pick', 3, 90, ['B', 'M1', 'M2', 'T', 'M2', 'M1'],
    'Six notes to a bar in three-time: the bass on beat 1, then a gentle roll up and back. A soft waltz.', '3/4'),
  // Strums
  p('pop-strum', 'Pop strum', 'strum', 4, 90, ['D', null, 'D', 'U', null, 'U', 'D', 'U'],
    'Down strokes on the beats with a few up strokes in between: the familiar all-purpose strum for singing along.'),
  p('steady-strum', 'Steady strum', 'strum', 4, 90, ['D', 'U', 'D', 'U', 'D', 'U', 'D', 'U'],
    'Down and up on every eighth note without a break. Driving and energetic, good for livelier songs.'),
  p('down-strum', 'Down strum', 'strum', 4, 80, ['D', null, 'D', null, 'D', null, 'D', null],
    'One firm down stroke on every beat. The simplest pattern, handy for learning the chord changes.'),
  // Rhythm styles
  p('ballad', 'Ballad', 'strum', 4, 70, ['B', null, 'C', 'U', null, 'U', 'C', 'U'],
    'A low bass note on beat 1, then lighter chord strokes with soft up strokes. Warm and relaxed, a common choice for slow love songs.'),
  p('bolero', 'Bolero', 'strum', 4, 72, ['B', null, 'C', 'C', 'A', null, 'C', 'C'],
    'Bass on beats 1 and 3, each answered by two quick chord hits: "boom, chick-chick, boom, chick-chick". Slow, steady and swaying, the classic feel of Vietnamese bolero.'),
  p('slow-rock', 'Slow Rock', 'strum', 4, 60, ['B', null, 'U', 'C', null, 'U', 'A', null, 'U', 'C', null, 'U'],
    'Every beat is split into three (a triplet), so the strum rolls along like a slow waltz inside four-time. Gentle and romantic.', '12/8'),
  p('bossa-nova', 'Bossa Nova', 'strum', 4, 110, ['B', 'C', null, 'C', 'A', null, null, 'C'],
    'Bass on beats 1 and 3 while the chords land in between the beats, which makes it lightly bounce. Keep it soft and a little faster.'),
  p('rumba', 'Rumba', 'strum', 4, 92, ['B', null, 'C', 'U', 'A', null, 'C', 'U'],
    'Bass on 1 and 3, each followed by a chord hit and a small up stroke. Smooth and flowing, a relaxed Latin ballad groove.'),
  p('cha-cha', 'Cha Cha', 'strum', 4, 112, ['B', null, 'C', null, 'C', null, 'C', 'C'],
    'A steady beat that finishes the bar with the quick "cha-cha-cha" on beat 4 and its "and". Bright and danceable.'),
  p('tango', 'Tango (ballroom)', 'strum', 4, 120, ['B', null, 'C', null, 'A', null, 'C', null],
    'The marcato of a ballroom tango: a firm, detached hit on every beat, with the low bass note on the strong beats 1 and 3 and a sharp chord on 2 and 4. Play each hit staccato, stopping it short, and keep it strict and driving. With drums on, a rapid snare roll on the "and" of 4 leads into the next bar, as in International-style ballroom tango.'),
  p('tango-sync', 'Tango (syncopated)', 'strum', 4, 116, ['B', null, null, 'C', null, null, 'C', null],
    'The syncopated Argentine tango: the hits fall in a long-long-short grouping of eighth notes (three, three, two) instead of on the beats, so the rhythm leans forward and pulls against the pulse. Bass on 1, then two sharp chord hits. Short and crisp.'),
  p('blues', 'Blues shuffle', 'strum', 4, 72, ['B', null, 'C', 'A', null, 'C', 'B', null, 'C', 'A', null, 'C'],
    'A swung triplet shuffle: bass notes alternate with chord hits and the long-short rhythm gives a lazy, rolling swing.', '12/8'),
  p('valse', 'Valse', 'strum', 3, 100, ['B', null, 'C', null, 'C', null],
    'The waltz "oom-pah-pah": bass on beat 1, chords on beats 2 and 3. Elegant and dance-like.', '3/4'),
  p('boston', 'Boston', 'strum', 3, 80, ['B', null, 'C', 'U', 'C', 'U'],
    'A slow waltz: like Valse, but with soft up strokes after the chord hits, so it sways for longer. Good for tender songs in three-time.', '3/4'),
];

const isTriple = (time?: string) => /^\s*(3\/4|6\/8|3\/8|9\/8)/.test(time ?? '');

/** Every pattern, with the ones that fit the song's time signature first (4/4 when it isn't known). */
export function patternsFor(time?: string): Pattern[] {
  const beats = isTriple(time) ? 3 : 4;
  return [...PATTERNS.filter((x) => x.beats === beats), ...PATTERNS.filter((x) => x.beats !== beats)];
}

/** What to count under each slot of a bar: "1 & 2 & ..." for eighths, "1 la li 2 ..." for triplets. */
export function countLabels(pattern: Pattern): string[] {
  const perBeat = pattern.steps.length / pattern.beats;
  return pattern.steps.map((_, i) => {
    const beat = Math.floor(i / perBeat) + 1;
    const within = i % perBeat;
    if (within === 0) return String(beat);
    return perBeat === 3 ? (within === 1 ? 'la' : 'li') : '&';
  });
}

/** A short mark for what happens in a slot of the rhythm guide. */
export function strokeGlyph(token: Token | null): string {
  switch (token) {
    case null: return '·';
    case 'B': return 'B';
    case 'A': return 'b';
    case 'D': case 'C': return '↓';
    case 'U': return '↑';
    case 'M1': return '3';
    case 'M2': return '2';
    case 'T': return '1';
  }
}

export interface NoteEvent {
  bar: number;
  step: number; // slot within the bar
  order: number; // position within a strum, so the strings can be spread slightly
  string: number; // 0 = low E ... 5 = high e
  fret: number;
  midi: number; // sounding pitch, with the capo
  gain: number;
  fill?: boolean; // part of a fill rather than the pattern
}

export interface Phrase {
  events: NoteEvent[];
  stepsPerBar: number;
  beats: number; // beats per bar
  bars: number;
  shapes: (Shape | null)[]; // the fingering used for each bar
  drums?: DrumEvent[]; // the drum part, when there is one (see drums.ts)
  bass?: BassEvent[]; // the bass part, when there is one (see bass.ts)
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

/** One bar per chord, repeated `repeat` times, played with the pattern, optionally with a fill leading into each next chord. */
export function buildPhrase(chords: string[], pattern: Pattern, repeat = 1, capo = 0, fill?: FillOptions): Phrase {
  const sequence = Array.from({ length: Math.max(1, repeat) }, () => chords).flat();
  const shapes = sequence.map((c) => chordShape(c));
  const events: NoteEvent[] = [];
  const key = fill && fill.style !== 'none' ? guessKey(chords, fill.keyHint) : null;
  // A fill goes in the last beat; a long (song) fill gets the last half of the bar
  const slotsPerBeat = fill?.long ? Math.round(pattern.steps.length / 2) : Math.round(pattern.steps.length / pattern.beats);

  shapes.forEach((shape, bar) => {
    if (!shape) return; // not a chord: that bar rests
    const played = shape.flatMap((f, s) => (f >= 0 ? [s] : []));
    const note = (step: number, order: number, s: number, gain: number): NoteEvent => ({
      bar, step, order, string: s, fret: shape[s], midi: OPEN_STRINGS[s] + shape[s] + capo, gain,
    });

    // A fill takes over the last slots of the bar; the earlier slots keep the pattern
    const song = Boolean(fill?.bars); // a whole song ends instead of looping back to its first chord
    const atEnd = fill?.bars ? fill.bars.has(bar) : fill?.where === 'every' || bar % chords.length === chords.length - 1;
    const nextIndex = (bar + 1) % sequence.length;
    const fillRun =
      fill && key && atEnd && !(song && bar + 1 >= sequence.length)
        ? fillNotes(fill.style, { chord: sequence[bar], next: sequence[nextIndex], shape, nextShape: shapes[nextIndex], key, slots: slotsPerBeat, bar, long: fill.long })
        : [];
    const firstFillStep = pattern.steps.length - fillRun.length;

    pattern.steps.forEach((token, step) => {
      if (step >= firstFillStep && fillRun.length > 0) return; // replaced by the fill
      if (!token) return;
      if (token === 'D') played.forEach((s, i) => events.push(note(step, i, s, step % 2 === 0 ? 0.32 : 0.26)));
      else if (token === 'C') played.slice(-Math.min(4, played.length - 1)).forEach((s, i) => events.push(note(step, i, s, 0.28)));
      else if (token === 'U') played.slice(-3).reverse().forEach((s, i) => events.push(note(step, i, s, 0.2)));
      else events.push(note(step, 0, stringFor(token, played), token === 'B' ? 0.5 : token === 'A' ? 0.42 : 0.38));
    });

    fillRun.forEach((n, i) => {
      events.push({
        bar, step: firstFillStep + i, order: 0, string: n.string, fret: n.fret,
        midi: OPEN_STRINGS[n.string] + n.fret + capo, gain: fill?.style === 'lick' ? 0.42 : 0.5, fill: true,
      });
    });
  });
  return { events, stepsPerBar: pattern.steps.length, beats: pattern.beats, bars: sequence.length, shapes };
}

export interface TabBar {
  chord: string;
  marks: string; // strum direction markers above the staff
  rows: string[]; // high e first, then B G D A E
}

const CELL = 3;

/** Plain-text guitar tab of one pass through the chords. */
export function tabBars(chords: string[], pattern: Pattern, fill?: FillOptions): TabBar[] {
  const phrase = buildPhrase(chords, pattern, 1, 0, fill);
  return chords.map((chord, bar) => {
    const cells: string[][] = Array.from({ length: 6 }, () => Array(pattern.steps.length).fill(''));
    const fillSteps = new Set<number>();
    for (const e of phrase.events) {
      if (e.bar !== bar) continue;
      cells[e.string][e.step] = String(e.fret);
      if (e.fill) fillSteps.add(e.step);
    }
    const rows = [5, 4, 3, 2, 1, 0].map((s) => cells[s].map((c) => c.padEnd(CELL, '-')).join(''));
    // Strum arrows above the staff; a wavy mark shows where a fill takes over
    const mark = (t: Token | null, step: number) => (fillSteps.has(step) ? '~' : t === 'D' || t === 'C' ? '↓' : t === 'U' ? '↑' : '');
    const marks = pattern.steps.map((t, step) => mark(t, step).padEnd(CELL, ' ')).join('');
    return { chord, marks, rows };
  });
}

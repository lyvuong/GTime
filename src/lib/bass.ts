// A bass line for a phrase: roots and fifths of the chords, in the pattern that suits each rhythm,
// on the same grid of steps as the guitar and the drums so all three lock together.
import type { Pattern, Phrase } from './patterns.ts';
import type { SongTiming } from './songTiming.ts';

export interface BassEvent {
  bar: number;
  step: number;
  midi: number;
  steps: number; // how many steps the note is held for
  gain: number;
}

// A chord, or part of one, lying inside a bar: steps [from, to)
export interface BassSegment {
  bar: number;
  from: number;
  to: number;
  chord: string;
}

const NOTE_PC: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/** The note a chord's bass plays, 0 = C to 11 = B: the note after a slash (G/B is B) or the root. Null if it isn't a chord. */
export function bassPitchClass(chord: string): number | null {
  const m = chord.trim().match(/^([A-G])([#b]?)([^/]*)(?:\/([A-G])([#b]?))?/);
  if (!m) return null;
  const pc = (letter: string, accidental: string) => (NOTE_PC[letter] + (accidental === '#' ? 1 : accidental === 'b' ? -1 : 0) + 12) % 12;
  return m[4] ? pc(m[4], m[5]) : pc(m[1], m[2]);
}

// Bass notes live in a low range that small speakers can still reproduce (the voices add upper harmonics too)
const LOW = 31; // G1
const HIGH = 42; // F#2
function lowNote(pc: number): number {
  let midi = pc + 24;
  while (midi < LOW) midi += 12;
  while (midi > HIGH) midi -= 12;
  return midi;
}
const fifthOf = (root: number) => (root + 7 <= HIGH + 2 ? root + 7 : root - 5);

// One character per step. R = root, 5 = fifth, 8 = octave, "." = rest. A note lasts until the next one.
const EIGHTHS: Record<string, string> = {
  arpeggio: 'R...5...',
  'alt-bass': 'R...5...',
  'slow-arp': 'R.......',
  'pop-strum': 'R.R.5.R.',
  'steady-strum': 'R.R.R.R.',
  'down-strum': 'R...R...',
  ballad: 'R.......',
  bolero: 'R...5...',
  'bossa-nova': 'R..5R..5',
  rumba: 'R..R.5..',
  'cha-cha': 'R...5.R.',
  tango: 'R.5.R.5.',
  'tango-sync': 'R..5..R.',
};
const GROOVES: Record<string, string> = {
  ...EIGHTHS,
  'slow-rock-arp': 'R.....5.....',
  'slow-rock': 'R.....5.....',
  blues: 'R..5..8..5..',
  'waltz-arp': 'R.....',
  valse: 'R.....',
  boston: 'R...5.',
};
const SHORT = new Set(['tango', 'tango-sync', 'steady-strum']); // played short and crisp

/** Bass segments for an intro or loop: one chord per bar, repeated. */
export function loopSegments(chords: string[], repeat: number, stepsPerBar: number): BassSegment[] {
  const out: BassSegment[] = [];
  const sequence = Array.from({ length: Math.max(1, repeat) }, () => chords).flat();
  sequence.forEach((chord, bar) => out.push({ bar, from: 0, to: stepsPerBar, chord }));
  return out;
}

/** Bass segments for a whole song, from its timing (a bar can hold more than one chord). */
export function songSegments(timing: SongTiming, stepsPerBar: number): BassSegment[] {
  return timing.segments.map((s) => ({
    bar: s.bar,
    from: Math.round((s.from / 4) * stepsPerBar),
    to: Math.round((s.to / 4) * stepsPerBar),
    chord: s.chord,
  }));
}

/**
 * Adds a bass part. Where the guitar has a fill, the bass walks to the next chord's root instead. The held
 * last bar (`holdBar`) gets one long root note.
 */
export function addBass(phrase: Phrase, pattern: Pattern, segments: BassSegment[], on: boolean, opts: { holdBar?: number } = {}): Phrase {
  if (!on || phrase.bars === 0 || segments.length === 0) return phrase;
  const steps = phrase.stepsPerBar;
  const groove = GROOVES[pattern.id] ?? 'R...R...';
  const short = SHORT.has(pattern.id);
  const bass: BassEvent[] = [];

  const fillFrom = new Map<number, number>();
  for (const e of phrase.events) if (e.fill) fillFrom.set(e.bar, Math.min(fillFrom.get(e.bar) ?? Infinity, e.step));

  const ordered = [...segments].sort((a, b) => a.bar - b.bar || a.from - b.from);
  ordered.forEach((seg, index) => {
    const pc = bassPitchClass(seg.chord);
    if (pc === null) return; // not a chord: the bass rests
    const root = lowNote(pc);
    const note = (kind: string): number => (kind === '5' ? fifthOf(root) : kind === '8' ? root + 12 : root);

    if (seg.bar === opts.holdBar) {
      bass.push({ bar: seg.bar, step: 0, midi: root, steps: steps, gain: 0.8 });
      return;
    }

    const until = Math.min(seg.to, fillFrom.get(seg.bar) ?? steps); // the groove stops where a fill takes over
    const hits: { step: number; kind: string }[] = [];
    for (let s = seg.from; s < until; s++) {
      const kind = groove[s];
      if (kind && kind !== '.') hits.push({ step: s, kind });
    }
    if (hits.length === 0 || hits[0].step !== seg.from) hits.unshift({ step: seg.from, kind: 'R' });
    hits[0].kind = 'R'; // a chord always starts on its root, even when it begins part-way through a bar

    hits.forEach((h, i) => {
      const end = i + 1 < hits.length ? hits[i + 1].step : until;
      const len = short ? Math.min(1, end - h.step) : end - h.step;
      bass.push({ bar: seg.bar, step: h.step, midi: note(h.kind), steps: len, gain: h.kind === 'R' ? (h.step === seg.from ? 0.95 : 0.8) : 0.75 });
    });

    // Walk to the next chord through the fill: step by step from this root toward the next one's, landing a half step off it
    if (until < seg.to) {
      const next = ordered[index + 1];
      const nextPc = next ? bassPitchClass(next.chord) : null;
      const slots = seg.to - until;
      if (nextPc !== null && slots > 0) {
        const target = lowNote(nextPc);
        const direction = target === root ? 0 : target > root ? 1 : -1;
        for (let i = 0; i < slots; i++) {
          const last = i === slots - 1;
          const along = Math.round(root + ((target - direction - root) * (i + 1)) / slots);
          const midi = last && direction !== 0 ? target - direction : along;
          bass.push({ bar: seg.bar, step: until + i, midi, steps: 1, gain: 0.7 });
        }
      }
    }
  });
  // The held last bar is not part of the song's chords: it rings the last chord's root
  const held = opts.holdBar;
  if (held !== undefined && !ordered.some((seg) => seg.bar === held)) {
    const pc = bassPitchClass(ordered[ordered.length - 1].chord);
    if (pc !== null) bass.push({ bar: held, step: 0, midi: lowNote(pc), steps: steps, gain: 0.8 });
  }
  return { ...phrase, bass };
}

/** Moves a bass part along by whole bars (for when another phrase is placed before it). */
export function shiftBass(bass: BassEvent[] | undefined, bars: number): BassEvent[] {
  return (bass ?? []).map((b) => ({ ...b, bar: b.bar + bars }));
}

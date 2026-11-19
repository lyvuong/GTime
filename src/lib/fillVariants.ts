// Fills written for each rhythm. A fill is the whole band's answer at the end of a phrase: what the guitar plays,
// what the drums play, and what the bass does. Every rhythm has a few small fills (a beat or so, for the end of a
// line) and a few big ones (half a bar, with a drum roll, for the end of a paragraph), and the choice among them
// is made from the chords, so the same song always sounds the same but no two fills in a row are alike.
//
// Times are in beats from the start of the bar (a 4/4 bar is 0 to 4, a waltz bar 0 to 3), so one fill works
// on any grid of steps: eighths, triplets or waltz sixths.
import type { DrumKind } from './drums.ts';
import type { Pattern } from './patterns.ts';

export type FillSize = 'small' | 'big';
export type Material = 'bass-run' | 'approach' | 'hammer' | 'lick';

export interface FillHit {
  at: number; // beats from the start of the bar
  kind: DrumKind;
  g?: number; // strength, 1 = normal
}

export interface FillVariant {
  id: string;
  size: FillSize;
  from: number; // the beat where the guitar's pattern gives way to the fill
  material?: Material; // where the fill's notes come from (see fills.ts); they sit at the end of `at`
  at?: number[];
  stabs?: { at: number; g?: number; kind?: 'D' | 'C' }[]; // chord strokes: all strings, or the upper ones
  drums: FillHit[];
  crash?: boolean; // a crash on the next bar's downbeat
  bass: 'walk' | 'unison' | 'rest'; // walk toward the next chord, play the guitar's notes, or drop out until the downbeat
}

const v = (id: string, size: FillSize, from: number, o: Partial<FillVariant>): FillVariant => ({ id, size, from, bass: 'walk', drums: [], ...o });
const hits = (kind: DrumKind, at: number[], g0 = 0.6, g1 = 1): FillHit[] => at.map((a, i) => ({ at: a, kind, g: at.length < 2 ? g1 : g0 + ((g1 - g0) * i) / (at.length - 1) }));

// --- Bolero: slow and swaying. Conga-like tom taps, rim clicks, and runs that walk down into the next chord.
const bolero: FillVariant[] = [
  v('bolero-tumbao', 'small', 3, { material: 'approach', at: [3.5], stabs: [{ at: 3, g: 0.3, kind: 'C' }], drums: [{ at: 3, kind: 'R' }, { at: 3.5, kind: 'T', g: 0.7 }] }),
  v('bolero-walk', 'small', 3, { material: 'bass-run', at: [3, 3.5], bass: 'unison', drums: [{ at: 3.5, kind: 'R' }] }),
  v('bolero-roll', 'small', 3, { stabs: [{ at: 3, g: 0.3, kind: 'D' }, { at: 3.5, g: 0.28, kind: 'C' }], drums: [{ at: 3, kind: 'R' }, { at: 3.5, kind: 'R' }, { at: 3.75, kind: 'T', g: 0.6 }] }),
  v('bolero-bongo', 'big', 2, { material: 'bass-run', at: [2.5, 3, 3.5], bass: 'unison', crash: true, drums: [...hits('T', [2.5, 3, 3.5], 0.6, 0.9), { at: 3.75, kind: 'S', g: 0.7 }] }),
  v('bolero-sigh', 'big', 2.5, { material: 'lick', at: [3, 3.5], bass: 'rest', crash: true, stabs: [{ at: 2.5, g: 0.3, kind: 'D' }], drums: [{ at: 2.5, kind: 'R' }, ...hits('T', [3, 3.5, 3.75], 0.6, 0.95)] }),
  v('bolero-cascade', 'big', 2, { material: 'hammer', at: [2.5, 3, 3.5, 3.75], stabs: [{ at: 2, g: 0.3, kind: 'D' }], crash: true, drums: [...hits('R', [2, 2.5], 0.7, 0.8), ...hits('T', [3, 3.5, 3.75], 0.6, 0.95)] }),
];

// --- Rumba: a relaxed Latin ballad. Clave-like taps, a tap-tap-pause, and congas tumbling down.
const rumba: FillVariant[] = [
  v('rumba-clave', 'small', 3, { material: 'approach', at: [3], stabs: [{ at: 3.5, g: 0.3, kind: 'C' }], drums: [{ at: 3, kind: 'R' }, { at: 3.5, kind: 'R' }, { at: 3.75, kind: 'T', g: 0.6 }] }),
  v('rumba-turn', 'small', 3, { material: 'hammer', at: [3, 3.5], drums: [{ at: 3.5, kind: 'T', g: 0.75 }] }),
  v('rumba-pickup', 'small', 3.5, { material: 'approach', at: [3.5], bass: 'rest', drums: [{ at: 3.5, kind: 'R' }] }),
  v('rumba-conga', 'big', 2, { material: 'bass-run', at: [2, 2.5, 3, 3.5], bass: 'unison', crash: true, drums: [...hits('T', [2.5, 3, 3.5, 3.75], 0.6, 0.95)] }),
  v('rumba-break', 'big', 2, { material: 'lick', at: [3, 3.5], stabs: [{ at: 2, g: 0.3, kind: 'D' }, { at: 2.5, g: 0.28, kind: 'C' }], crash: true, drums: [...hits('R', [2, 2.5, 3.5], 0.7, 0.9), { at: 3, kind: 'T', g: 0.8 }] }),
  v('rumba-stop', 'big', 3, { material: 'lick', at: [3, 3.5], bass: 'rest', crash: true, drums: hits('S', [3, 3.25, 3.5, 3.75], 0.5, 1) }),
];

// --- Bossa Nova: light and jazzy. No crashes; rim clicks, chromatic slides and syncopated chord taps.
const bossa: FillVariant[] = [
  v('bossa-lean', 'small', 3, { material: 'approach', at: [3], stabs: [{ at: 3.5, g: 0.26, kind: 'C' }], drums: [{ at: 3.5, kind: 'R' }] }),
  v('bossa-slide', 'small', 3, { material: 'hammer', at: [3, 3.5], bass: 'rest', drums: [{ at: 3.5, kind: 'R', g: 0.8 }] }),
  v('bossa-taps', 'small', 3, { stabs: [{ at: 3, g: 0.27, kind: 'C' }, { at: 3.5, g: 0.26, kind: 'C' }], drums: [{ at: 3, kind: 'R' }, { at: 3.5, kind: 'R', g: 0.9 }] }),
  v('bossa-walk', 'big', 2, { material: 'bass-run', at: [2, 2.5, 3, 3.5], bass: 'unison', drums: hits('R', [2.5, 3, 3.5], 0.6, 1) }),
  v('bossa-answer', 'big', 2.5, { material: 'lick', at: [2.5, 3, 3.5], bass: 'rest', drums: [{ at: 3.5, kind: 'R' }, { at: 3.75, kind: 'R', g: 0.7 }] }),
  v('bossa-syncopated', 'big', 2, { stabs: [{ at: 2.5, g: 0.28, kind: 'C' }, { at: 3, g: 0.28, kind: 'C' }, { at: 3.5, g: 0.3, kind: 'D' }], drums: [{ at: 2.5, kind: 'R' }, { at: 3, kind: 'T', g: 0.6 }, { at: 3.5, kind: 'R' }] }),
];

// --- Tango: sharp and dramatic. Staccato stabs, chromatic runs, a snare roll, and sudden stops.
const tango: FillVariant[] = [
  v('tango-chromatic', 'small', 3, { material: 'approach', at: [3.5], stabs: [{ at: 3, g: 0.34, kind: 'D' }], drums: hits('S', [3.5, 3.625, 3.75, 3.875], 0.55, 1) }),
  v('tango-double', 'small', 3, { stabs: [{ at: 3, g: 0.34, kind: 'D' }, { at: 3.5, g: 0.32, kind: 'D' }], drums: hits('S', [3.5, 3.625, 3.75, 3.875], 0.55, 1) }),
  v('tango-run', 'small', 3, { material: 'bass-run', at: [3, 3.5], bass: 'unison', drums: hits('S', [3.5, 3.75], 0.7, 1) }),
  v('tango-ascent', 'big', 2, { material: 'bass-run', at: [2, 2.5, 3, 3.5], bass: 'unison', crash: true, drums: hits('S', [3, 3.25, 3.5, 3.75], 0.5, 1) }),
  v('tango-pause', 'big', 2, { material: 'lick', at: [3.5], stabs: [{ at: 2, g: 0.36, kind: 'D' }], bass: 'rest', crash: true, drums: [{ at: 2, kind: 'S' }, ...hits('S', [3.5, 3.625, 3.75, 3.875], 0.55, 1)] }),
  v('tango-tutti', 'big', 2, { stabs: [2, 2.5, 3, 3.5].map((at) => ({ at, g: 0.36, kind: 'D' as const })), crash: true, drums: [2, 2.5, 3, 3.5].map((at) => ({ at, kind: 'S' as const })) }),
];

// --- Cha cha: bright and danceable. A "cha-cha-cha" tag and a run into the next bar.
const chacha: FillVariant[] = [
  v('chacha-tag', 'small', 3, { stabs: [{ at: 3, g: 0.3, kind: 'D' }, { at: 3.5, g: 0.28, kind: 'C' }], drums: [{ at: 3, kind: 'R' }, { at: 3.5, kind: 'R' }, { at: 3.75, kind: 'R', g: 0.9 }] }),
  v('chacha-lean', 'small', 3, { material: 'approach', at: [3.5], stabs: [{ at: 3, g: 0.3, kind: 'D' }], drums: [{ at: 3.5, kind: 'T', g: 0.7 }] }),
  v('chacha-run', 'big', 2, { material: 'bass-run', at: [2, 2.5, 3, 3.5], bass: 'unison', crash: true, drums: hits('T', [2.5, 3, 3.5], 0.6, 0.9) }),
  v('chacha-tutti', 'big', 2, { stabs: [{ at: 2, g: 0.3, kind: 'D' }, { at: 3, g: 0.3, kind: 'D' }, { at: 3.5, g: 0.3, kind: 'D' }], crash: true, drums: [{ at: 2, kind: 'R' }, { at: 3, kind: 'S' }, { at: 3.5, kind: 'S' }, { at: 3.75, kind: 'S' }] }),
];

// --- Waltz (valse, Boston, waltz arpeggio): a small turn on beat three.
const waltz: FillVariant[] = [
  v('waltz-turn', 'small', 2, { material: 'approach', at: [2.5], stabs: [{ at: 2, g: 0.28, kind: 'C' }], drums: [{ at: 2.5, kind: 'R' }] }),
  v('waltz-run', 'small', 2, { material: 'bass-run', at: [2, 2.5], bass: 'unison', drums: [{ at: 2.5, kind: 'R' }] }),
  v('waltz-sweep', 'big', 1, { material: 'bass-run', at: [1.5, 2, 2.5], bass: 'unison', crash: true, drums: hits('S', [2, 2.25, 2.5, 2.75], 0.5, 0.9) }),
  v('waltz-lick', 'big', 1.5, { material: 'lick', at: [2, 2.5], bass: 'rest', crash: true, drums: [{ at: 1.5, kind: 'R' }, ...hits('T', [2, 2.5], 0.6, 0.9)] }),
];

// --- Slow rock, slow-rock arpeggio and blues shuffle: triplets, so the fill falls on the thirds of a beat.
const T = 1 / 3;
const triplet: FillVariant[] = [
  v('triplet-lean', 'small', 3, { material: 'approach', at: [3 + 2 * T], stabs: [{ at: 3, g: 0.3, kind: 'C' }], drums: [{ at: 3 + T, kind: 'R' }, { at: 3 + 2 * T, kind: 'T', g: 0.7 }] }),
  v('triplet-run', 'small', 3, { material: 'bass-run', at: [3 + T, 3 + 2 * T], bass: 'unison', drums: [{ at: 3 + 2 * T, kind: 'R' }] }),
  v('triplet-roll', 'big', 2, { material: 'bass-run', at: [2 + 2 * T, 3, 3 + T, 3 + 2 * T], bass: 'unison', crash: true, drums: hits('S', [3, 3 + T, 3 + 2 * T, 3.85], 0.5, 1) }),
  v('triplet-sigh', 'big', 2.5, { material: 'lick', at: [3, 3 + T, 3 + 2 * T], bass: 'rest', crash: true, drums: hits('T', [3, 3 + T, 3 + 2 * T], 0.6, 0.95) }),
];

// --- Strums (pop, steady, down, ballad): a strum-based lift into the next chord.
const strum: FillVariant[] = [
  v('strum-lean', 'small', 3, { material: 'approach', at: [3.5], stabs: [{ at: 3, g: 0.3, kind: 'D' }], drums: [{ at: 3.5, kind: 'R' }] }),
  v('strum-run', 'small', 3, { material: 'bass-run', at: [3, 3.5], bass: 'unison', drums: [{ at: 3.5, kind: 'R' }] }),
  v('strum-roll', 'big', 2, { material: 'bass-run', at: [2.5, 3, 3.5], bass: 'unison', crash: true, drums: hits('S', [3, 3.25, 3.5, 3.75], 0.5, 1) }),
  v('strum-lick', 'big', 2, { material: 'lick', at: [2.5, 3, 3.5], stabs: [{ at: 2, g: 0.3, kind: 'D' }], crash: true, drums: [{ at: 2, kind: 'K' }, ...hits('T', [3, 3.5, 3.75], 0.6, 0.95)] }),
];

// --- Picked patterns (arpeggio, alternating bass, slow arpeggio): the same fingers, a little lick.
const pick: FillVariant[] = [
  v('pick-lick', 'small', 3, { material: 'lick', at: [3, 3.5], drums: [{ at: 3.5, kind: 'R', g: 0.8 }] }),
  v('pick-lean', 'small', 3, { material: 'approach', at: [3.5], bass: 'rest', drums: [{ at: 3.5, kind: 'R', g: 0.8 }] }),
  v('pick-run', 'big', 2, { material: 'bass-run', at: [2, 2.5, 3, 3.5], bass: 'unison', crash: true, drums: hits('T', [3, 3.5, 3.75], 0.5, 0.85) }),
  v('pick-cascade', 'big', 2, { material: 'lick', at: [2, 2.5, 3, 3.5], bass: 'rest', crash: true, drums: hits('R', [2.5, 3, 3.5], 0.6, 1) }),
];

const FAMILY: Record<string, FillVariant[]> = {
  bolero, rumba, 'bossa-nova': bossa, tango, 'tango-sync': tango, 'cha-cha': chacha,
  valse: waltz, boston: waltz, 'waltz-arp': waltz,
  'slow-rock': triplet, 'slow-rock-arp': triplet, blues: triplet,
  'pop-strum': strum, 'steady-strum': strum, 'down-strum': strum, ballad: strum,
  arpeggio: pick, 'alt-bass': pick, 'slow-arp': pick,
};

/** All the fills written for a rhythm, small ones and big ones. */
export function variantsFor(pattern: Pattern): FillVariant[] {
  return FAMILY[pattern.id] ?? (pattern.kind === 'pick' ? pick : strum);
}

const hash = (s: string) => {
  let h = 17;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
};

/**
 * Chooses a fill of the wanted size. The choice comes from the chords and the bar, so it is the same every time
 * the song plays, and it never repeats the fill just before it when there is another to use.
 */
export function pickVariant(pattern: Pattern, size: FillSize, chord: string, next: string | null, bar: number, last: string | null): FillVariant {
  const all = variantsFor(pattern);
  const pool = all.filter((x) => x.size === size);
  const list = pool.length ? pool : all;
  let i = hash(`${chord}>${next ?? ''}`) % list.length;
  i = (i + bar) % list.length;
  if (list.length > 1 && list[i].id === last) i = (i + 1) % list.length;
  return list[i];
}

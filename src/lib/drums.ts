// Drum grooves for each rhythm, laid on the same grid of steps as the guitar so they stay in time with it.
// Only the notes are decided here; drumKit.ts makes the sounds.
import type { Pattern, Phrase } from './patterns.ts';

export type DrumKind = 'K' | 'S' | 'R' | 'H' | 'O' | 'T' | 'C'; // kick, snare, rim click, hi-hat, open hi-hat, tom, crash
export type DrumLevel = 'off' | 'light' | 'full';
export const DRUM_LEVELS: DrumLevel[] = ['off', 'light', 'full'];

export interface DrumEvent {
  bar: number;
  step: number;
  kind: DrumKind;
  gain: number;
  variant?: number; // which of the slightly different recordings of this drum to use
}

// One row per drum, one character per step: "X" accent, "x" normal, "." rest
interface Groove {
  K?: string;
  S?: string;
  R?: string;
  H?: string;
  O?: string; // an open hat, which replaces the closed hat on its step
}

const EIGHTHS = { // 8 steps: 1 & 2 & 3 & 4 &
  gentle: { K: 'X...x...', R: '..x...x.', H: 'x.x.x.x.' },
  rock: { K: 'X...x...', S: '..X...X.', H: 'xxxxxxxx', O: '.......x' },
  backbeat: { K: 'X...x...', S: '..X...X.', H: 'x.x.x.x.' },
};
const TRIPLETS = { // 12 steps: three to a beat
  swing: { K: 'X.....x.....', S: '...X.....X..', H: 'x.xx.xx.xx.x' },
};
const WALTZ = { // 6 steps: two to a beat, three beats
  plain: { K: 'X.....', R: '..x.x.', H: '.x.x.x' },
  soft: { K: 'X.....', R: '..x.x.', H: 'x.x.x.' },
};

const GROOVES: Record<string, Groove> = {
  arpeggio: EIGHTHS.gentle,
  'alt-bass': EIGHTHS.gentle,
  'slow-arp': { K: 'X...x...', R: '..x...x.' },
  'slow-rock-arp': TRIPLETS.swing,
  'waltz-arp': WALTZ.soft,
  'pop-strum': EIGHTHS.rock,
  'steady-strum': EIGHTHS.rock,
  'down-strum': EIGHTHS.backbeat,
  ballad: EIGHTHS.backbeat,
  bolero: { K: 'X...X...', R: '..xx..xx', H: 'x.x.x.x.' },
  'slow-rock': TRIPLETS.swing,
  'bossa-nova': { K: 'X..xX..x', R: 'x..x..x.', H: 'xxxxxxxx' },
  rumba: { K: 'X...x...', R: 'x..x..x.', H: 'x.x.x.x.' },
  'cha-cha': { K: 'X...x...', R: 'x.x.x.xx', H: '.x.x.x.x' },
  tango: { K: 'X...x...', S: '..x..xx.' },
  blues: TRIPLETS.swing,
  valse: WALTZ.plain,
  boston: WALTZ.soft,
};

const BASE: Record<DrumKind, number> = { K: 1.0, S: 0.85, R: 0.7, H: 0.4, O: 0.4, T: 0.8, C: 0.65 }; // drums need to be well above the guitar to be heard on small speakers

/**
 * Adds a drum part to a phrase. A "light" part keeps the kick and swaps the snare for a soft rim click,
 * with quieter hats; a "full" part is the whole groove, with a snare roll where the guitar has a fill.
 * `holdBar` is a final bar that only gets a kick and a crash.
 */
export function addDrums(phrase: Phrase, pattern: Pattern, level: DrumLevel, opts: { holdBar?: number } = {}): Phrase {
  if (level === 'off' || phrase.bars === 0) return phrase;
  const groove = GROOVES[pattern.id] ?? EIGHTHS.backbeat;
  const steps = phrase.stepsPerBar;
  const full = level === 'full';
  const drums: DrumEvent[] = [];

  // Where the guitar fills start, so the drums can lead into the next bar with it
  const fillFrom = new Map<number, number>();
  for (const e of phrase.events) if (e.fill) fillFrom.set(e.bar, Math.min(fillFrom.get(e.bar) ?? Infinity, e.step));

  // Real drummers never hit twice the same: the strength and the sound vary a little from hit to hit
  const hit = (bar: number, step: number, kind: DrumKind, accent: boolean, scale = 1) => {
    const n = (bar * 31 + step * 7 + kind.charCodeAt(0)) % 9;
    drums.push({ bar, step, kind, gain: BASE[kind] * (accent ? 1.25 : 1) * scale * (0.92 + 0.02 * n), variant: n % 3 });
  };

  for (let bar = 0; bar < phrase.bars; bar++) {
    if (bar === opts.holdBar) {
      hit(bar, 0, 'K', true, full ? 1 : 0.7);
      if (full) hit(bar, 0, 'C', false);
      continue;
    }
    const until = fillFrom.get(bar) ?? steps; // the groove stops where a fill takes over
    const row = (chars: string | undefined, kind: DrumKind, scale = 1) => {
      if (!chars) return;
      for (let s = 0; s < Math.min(chars.length, steps, until); s++) {
        if (chars[s] !== '.') hit(bar, s, kind, chars[s] === 'X', scale);
      }
    };
    row(groove.K, 'K', full ? 1 : 0.75);
    if (full) row(groove.S, 'S');
    else row(groove.S, 'R', 0.8);
    row(groove.R, 'R', full ? 1 : 0.8);
    const open = full ? groove.O : undefined; // open hats are only in the full part
    row(open, 'O');
    row(groove.H?.split('').map((c, i) => (open?.[i] && open[i] !== '.' ? '.' : c)).join(''), 'H', full ? 1 : 0.6);

    if (full && until < steps) {
      // A roll across the fill, rising in volume, with a crash on the next bar's first beat
      const n = steps - until;
      for (let i = 0; i < n; i++) hit(bar, until + i, i % 2 === 0 || n < 3 ? 'S' : 'T', false, 0.6 + (0.5 * (i + 1)) / n);
      if (bar + 1 < phrase.bars && bar + 1 !== opts.holdBar) hit(bar + 1, 0, 'C', false, 0.9);
    }
  }
  return { ...phrase, drums };
}

/** Moves a drum part along by whole bars (for when another phrase is placed before it). */
export function shiftDrums(drums: DrumEvent[] | undefined, bars: number): DrumEvent[] {
  return (drums ?? []).map((d) => ({ ...d, bar: d.bar + bars }));
}

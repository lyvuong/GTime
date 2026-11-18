// Turns a song's timing into playable bars: the chosen rhythm for every bar, fills at the end of
// paragraphs (or at every chord change), and a final chord that is struck once and left to ring.
import { chordShape, OPEN_STRINGS } from './chordShapes.ts';
import type { FillOptions } from './fills.ts';
import { buildPhrase, type Pattern, type Phrase } from './patterns.ts';
import type { SongTiming } from './songTiming.ts';

// Where song fills go: the end of every sung line (the singer rests there), the end of each paragraph, or every chord change
export type SongFillWhere = 'line' | 'end' | 'every';
export interface SongFill extends Omit<FillOptions, 'where' | 'bars'> {
  where: SongFillWhere;
}

export function buildSongPhrase(timing: SongTiming, pattern: Pattern, capo = 0, fill?: SongFill): Phrase {
  if (timing.totalBars === 0) return { events: [], stepsPerBar: pattern.steps.length, beats: pattern.beats, bars: 0, shapes: [] };

  let options: FillOptions | undefined;
  if (fill && fill.style !== 'none') {
    const bars = new Set<number>();
    if (fill.where === 'every') timing.chords.forEach((_, i) => bars.add(i));
    else if (fill.where === 'line') timing.lineEnds.forEach((b) => bars.add(b));
    else timing.blocks.forEach((b) => bars.add(b.end - 1));
    options = { ...fill, where: 'end', long: fill.long ?? true, bars };
  }

  const phrase = buildPhrase(timing.chords, pattern, 1, capo, options);

  // A bar shared by several short chords plays each one's part of the pattern (no fills there)
  const perBar = new Map<number, typeof timing.segments>();
  for (const seg of timing.segments) perBar.set(seg.bar, [...(perBar.get(seg.bar) ?? []), seg]);
  const steps = pattern.steps.length;
  for (const [b, segs] of perBar) {
    if (segs.length < 2) continue;
    phrase.events = phrase.events.filter((e) => e.bar !== b);
    for (const seg of segs) {
      const lo = Math.round((seg.from / 4) * steps);
      const hi = Math.round((seg.to / 4) * steps);
      for (const e of buildPhrase([seg.chord], pattern, 1, capo).events) {
        if (e.step >= lo && e.step < hi) phrase.events.push({ ...e, bar: b });
      }
    }
  }

  // The last chord is struck once, from the bass up, and left to ring in one extra bar
  const bar = timing.totalBars;
  const shape = chordShape(timing.segments[timing.segments.length - 1].chord);
  if (shape) {
    let order = 0;
    shape.forEach((fret, string) => {
      if (fret < 0) return;
      phrase.events.push({ bar, step: 0, order: order++, string, fret, midi: OPEN_STRINGS[string] + fret + capo, gain: 0.34 });
    });
  }
  return { ...phrase, bars: bar + 1, shapes: [...phrase.shapes, shape] };
}

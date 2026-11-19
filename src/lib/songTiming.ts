// Works out how long each chord of a song lasts. A chord sheet only says where chords change in the
// words, not for how long, so the length is estimated from the words under each chord (Vietnamese
// has one syllable per word, which makes the word count a fair measure of time).
import type { ParsedSong } from './chordParser.ts';

export interface TokenRef {
  s: number; // section
  l: number; // line within the section
  t: number; // chord/lyric token within the line
}

export interface LineRef {
  s: number;
  l: number;
}

export interface ChordSpan {
  chord: string;
  bars: number;
  words: number;
  ref: TokenRef;
  fixed?: number; // length in quarters of a bar, set by a grid (otherwise estimated from the words)
}

export type BarsMode = 'auto' | 1 | 2;

// One chord within one bar; from/to are in quarters of the bar (0 to 4)
export interface Segment {
  chord: string;
  bar: number;
  from: number;
  to: number;
  ref: TokenRef;
}

export interface SongTiming {
  segments: Segment[];
  spans: ChordSpan[];
  chords: string[]; // the chord each bar starts with
  barRef: TokenRef[]; // the token each bar belongs to
  lineStartBar: Map<string, number>; // "s-l" -> the bar a line starts on (a line without chords starts on the next chord)
  lineEnds: number[]; // the last bar of each sung line (where the singer rests); not the final line
  blocks: { start: number; end: number }[]; // paragraphs as bar ranges, end exclusive
  sectionStart: Map<number, number>; // section index -> the bar a grid section starts on
  totalBars: number;
}

export const lineKey = (s: number, l: number) => `${s}-${l}`;

const WORDS_PER_BAR = 5;
const wordCount = (text: string) => text.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length;

export function songTiming(
  song: ParsedSong,
  mode: BarsMode = 'auto',
  wordsPerBar = WORDS_PER_BAR,
  lengths?: Map<string, number>, // "s-l-t" -> length in quarter-bars, set by hand
): SongTiming {
  const spans: ChordSpan[] = [];
  const lineFirstSpan = new Map<string, number>();
  const waiting: string[] = []; // lines with no chords, which start on the next chord
  const sectionFirstSpan = new Map<number, number>(); // grid sections: the span each starts on
  const blockStarts: number[] = [0]; // span indexes where a paragraph begins

  const startBlock = () => {
    if (spans.length > blockStarts[blockStarts.length - 1]) blockStarts.push(spans.length);
  };

  song.sections.forEach((section, s) => {
    startBlock();
    if (section.grid) {
      // A grid says exactly how long each chord lasts: a bar is four quarters however many beats it has
      sectionFirstSpan.set(s, spans.length);
      section.grid.rows.forEach((row, l) => {
        let t = 0;
        lineFirstSpan.set(lineKey(s, l), spans.length);
        for (const bar of row) {
          const beat = 4 / Math.max(1, bar.beats.length);
          for (const b of bar.beats) {
            const last = spans[spans.length - 1];
            if (b.hold) {
              if (last?.fixed !== undefined) last.fixed += beat;
              else spans.push({ chord: 'N.C.', bars: 1, words: 0, ref: { s, l, t: t++ }, fixed: beat });
            } else {
              for (const chord of b.chords) spans.push({ chord, bars: 1, words: 0, ref: { s, l, t: t++ }, fixed: beat / b.chords.length });
            }
          }
        }
      });
      return;
    }
    section.lines.forEach((line, l) => {
      if (line.type === 'empty') return startBlock();
      if (line.type !== 'lyric_line' || !line.tokens) return;
      let first: number | null = null;
      line.tokens.forEach((token, t) => {
        const words = wordCount(token.lyric ?? '');
        if (token.chord) {
          spans.push({ chord: token.chord, bars: 1, words, ref: { s, l, t } });
          first ??= spans.length - 1;
        } else if (spans.length > 0) {
          spans[spans.length - 1].words += words; // words before a line's first chord belong to the chord still ringing
        }
      });
      const key = lineKey(s, l);
      if (first === null) {
        waiting.push(key);
      } else {
        lineFirstSpan.set(key, first);
        for (const w of waiting.splice(0)) lineFirstSpan.set(w, first);
      }
    });
  });
  for (const w of waiting) lineFirstSpan.set(w, Math.max(0, spans.length - 1)); // trailing lines with no chord after them

  // Words to quarter-bars (a chord can be set by hand to a quarter, half, one or more bars)
  const round6 = (n: number) => Math.round(n * 1e6) / 1e6;
  const round9 = (n: number) => Math.round(n * 1e9) / 1e9;
  const EPS = 1e-6; // so that a chord ending a third of a bar short of a barline, by rounding, still counts as ending on it
  const startQ: number[] = [];
  let q = 0;
  for (const span of spans) {
    const own = lengths?.get(`${span.ref.s}-${span.ref.l}-${span.ref.t}`);
    const quarters = span.fixed !== undefined ? round9(span.fixed) : own ?? 4 * (mode === 'auto' ? Math.max(1, Math.min(4, Math.round(span.words / wordsPerBar))) : mode);
    span.bars = quarters / 4;
    startQ.push(q);
    q = round9(q + quarters);
  }
  const totalBars = Math.max(0, Math.ceil(q / 4 - EPS));

  // Cut the chords at bar lines: a bar holds one chord, or several when some are short
  const segments: Segment[] = [];
  spans.forEach((span, i) => {
    let from = startQ[i];
    const to = from + span.bars * 4;
    while (from < to - EPS) {
      const bar = Math.floor(from / 4 + EPS);
      const end = Math.min(to, (bar + 1) * 4);
      segments.push({ chord: span.chord, bar, from: round6(from - bar * 4), to: round6(end - bar * 4), ref: span.ref });
      from = end;
    }
  });
  const last = segments[segments.length - 1];
  if (last) last.to = 4; // a short chord at the very end rings to the bar line

  const chords: string[] = [];
  const barRef: TokenRef[] = [];
  for (const seg of segments) {
    if (seg.from !== 0) continue;
    chords.push(seg.chord);
    barRef.push(seg.ref);
  }

  const barOf = (quarter: number) => Math.floor(quarter / 4 + EPS);
  const lineStartBar = new Map<string, number>();
  for (const [key, spanIndex] of lineFirstSpan) lineStartBar.set(key, barOf(startQ[spanIndex] ?? 0));

  const blockStart = (i: number) => (i < blockStarts.length ? barOf(startQ[blockStarts[i]] ?? q) : totalBars);
  const blocks = blockStarts.map((_, i) => ({ start: blockStart(i), end: blockStart(i + 1) })).filter((b) => b.end > b.start);

  const firsts = [...new Set(lineFirstSpan.values())].sort((a, b) => a - b);
  const lineEnds = firsts.slice(1).map((span) => Math.max(0, barOf(startQ[span] - 1)));

  const sectionStart = new Map<number, number>();
  for (const [s, index] of sectionFirstSpan) if (index < spans.length) sectionStart.set(s, barOf(startQ[index]));

  return { spans, chords, barRef, segments, lineStartBar, lineEnds, blocks, sectionStart, totalBars };
}

/** The paragraph (as a bar range) that a bar falls in. */
export function blockOf(timing: SongTiming, bar: number): { start: number; end: number } {
  return timing.blocks.find((b) => bar >= b.start && bar < b.end) ?? { start: 0, end: timing.totalBars };
}

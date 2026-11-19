// A grid chart of a song: bars in rows of four (or eight), one box per bar, a few lyric words under each.
// Built from the same timing the play-along uses, so the grid and the backing track always agree.
import type { ParsedSong } from './chordParser.ts';
import { lineKey, type SongTiming, type TokenRef } from './songTiming.ts';

export interface GridCell {
  chord: string;
  from: number; // quarters of the bar, 0 to 4
  to: number;
  ref: TokenRef; // the chord on the lyrics sheet this cell comes from (its length can be set by hand)
  words: string[]; // the lyric words that fall in this part of the bar
}

export interface GridBar {
  bar: number;
  cells: GridCell[];
}

export interface GridRow {
  title?: string; // the section this row starts, e.g. "Chorus"
  type?: string;
  bars: GridBar[];
}

const wordsOf = (text: string) => text.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w));
export const refId = (r: TokenRef) => `${r.s}-${r.l}-${r.t}`;

/** The first few words, with an ellipsis when there are more. */
export function shortWords(words: string[], max: number): string {
  if (words.length === 0) return '';
  return words.slice(0, max).join(' ') + (words.length > max ? '…' : '');
}

type SectionAt = Map<number, { title?: string; type?: string }>;

// Every bar of the song, in order, and where each section begins
function collect(song: ParsedSong, timing: SongTiming): { bars: GridBar[]; sectionAt: SectionAt } {
  // The words under each chord: its own lyric, plus any chordless words that follow it
  const spanWords = new Map<string, string[]>();
  let last: string | null = null;
  song.sections.forEach((section, s) => {
    section.lines.forEach((line, l) => {
      if (line.type !== 'lyric_line' || !line.tokens) return;
      line.tokens.forEach((token, t) => {
        const w = wordsOf(token.lyric ?? '');
        if (token.chord) {
          last = `${s}-${l}-${t}`;
          spanWords.set(last, w);
        } else if (last) {
          spanWords.get(last)!.push(...w);
        }
      });
    });
  });

  // A chord that lasts several bars shares its words out between them, in proportion to the time in each
  const total = new Map<string, number>();
  for (const seg of timing.segments) total.set(refId(seg.ref), (total.get(refId(seg.ref)) ?? 0) + (seg.to - seg.from));
  const used = new Map<string, number>();
  const cellsByBar = new Map<number, GridCell[]>();
  for (const seg of timing.segments) {
    const id = refId(seg.ref);
    const all = spanWords.get(id) ?? [];
    const before = used.get(id) ?? 0;
    const after = before + (seg.to - seg.from);
    used.set(id, after);
    const sum = total.get(id) || 1;
    const words = all.slice(Math.round((before * all.length) / sum), Math.round((after * all.length) / sum));
    const cell: GridCell = { chord: seg.chord, from: seg.from, to: seg.to, ref: seg.ref, words };
    cellsByBar.set(seg.bar, [...(cellsByBar.get(seg.bar) ?? []), cell]);
  }

  const sectionAt: SectionAt = new Map();
  song.sections.forEach((section, s) => {
    for (let l = 0; l < section.lines.length; l++) {
      const bar = timing.lineStartBar.get(lineKey(s, l));
      if (bar !== undefined) {
        if (!sectionAt.has(bar)) sectionAt.set(bar, { title: section.title, type: section.type });
        break;
      }
    }
  });

  const bars: GridBar[] = [];
  for (let bar = 0; bar < timing.totalBars; bar++) {
    const cells = cellsByBar.get(bar);
    if (cells) bars.push({ bar, cells });
  }
  return { bars, sectionAt };
}

// Bars into rows: a new row starts at each section (which names it) and when a row is full
function layout(bars: GridBar[], sectionAt: SectionAt, perRow: number): GridRow[] {
  const rows: GridRow[] = [];
  for (const b of bars) {
    const section = sectionAt.get(b.bar);
    let row = rows[rows.length - 1];
    if (!row || section || row.bars.length >= perRow) {
      row = { title: section?.title, type: section?.type, bars: [] };
      rows.push(row);
    }
    row.bars.push(b);
  }
  return rows;
}

export function buildGrid(song: ParsedSong, timing: SongTiming, perRow = 4): GridRow[] {
  const { bars, sectionAt } = collect(song, timing);
  return layout(bars, sectionAt, perRow);
}

/** Which bar and which part of it is sounding, from the play-along position (bars, plus quarters/4 at a mid-bar change). */
export function playingAt(position: number | null): { bar: number; quarter: number } | null {
  if (position === null || position < 0) return null;
  const bar = Math.floor(position + 1e-9);
  return { bar, quarter: (position - bar) * 4 };
}

// ---- Repeats -------------------------------------------------------------------------------------------------

/** A part of the chart: one or more rows, played `repeats` times (1 when nothing is folded). */
export interface GridBlock {
  rows: GridRow[];
  repeats: number;
  firstBar: number; // the first bar of the first pass; later passes follow straight on
  passBars: number; // how many bars one pass has
}

const barSignature = (b: GridBar) => b.cells.map((c) => `${c.chord}:${c.from}-${c.to}`).join('+');

/**
 * The chart with repeated parts folded, the way a lead sheet does: a run of bars that repeats exactly (up to
 * `maxBars` bars long, at least four bars in all) is shown once with a repeat count. Folding stays inside a
 * section, so each section keeps its own name. The repeat that covers the most bars wins.
 */
export function foldGrid(song: ParsedSong, timing: SongTiming, perRow = 4, maxBars = 8): GridBlock[] {
  const { bars, sectionAt } = collect(song, timing);
  const sig = bars.map(barSignature);
  const blocks: GridBlock[] = [];

  // Cut the song into sections, then fold inside each
  const starts = bars.map((b, i) => (i === 0 || sectionAt.has(b.bar) ? i : -1)).filter((i) => i >= 0);
  starts.forEach((from, n) => {
    const to = n + 1 < starts.length ? starts[n + 1] : bars.length;
    const named = sectionAt.get(bars[from].bar);
    let first = true;
    const push = (part: GridBar[], repeats: number) => {
      const rows = layout(part, first && named ? new Map([[part[0].bar, named]]) : new Map(), perRow);
      first = false;
      blocks.push({ rows, repeats, firstBar: part[0].bar, passBars: part.length });
    };

    let plain: GridBar[] = [];
    const flush = () => {
      if (plain.length) push(plain, 1);
      plain = [];
    };
    let i = from;
    while (i < to) {
      let best = { size: 0, count: 1 };
      for (let size = 1; size <= maxBars && i + size * 2 <= to; size++) {
        let count = 1;
        while (i + (count + 1) * size <= to) {
          let same = true;
          for (let k = 0; k < size; k++) if (sig[i + count * size + k] !== sig[i + k]) same = false;
          if (!same) break;
          count++;
        }
        const contiguous = bars[i + size * count - 1].bar - bars[i].bar === size * count - 1;
        if (count >= 2 && size * count >= 4 && contiguous && size * count > best.size * best.count) best = { size, count };
      }
      if (best.size > 0) {
        flush();
        push(bars.slice(i, i + best.size), best.count);
        i += best.size * best.count;
      } else {
        plain.push(bars[i]);
        i++;
      }
    }
    flush();
  });
  return blocks;
}

/** Where a bar of the song sits on the folded chart: the bar to light up, and which pass of its block it is. */
export function locateInBlocks(blocks: GridBlock[], bar: number): { shown: number; pass: number; block: number } | null {
  for (let b = 0; b < blocks.length; b++) {
    const { firstBar, passBars, repeats } = blocks[b];
    if (bar >= firstBar && bar < firstBar + passBars * repeats) {
      const offset = bar - firstBar;
      return { shown: firstBar + (offset % passBars), pass: Math.floor(offset / passBars), block: b };
    }
  }
  return null;
}

// ---- Notation ------------------------------------------------------------------------------------------------

export type Simile = 'none' | 'one' | 'two-first' | 'two-second';

const sameBar = (a: GridBar, b: GridBar) => barSignature(a) === barSignature(b);

/**
 * Which bars of a row are shown with a simile mark instead of their chords: a bar that repeats the bar before
 * gets a one-bar mark, and a pair of bars that repeats the two bars before gets one two-bar mark across the
 * barline between them. Marks never reach back past the start of the row.
 */
export function similes(bars: GridBar[]): Simile[] {
  const out: Simile[] = bars.map(() => 'none');
  for (let j = 1; j < bars.length; j++) {
    if (j >= 3 && out[j - 1] !== 'two-first' && sameBar(bars[j], bars[j - 2]) && sameBar(bars[j - 1], bars[j - 3]) && !sameBar(bars[j], bars[j - 1])) {
      out[j - 1] = 'two-first';
      out[j] = 'two-second';
    } else if (out[j - 1] !== 'two-first' && sameBar(bars[j], bars[j - 1])) {
      out[j] = 'one';
    }
  }
  return out;
}

/** How many beats a bar is shown with: 3/4 has three, 6/8 has two, and anything else without a time signature has four. */
export function beatsPerBar(time?: string): number {
  const m = time?.match(/^(\d+)\s*\/\s*(\d+)$/);
  if (!m) return 4;
  const top = Number(m[1]);
  const compound = Number(m[2]) === 8 && top % 3 === 0 && top > 3;
  return Math.max(1, Math.min(6, compound ? top / 3 : top));
}

/** The slashes after a chord: one for each beat it lasts beyond the first, so a bar of C reads "C / / /". */
export function slashCount(cell: Pick<GridCell, 'from' | 'to'>, beats: number): number {
  return Math.max(0, Math.round(((cell.to - cell.from) / 4) * beats) - 1);
}

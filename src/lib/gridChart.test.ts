import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildGrid, playingAt, shortWords } from './gridChart.ts';
import { parseChordPro } from './chordParser.ts';
import { songTiming } from './songTiming.ts';

const SONG = `{title: x}

{start_of_verse: Verse}
[C]one two three four five [G]six seven eight nine ten
[Am]a b c d e [F]f g h i j
{end_of_verse}

{start_of_chorus: Chorus}
[C]la la la la la [G]la la la la la
{end_of_chorus}
`;

const grid = (perRow = 4, text = SONG, lengths?: Map<string, number>) => {
  const song = parseChordPro(text);
  return buildGrid(song, songTiming(song, 'auto', 5, lengths), perRow);
};

test('bars go in rows, a new section starts a new row and names it', () => {
  const rows = grid();
  assert.deepEqual(rows.map((r) => r.bars.map((b) => b.cells[0].chord)), [['C', 'G', 'Am', 'F'], ['C', 'G']]);
  assert.equal(rows[0].title, 'Verse');
  assert.equal(rows[1].title, 'Chorus');
});

test('a row holds at most the number of bars asked for', () => {
  const rows = grid(2);
  assert.ok(rows.every((r) => r.bars.length <= 2));
  assert.equal(rows.flatMap((r) => r.bars).length, 6);
});

test('each bar carries the lyric words that fall in it', () => {
  const bars = grid()[0].bars;
  assert.equal(shortWords(bars[0].cells[0].words, 3), 'one two three…');
  assert.deepEqual(bars[1].cells[0].words, ['six', 'seven', 'eight', 'nine', 'ten']);
});

test('a chord that lasts two bars shares its words between them', () => {
  const rows = grid(4, '{title: x}\n\n[C]a b c d e f g h i j [G]k l m n o\n', new Map([['0-0-0', 8]]));
  const [first, second] = rows[0].bars;
  assert.deepEqual(first.cells[0].words, ['a', 'b', 'c', 'd', 'e']);
  assert.deepEqual(second.cells[0].words, ['f', 'g', 'h', 'i', 'j']);
});

test('two chords in one bar give two cells with their own part of the bar', () => {
  const rows = grid(4, '{title: x}\n\n[C]a b c d e [G]f [Am]g\n', new Map([['0-0-1', 2], ['0-0-2', 2]]));
  const shared = rows[0].bars[1];
  assert.deepEqual(shared.cells.map((c) => [c.chord, c.from, c.to]), [['G', 0, 2], ['Am', 2, 4]]);
});

test('short words are cut with an ellipsis, and the playing position maps to a bar and quarter', () => {
  assert.equal(shortWords(['a', 'b', 'c'], 3), 'a b c');
  assert.equal(shortWords([], 3), '');
  assert.deepEqual(playingAt(2.5), { bar: 2, quarter: 2 });
  assert.deepEqual(playingAt(0), { bar: 0, quarter: 0 });
  assert.equal(playingAt(null), null);
  assert.equal(playingAt(-1), null);
});

import { foldGrid, locateInBlocks } from './gridChart.ts';

const fold = (text: string, perRow = 4) => {
  const song = parseChordPro(text);
  return foldGrid(song, songTiming(song, 'auto', 5), perRow);
};
const LOOP = '[C]a b c d e [G]f g h i j\n[Am]k l m n o [F]p q r s t\n'; // 4 bars

test('a loop that repeats folds into one block with a repeat count, at any row width', () => {
  for (const perRow of [4, 8]) {
    const blocks = fold('{title: x}\n\n' + LOOP.repeat(3), perRow);
    assert.equal(blocks.length, 1, `width ${perRow}`);
    assert.equal(blocks[0].repeats, 3);
    assert.equal(blocks[0].passBars, 4);
    assert.equal(blocks[0].rows.flatMap((r) => r.bars).length, 4);
  }
});

test('bars that do not repeat are left as they are', () => {
  const blocks = fold('{title: x}\n\n[C]a b c d e [G]f g h i j\n[Am]k l m n o [F]p q r s t\n[Dm]a b c d e [G]f g h i j\n');
  assert.deepEqual(blocks.map((b) => b.repeats), [1]);
});

test('the repeating part is found among other bars, and the rest stays in place', () => {
  const other = '[Dm]a b c d e [Em]f g h i j\n[Bb]k l m n o [Gm]p q r s t\n';
  const blocks = fold('{title: x}\n\n' + other + LOOP.repeat(2) + other);
  assert.deepEqual(blocks.map((b) => [b.passBars, b.repeats]), [[4, 1], [4, 2], [4, 1]]);
});

test('folding stays inside a section, and each section keeps its name', () => {
  const two = '{start_of_verse: Verse}\n' + LOOP + '{end_of_verse}\n';
  const blocks = fold('{title: x}\n\n' + two + '\n' + two);
  assert.deepEqual(blocks.map((b) => b.repeats), [1, 1]);
  assert.deepEqual(blocks.map((b) => b.rows[0].title), ['Verse', 'Verse']);
  const inside = fold('{title: x}\n\n{start_of_chorus: Chorus}\n' + LOOP.repeat(2) + '{end_of_chorus}\n');
  assert.deepEqual([inside[0].rows[0].title, inside[0].repeats], ['Chorus', 2]);
});

test('a bar of a later pass lights up the same bar of the folded block, and says which pass it is', () => {
  const blocks = fold('{title: x}\n\n' + LOOP.repeat(3));
  assert.deepEqual(locateInBlocks(blocks, 1), { shown: 1, pass: 0, block: 0 });
  assert.deepEqual(locateInBlocks(blocks, 9), { shown: 1, pass: 2, block: 0 });
  assert.equal(locateInBlocks(blocks, 12), null);
});

import { beatsPerBar, similes, slashCount, type GridBar } from './gridChart.ts';

const bar = (n: number, ...chords: string[]): GridBar => ({
  bar: n,
  cells: chords.map((chord, i) => ({ chord, from: (i * 4) / chords.length, to: ((i + 1) * 4) / chords.length, ref: { s: 0, l: n, t: i }, words: [] })),
});

test('a bar like the one before gets a one-bar simile mark', () => {
  assert.deepEqual(similes([bar(0, 'C'), bar(1, 'C'), bar(2, 'G'), bar(3, 'G', 'D')]), ['none', 'one', 'none', 'none']);
});

test('two bars that repeat the two before them share one two-bar mark', () => {
  const marks = similes([bar(0, 'C'), bar(1, 'G'), bar(2, 'C'), bar(3, 'G')]);
  assert.deepEqual(marks, ['none', 'none', 'two-first', 'two-second']);
  // a run of the same bar is one-bar marks, not a two-bar mark
  assert.deepEqual(similes([bar(0, 'C'), bar(1, 'C'), bar(2, 'C'), bar(3, 'C')]), ['none', 'one', 'one', 'one']);
});

test('beats per bar follow the time signature', () => {
  assert.equal(beatsPerBar(undefined), 4);
  assert.equal(beatsPerBar('4/4'), 4);
  assert.equal(beatsPerBar('3/4'), 3);
  assert.equal(beatsPerBar('6/8'), 2);
  assert.equal(beatsPerBar('nonsense'), 4);
});

test('a chord is followed by a slash for each further beat it lasts', () => {
  assert.equal(slashCount({ from: 0, to: 4 }, 4), 3);
  assert.equal(slashCount({ from: 0, to: 2 }, 4), 1);
  assert.equal(slashCount({ from: 2, to: 4 }, 4), 1);
  assert.equal(slashCount({ from: 0, to: 1 }, 4), 0);
  assert.equal(slashCount({ from: 0, to: 4 }, 3), 2);
});

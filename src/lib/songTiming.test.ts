import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseChordPro } from './chordParser.ts';
import { blockOf, lineKey, songTiming } from './songTiming.ts';

const timing = (text: string, ...rest: Parameters<typeof songTiming> extends [unknown, ...infer R] ? R : never) => songTiming(parseChordPro(text), ...rest);

test('a chord lasts about one bar per five words, never less than a bar', () => {
  const t = timing('{title: x}\n\n[C]one two three [G]four five six seven eight nine ten eleven twelve [Am]la\n');
  assert.deepEqual(t.spans.map((s) => [s.chord, s.words, s.bars]), [['C', 3, 1], ['G', 9, 2], ['Am', 1, 1]]);
  assert.deepEqual(t.chords, ['C', 'G', 'G', 'Am']);
  assert.equal(t.totalBars, 4);
});

test('a long phrase is capped at four bars and a chord with no words still gets a bar', () => {
  const long = Array.from({ length: 40 }, (_, i) => `w${i}`).join(' ');
  const t = timing(`{title: x}\n\n[C]${long} [G]\n`);
  assert.deepEqual(t.spans.map((s) => s.bars), [4, 1]);
});

test('a fixed bars-per-chord setting ignores the words', () => {
  const text = '{title: x}\n\n[C]a b c d e f g h i j [G]a\n';
  assert.deepEqual(timing(text, 1).spans.map((s) => s.bars), [1, 1]);
  assert.deepEqual(timing(text, 2).spans.map((s) => s.bars), [2, 2]);
});

test('words before a line\'s first chord belong to the chord that is still ringing', () => {
  const t = timing('{title: x}\n\n[C]one two\nthree four five six seven eight nine [G]ten\n');
  assert.equal(t.spans[0].words, 9); // 2 on the chord's own line, 7 more before the next chord
  assert.equal(t.spans[0].bars, 2);
});

test('every lyric line knows which bar it starts on, and a line without chords starts on the next chord', () => {
  const t = songTiming(parseChordPro('{title: x}\n\n[C]one two three four five [G]six seven eight nine ten\njust words here\n[Am]more words [F]again\n'));
  const lines = [...t.lineStartBar.keys()].sort();
  assert.equal(lines.length, 3);
  // C (5 words) is one bar; G has 5 words plus the 3 of the chordless line, so it takes two bars
  assert.deepEqual(t.spans.map((s) => [s.chord, s.bars]), [['C', 1], ['G', 2], ['Am', 1], ['F', 1]]);
  assert.equal(t.lineStartBar.get(lines[0]), 0);
  assert.equal(t.lineStartBar.get(lines[1]), 3, 'the chordless line waits for the Am that follows it');
  assert.equal(t.lineStartBar.get(lines[2]), 3);
  assert.equal(lineKey(0, 1), '0-1');
});

test('each bar points back at the chord token it belongs to', () => {
  const t = timing('{title: x}\n\n[C]one two [G]three four five six seven eight nine ten\n');
  assert.deepEqual(t.barRef.map((r) => r.t), [0, 1, 1]);
});

test('paragraphs become bar ranges', () => {
  const t = timing('{title: x}\n\n[C]a b [G]c d\n\n[Am]e f [F]g h\n');
  assert.deepEqual(t.blocks, [{ start: 0, end: 2 }, { start: 2, end: 4 }]);
  assert.deepEqual(blockOf(t, 3), { start: 2, end: 4 });
  assert.deepEqual(blockOf(t, 99), { start: 0, end: 4 }, 'a bar outside every paragraph falls back to the whole song');
});

test('a song with no chords has no bars', () => {
  const t = timing('{title: x}\n\nJust some words\n');
  assert.equal(t.totalBars, 0);
  assert.deepEqual(t.chords, []);
});

test('chords can be set to a quarter or half bar, sharing a bar', () => {
  const song = parseChordPro('{title: x}\n\n[C]a b c d e [G]f [Am]g [F]h i j k l\n');
  const lengths = new Map([['0-0-1', 2], ['0-0-2', 2]]); // G and Am: a half bar each
  const t = songTiming(song, 'auto', 5, lengths);
  assert.deepEqual(t.segments.map((s) => [s.chord, s.bar, s.from, s.to]), [
    ['C', 0, 0, 4], ['G', 1, 0, 2], ['Am', 1, 2, 4], ['F', 2, 0, 4],
  ]);
  assert.deepEqual(t.chords, ['C', 'G', 'F']);
  assert.equal(t.totalBars, 3);
});

test('a short chord at the very end rings to the bar line', () => {
  const t = songTiming(parseChordPro('{title: x}\n\n[C]a b c d e [G]f\n'), 'auto', 5, new Map([['0-0-1', 1]]));
  assert.deepEqual(t.segments.at(-1), { chord: 'G', bar: 1, from: 0, to: 4, ref: { s: 0, l: 0, t: 1 } });
});

test('line ends are the last bar before the next line starts', () => {
  const t = songTiming(parseChordPro('{title: x}\n\n[C]a b c d e [G]f g h i j k l m n o\n[Am]a b c d e\n[F]a b c d e\n'));
  assert.deepEqual(t.spans.map((s) => s.bars), [1, 2, 1, 1]);
  assert.deepEqual(t.lineEnds, [2, 3]); // G rings through bar 2; Am is bar 3; F (the last line) has no fill
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseChordPro, transposeParsedSong } from './chordParser.ts';
import { findLoop, suggestIntros } from './intro.ts';

const SONG = `{title: Test}
{key: C}

[C]La la [Am]la la
[F]La la [G]la la
[C]La la [Am]la la
[F]La la [G]la la

[F]Chorus [G]line
[Em]Chorus [Am]line
[F]Chorus [G]line
[Am]Chorus [F]end
`;

const chords = (text: string) => suggestIntros(parseChordPro(text));

test('findLoop finds the shortest repeating cycle and tolerates a wobble', () => {
  assert.deepEqual(findLoop(['C', 'Am', 'F', 'G', 'C', 'Am', 'F', 'G']), ['C', 'Am', 'F', 'G']);
  assert.deepEqual(findLoop(['C', 'G', 'C', 'G', 'C', 'G', 'C', 'G', 'C', 'Em']), ['C', 'G']);
  assert.equal(findLoop(['C', 'Am', 'F', 'G', 'Em', 'Dm', 'E']), null);
  // a verse that loops for four lines and then changes
  const verse = ['Bm', 'F#m', 'G', 'F#m', 'Bm', 'F#m', 'G', 'F#m', 'Bm', 'F#m', 'G', 'F#m', 'Bm', 'F#m', 'G', 'F#m', 'Em', 'F#m', 'G', 'A', 'D'];
  assert.deepEqual(findLoop(verse), ['Bm', 'F#m', 'G', 'F#m']);
});

test('suggests the verse loop twice, a turnaround ending on V, and a chorus hook', () => {
  const out = chords(SONG);
  const by = Object.fromEntries(out.map((o) => [o.id, o]));
  assert.deepEqual(by.loop.chords, ['C', 'Am', 'F', 'G']);
  assert.equal(by.loop.repeat, 2);
  assert.equal(by.turnaround, undefined, 'the loop already ends on G (V), so no turnaround is added');
  assert.deepEqual(by.hook.chords, ['F', 'G', 'Am', 'F']);
});

test('adds a turnaround onto V when the loop does not already end there', () => {
  const song = `{key: C}\n\n[C]a [Am]a [F]a [Dm]a\n[C]a [Am]a [F]a [Dm]a\n`;
  const t = chords(song).find((o) => o.id === 'turnaround')!;
  assert.deepEqual(t.chords, ['C', 'Am', 'F', 'Dm', 'G']);
});

test('shows the source intro first and keeps it out of the verse analysis', () => {
  const song = `{key: Am}\n\n{comment: Intro}\n[Am]a [G]a [F]a [E]a\n\n[Am]a [F]a [C]a [G]a\n[Am]a [F]a [C]a [G]a\n`;
  const out = chords(song);
  assert.equal(out[0].id, 'original');
  assert.deepEqual(out[0].chords, ['Am', 'G', 'F', 'E']);
  assert.deepEqual(out.find((o) => o.id === 'loop')!.chords, ['Am', 'F', 'C', 'G']);
});

test('suggestions follow transposition', () => {
  const up2 = transposeParsedSong(parseChordPro(SONG), 2, false);
  assert.deepEqual(suggestIntros(up2).find((o) => o.id === 'loop')!.chords, ['D', 'Bm', 'G', 'A']);
});

test('a song with no chords, or too few, gets nothing to suggest', () => {
  assert.deepEqual(chords('{title: x}\n\nJust words\n'), []);
  assert.deepEqual(chords('{title: x}\n\n[C]a [G]a\n'), []);
});

test('without a clear loop it falls back to the opening chords, played once', () => {
  const song = `{key: C}\n\n[C]a [Am]a [F]a [G]a\n[Em]a [Dm]a [E]a [C]a\n`;
  const loop = chords(song).find((o) => o.id === 'loop')!;
  assert.deepEqual(loop.chords, ['C', 'Am', 'F', 'G']);
  assert.equal(loop.repeat, 1);
});

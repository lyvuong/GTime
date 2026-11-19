import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseChordPro, parseGrid, transposeParsedSong } from './chordParser.ts';
import { songTiming } from './songTiming.ts';
import { buildGrid } from './gridChart.ts';
import { buildSongPhrase } from './songPhrase.ts';
import { PATTERNS } from './patterns.ts';

const SONG = `{title: Giã Từ Đêm Mưa}
{artist: Văn Phụng}
{key: Dm}
{time: 4/4}

{start_of_grid label="Verse 1"}
|| Dm . Dm7 . | Gm . Gm7 . | C . C7 . | F . . . |
|  A7 . . .   | Dm . C .   | Bb . A . | G A G A7 ||
{end_of_grid}

{start_of_grid label="Verse 2"}
|| Dm . Dm7 . | Gm . Gm7 . | C . C7 . | F . . . |
|  A7 . . .   | Dm . C .   | Bb . A . | Bb A7 Dm . ||
{end_of_grid}

{start_of_grid label="Outro / Gian Tấu"}
|| C . . . | Bb . . . | A . . . | G A G A7 |
|  Bb A7 Dm . ||
{end_of_grid}
`;

const song = parseChordPro(SONG);

test('each grid becomes a labelled section of bars, with the song details kept', () => {
  assert.equal(song.metadata.title, 'Giã Từ Đêm Mưa');
  assert.equal(song.metadata.key, 'Dm');
  assert.deepEqual(song.sections.map((s) => s.title), ['Verse 1', 'Verse 2', 'Outro / Gian Tấu']);
  assert.deepEqual(song.sections.map((s) => s.type), ['verse', 'verse', 'outro']);
  assert.deepEqual(song.sections.map((s) => s.grid!.rows.map((r) => r.length)), [[4, 4], [4, 4], [4, 1]]);
  assert.ok(song.sections.every((s) => s.lines.length === 0));
  assert.deepEqual(song.allChords.slice(0, 4), ['Dm', 'Dm7', 'Gm', 'Gm7']);
});

test('a dot holds the chord, and a bar can hold a chord on every beat', () => {
  const first = song.sections[0].grid!.rows[0][0];
  assert.deepEqual(first.beats.map((b) => (b.hold ? '.' : b.chords[0])), ['Dm', '.', 'Dm7', '.']);
  const last = song.sections[0].grid!.rows[1][3];
  assert.deepEqual(last.beats.map((b) => b.chords[0]), ['G', 'A', 'G', 'A7']);
});

test('the grid gives exact chord lengths and puts each section where it starts', () => {
  const t = songTiming(song);
  assert.equal(t.totalBars, 8 + 8 + 5);
  assert.deepEqual(t.segments.filter((s) => s.bar === 0).map((s) => [s.chord, s.from, s.to]), [['Dm', 0, 2], ['Dm7', 2, 4]]);
  assert.deepEqual(t.segments.filter((s) => s.bar === 3).map((s) => [s.chord, s.from, s.to]), [['F', 0, 4]]); // held for the whole bar
  assert.deepEqual(t.segments.filter((s) => s.bar === 7).map((s) => s.chord), ['G', 'A', 'G', 'A7']);
  assert.deepEqual([...t.sectionStart], [[0, 0], [1, 8], [2, 16]]);
  assert.deepEqual(t.blocks, [{ start: 0, end: 8 }, { start: 8, end: 16 }, { start: 16, end: 21 }]);
});

test('the grid chart shows the sections with their own names', () => {
  const rows = buildGrid(song, songTiming(song), 4);
  assert.deepEqual(rows.filter((r) => r.title).map((r) => r.title), ['Verse 1', 'Verse 2', 'Outro / Gian Tấu']);
  assert.equal(rows.flatMap((r) => r.bars).length, 21);
});

test('transposing moves every chord in a grid', () => {
  const up = transposeParsedSong(song, 2);
  assert.deepEqual(up.sections[0].grid!.rows[0][0].beats.map((b) => b.chords[0] ?? '.'), ['Em', '.', 'Em7', '.']);
  assert.equal(up.metadata.key, 'Em');
});

test('a song with a grid plays: the backing track gets a phrase for every bar', () => {
  const phrase = buildSongPhrase(songTiming(song), PATTERNS[0], 0);
  assert.ok(phrase.bars >= 21);
});

test('"|:" and ":|" write the repeated bars out twice, and "%" repeats the bar before', () => {
  const { grid } = parseGrid(['|: C . . . | G . . . :|', '| F . . . | % | A . . . | D . . . | %% | %% |']);
  const chords = grid.rows.flat().map((m) => m.beats[0].chords[0]);
  assert.deepEqual(chords, ['C', 'G', 'C', 'G', 'F', 'F', 'A', 'D', 'A', 'D']); // :| plays C G again; % repeats F; %% %% repeat A D
});

test('"~" shares a beat between two chords, and a bar with three beats lasts a whole bar', () => {
  const waltz = parseChordPro('{title: w}\n{time: 3/4}\n{start_of_grid}\n| Am . . | E~E7 . . | Am . . |\n{end_of_grid}\n');
  const t = songTiming(waltz);
  assert.equal(t.totalBars, 3);
  assert.deepEqual(t.segments.filter((s) => s.bar === 1).map((s) => s.chord), ['E', 'E7']);
  const [a, b] = t.segments.filter((s) => s.bar === 1);
  assert.ok(Math.abs(a.to - a.from - 2 / 3) < 1e-4 && Math.abs(b.from - 2 / 3) < 1e-4, 'the two chords share the first third of the bar');
  assert.ok(buildSongPhrase(t, PATTERNS[0], 0).bars >= 3);
});

test('a grid left open at the end of the text still counts, and one with only a name works too', () => {
  const open = parseChordPro('{title: x}\n{sog: Intro}\n| C . . . | G . . . |\n');
  assert.equal(open.sections[0].title, 'Intro');
  assert.equal(open.sections[0].type, 'intro');
  assert.equal(open.sections[0].grid!.rows[0].length, 2);
});

test('lyric songs are unaffected', () => {
  const lyric = parseChordPro('{title: x}\n\n[C]la la la la la [G]la la la la la\n');
  assert.equal(lyric.sections[0].grid, undefined);
  assert.equal(songTiming(lyric).totalBars, 2);
});

import { exportGridChordPro } from './gridChart.ts';

const chordsOf = (text: string) => {
  const s = parseChordPro(text);
  const t = songTiming(s);
  return { names: s.sections.map((x) => x.title), timing: t, flat: t.segments.map((g) => `${g.bar}:${g.from}-${g.to}:${g.chord}`) };
};

test('a grid song exports to grid ChordPro that reads back as the same song', () => {
  const text = exportGridChordPro(song, songTiming(song));
  const back = chordsOf(text);
  const was = chordsOf(SONG);
  assert.deepEqual(back.names, was.names);
  assert.deepEqual(back.flat, was.flat);
  assert.match(text, /\{start_of_grid label="Verse 1"\}/);
  assert.match(text, /\|\| Dm \. Dm7 \. \| Gm \. Gm7 \./);
});

test('a lyric song exports its bars as grids, which read back with the same chords and lengths', () => {
  const lyric = parseChordPro('{title: x}\n{key: C}\n\n{start_of_verse: Verse}\n[C]la la la la la [G]la la la la la la la la la la [Am]la la la la la\n{end_of_verse}\n\n{start_of_chorus: Chorus}\n[F]la la la la la [G]la la la la la\n{end_of_chorus}\n');
  const t = songTiming(lyric);
  const text = exportGridChordPro(lyric, t);
  const back = songTiming(parseChordPro(text));
  const key = (x: ReturnType<typeof songTiming>) => x.segments.map((g) => `${g.bar}:${g.from}-${g.to}:${g.chord}`);
  assert.deepEqual(key(back), key(t));
  assert.deepEqual(parseChordPro(text).sections.map((s) => s.title), ['Verse', 'Chorus']);
});

test('a 3/4 song exports three beats to a bar', () => {
  const waltz = parseChordPro('{title: w}\n{time: 3/4}\n{start_of_grid label="A"}\n| Am . . | E . . | Am . . | E . . |\n{end_of_grid}\n');
  assert.match(exportGridChordPro(waltz, songTiming(waltz)), /\|\| Am \. \. \| E \. \. \| Am \. \. \| E \. \. \|\|/);
});

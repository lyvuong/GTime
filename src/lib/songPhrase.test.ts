import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseChordPro } from './chordParser.ts';
import { PATTERNS } from './patterns.ts';
import { songTiming } from './songTiming.ts';
import { buildSongPhrase } from './songPhrase.ts';

const SONG = `{title: x}

[C]la la la [Am]la la la [F]la la la [G]la la la

[C]la la la [G]la la la [Am]la la la [F]la la la
`;
const pattern = (id: string) => PATTERNS.find((p) => p.id === id)!;
const timing = songTiming(parseChordPro(SONG));

test('a song plays one bar per timed bar, plus a held last chord', () => {
  const p = buildSongPhrase(timing, pattern('arpeggio'));
  assert.equal(timing.totalBars, 8);
  assert.equal(p.bars, 9);
  const last = p.events.filter((e) => e.bar === 8);
  assert.ok(last.length >= 4 && last.every((e) => e.step === 0), 'the final chord is struck once');
  assert.deepEqual(last.map((e) => e.order), last.map((_, i) => i), 'bass first, spread across the strings');
  assert.ok(p.events.some((e) => e.bar === 7 && e.step === 7), 'every earlier bar has the pattern');
});

test('"end only" fills go at the end of each paragraph, except the very last bar', () => {
  const p = buildSongPhrase(timing, pattern('arpeggio'), 0, { style: 'bass-run', where: 'end' });
  const bars = [...new Set(p.events.filter((e) => e.fill).map((e) => e.bar))];
  assert.deepEqual(bars, [3], 'bar 3 leads into the next paragraph; the last bar has nothing to lead into');
});

test('"every bar" fills each chord change, but never the final bar', () => {
  const p = buildSongPhrase(timing, pattern('arpeggio'), 0, { style: 'hammer', where: 'every' });
  const bars = new Set(p.events.filter((e) => e.fill).map((e) => e.bar));
  assert.ok(bars.size >= 6);
  assert.ok(!bars.has(8));
});

test('the capo lifts the whole track', () => {
  const a = buildSongPhrase(timing, pattern('bolero'), 0).events;
  const b = buildSongPhrase(timing, pattern('bolero'), 2).events;
  assert.deepEqual(b.map((e) => e.midi - 2), a.map((e) => e.midi));
});

test('no chords gives an empty phrase, and every rhythm builds a full song', () => {
  const none = buildSongPhrase(songTiming(parseChordPro('{title: x}\n\nwords only\n')), pattern('bolero'));
  assert.equal(none.bars, 0);
  assert.equal(none.events.length, 0);
  for (const p of PATTERNS) {
    const phrase = buildSongPhrase(timing, p, 0, { style: 'lick', where: 'end' });
    assert.equal(phrase.bars, 9, p.id);
    assert.ok(phrase.events.length > 20, p.id);
  }
});

test('two chords in one bar each play their half of the pattern', async () => {
  const { parseChordPro } = await import('./chordParser.ts');
  const { songTiming } = await import('./songTiming.ts');
  const { PATTERNS } = await import('./patterns.ts');
  const t = songTiming(parseChordPro('{title: x}\n\n[C]a b c d e [G]f [Am]g\n'), 'auto', 5, new Map([['0-0-1', 2], ['0-0-2', 2]]));
  const p = buildSongPhrase(t, PATTERNS.find((x) => x.beats === 4)!);
  const half = p.stepsPerBar / 2;
  const bar1 = p.events.filter((e) => e.bar === 1);
  assert.ok(bar1.some((e) => e.step < half) && bar1.some((e) => e.step >= half));
});

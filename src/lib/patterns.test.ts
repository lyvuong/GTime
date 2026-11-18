import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildPhrase, patternsFor, tabBars } from './patterns.ts';

const arp = patternsFor('4/4').find((p) => p.id === 'arpeggio')!;
const pop = patternsFor('4/4').find((p) => p.id === 'pop-strum')!;

test('time signature chooses eight or six slots per bar', () => {
  assert.ok(patternsFor('4/4').every((p) => p.steps.length === 8));
  assert.ok(patternsFor(undefined).every((p) => p.steps.length === 8));
  for (const t of ['3/4', '6/8']) assert.ok(patternsFor(t).every((p) => p.steps.length === 6), t);
});

test('an arpeggio plays one string per slot, bass first, in the right pitch', () => {
  const { events, bars, stepsPerBar } = buildPhrase(['C'], arp);
  assert.equal(bars, 1);
  assert.equal(stepsPerBar, 8);
  assert.equal(events.length, 8);
  // C shape x32010: bass is the A string, fret 3 = C3 (MIDI 48); top string is the open high e
  assert.deepEqual([events[0].string, events[0].fret, events[0].midi], [1, 3, 48]);
  assert.deepEqual([events[3].string, events[3].fret, events[3].midi], [5, 0, 64]);
});

test('a capo raises the sounding pitch but not the fret numbers shown', () => {
  const plain = buildPhrase(['Am'], arp).events;
  const capo2 = buildPhrase(['Am'], arp, 1, 2).events;
  assert.deepEqual(capo2.map((e) => e.fret), plain.map((e) => e.fret));
  assert.deepEqual(capo2.map((e) => e.midi - 2), plain.map((e) => e.midi));
});

test('a strum plays every string on a down and the top three on an up', () => {
  const { events } = buildPhrase(['G'], pop); // G is a six-string chord
  assert.equal(events.filter((e) => e.step === 0).length, 6);
  const up = events.filter((e) => e.step === 3);
  assert.equal(up.length, 3);
  assert.deepEqual(up.map((e) => e.string), [5, 4, 3], 'ups go from the high strings down');
  assert.equal(events.filter((e) => e.step === 1).length, 0, 'a rest slot is silent');
});

test('repeat plays the chords again as more bars', () => {
  const p = buildPhrase(['C', 'G'], arp, 2);
  assert.equal(p.bars, 4);
  assert.equal(Math.max(...p.events.map((e) => e.bar)), 3);
});

test('something that is not a chord rests for the bar', () => {
  const p = buildPhrase(['C', 'N.C.'], arp);
  assert.equal(p.events.filter((e) => e.bar === 1).length, 0);
});

test('tab has six rows of equal width with fret numbers on the right strings', () => {
  const [bar] = tabBars(['C'], arp);
  assert.equal(bar.rows.length, 6);
  assert.ok(bar.rows.every((r) => r.length === bar.rows[0].length));
  assert.ok(bar.rows[4].startsWith('3'), 'the first note is the A string (fifth row), fret 3');
  assert.ok(bar.rows[5].replace(/-/g, '') === '', 'the C chord leaves the low E string silent');
});

test('strum tab marks the direction of each stroke', () => {
  const [bar] = tabBars(['G'], pop);
  assert.ok(bar.marks.includes('↓') && bar.marks.includes('↑'));
  assert.equal(bar.rows[0].slice(0, 3), '3--', 'the high e string is fret 3 in G');
});

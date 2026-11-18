import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildPhrase, countLabels, PATTERNS, patternsFor, strokeGlyph, tabBars } from './patterns.ts';

const byId = (id: string) => PATTERNS.find((p) => p.id === id)!;
const arp = byId('arpeggio');
const pop = byId('pop-strum');

test('every pattern is well formed', () => {
  assert.equal(new Set(PATTERNS.map((p) => p.id)).size, PATTERNS.length, 'ids are unique');
  for (const p of PATTERNS) {
    assert.ok([3, 4].includes(p.beats), p.id);
    assert.ok(p.steps.length % p.beats === 0, `${p.id}: slots divide evenly into beats`);
    assert.ok([6, 8, 12].includes(p.steps.length), `${p.id}: ${p.steps.length} slots`);
    assert.equal(p.steps[0] === null, false, `${p.id}: starts on the downbeat`);
    assert.ok(p.bpm >= 40 && p.bpm <= 160, p.id);
  }
});

test('every pattern has a description and a count that matches its slots', () => {
  for (const p of PATTERNS) {
    assert.ok(p.desc.length > 30, `${p.id} needs a description`);
    assert.equal(countLabels(p).length, p.steps.length, p.id);
  }
  assert.deepEqual(countLabels(byId('bolero')), ['1', '&', '2', '&', '3', '&', '4', '&']);
  assert.deepEqual(countLabels(byId('slow-rock')).slice(0, 6), ['1', 'la', 'li', '2', 'la', 'li']);
  assert.deepEqual(countLabels(byId('valse')), ['1', '&', '2', '&', '3', '&']);
  assert.deepEqual(byId('bolero').steps.map(strokeGlyph), ['B', '·', '↓', '↓', 'b', '·', '↓', '↓']);
});

test('the style list covers the requested rhythms', () => {
  for (const id of ['bolero', 'slow-rock', 'valse', 'bossa-nova', 'rumba', 'cha-cha', 'tango', 'ballad', 'boston']) assert.ok(byId(id), id);
});

test('the song\'s time signature decides which patterns come first, but every pattern is offered', () => {
  assert.equal(patternsFor('4/4')[0].id, 'arpeggio');
  assert.equal(patternsFor(undefined)[0].id, 'arpeggio');
  for (const t of ['3/4', '6/8']) assert.equal(patternsFor(t)[0].beats, 3, t);
  assert.equal(patternsFor('3/4').length, PATTERNS.length);
});

test('every pattern plays every kind of chord, using only real strings, notes and gains', () => {
  for (const p of PATTERNS) {
    for (const chord of ['C', 'D', 'G', 'Am', 'F#m7', 'Bb', 'Cmaj7']) {
      const { events, stepsPerBar } = buildPhrase([chord], p);
      assert.ok(events.length > 0, `${p.id} on ${chord} is silent`);
      for (const e of events) {
        assert.ok(e.string >= 0 && e.string <= 5 && e.fret >= 0, `${p.id} ${chord}`);
        assert.ok(e.step >= 0 && e.step < stepsPerBar);
        assert.ok(e.gain > 0 && e.gain <= 1);
      }
    }
  }
});

test('a rhythm\'s chord hit leaves out the bass string, and its bass note is the lowest', () => {
  const { events } = buildPhrase(['G'], byId('bolero')); // G is x6 strings: low E is the bass
  const bass = events.filter((e) => e.step === 0);
  assert.deepEqual(bass.map((e) => e.string), [0]);
  const chord = events.filter((e) => e.step === 2);
  assert.ok(chord.length >= 3 && chord.every((e) => e.string > 0), 'the chord hit skips the low string');
  // A four-string chord keeps three strings in the hit
  assert.equal(buildPhrase(['D'], byId('bolero')).events.filter((e) => e.step === 2).length, 3);
});

test('the bars last as long as their beats say, whatever the number of slots', () => {
  assert.equal(buildPhrase(['C'], byId('slow-rock')).beats, 4);
  assert.equal(buildPhrase(['C'], byId('slow-rock')).stepsPerBar, 12);
  assert.equal(buildPhrase(['C'], byId('valse')).beats, 3);
  assert.equal(buildPhrase(['C'], arp).stepsPerBar, 8);
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

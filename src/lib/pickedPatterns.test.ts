import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildPhrase, PATTERNS } from './patterns.ts';
import { hasPicked, pickedVersion } from './pickedPatterns.ts';
import { addBass, loopSegments } from './bass.ts';
import { OPEN_STRINGS } from './chordShapes.ts';

const strums = PATTERNS.filter((p) => p.kind === 'strum');

test('every strummed rhythm has a fingerpicked version on the same grid, with no strumming in it', () => {
  for (const p of strums) {
    assert.ok(hasPicked(p), `${p.id} can be fingerpicked`);
    const picked = pickedVersion(p);
    assert.equal(picked.steps.length, p.steps.length, `${p.id}: same number of slots`);
    assert.equal(picked.picked, true);
    assert.ok(!picked.steps.some((t) => t === 'D' || t === 'C' || t === 'U'), `${p.id}: no strum strokes`);
    assert.ok(picked.steps.some((t) => t === 'B' || t === 'P'), `${p.id}: the thumb plays a bass note`);
  }
});

test('the picked patterns already in the list have no separate version', () => {
  const arpeggio = PATTERNS.find((p) => p.id === 'arpeggio')!;
  assert.equal(hasPicked(arpeggio), false);
  assert.equal(pickedVersion(arpeggio), arpeggio);
});

test('fingerpicked: the thumb plays the root then the fifth, and chord notes are plucked together', () => {
  const bolero = pickedVersion(PATTERNS.find((p) => p.id === 'bolero')!);
  const phrase = buildPhrase(['C'], bolero);
  const at = (step: number) => phrase.events.filter((e) => e.step === step);
  // C: the root is on the A string (5th), the fifth, G, is on the open G string
  assert.deepEqual(at(0).map((e) => e.string), [1]);
  assert.deepEqual(at(4).map((e) => e.string), [3]);
  assert.equal((OPEN_STRINGS[3] + at(4)[0].fret) % 12, 7);
  const pluck = at(2);
  assert.equal(pluck.length, 3, 'the top three strings');
  assert.ok(pluck.every((e) => e.order === 0), 'plucked together, not strummed');
});

test('a pinch plays the bass and the top string together', () => {
  const rumba = pickedVersion(PATTERNS.find((p) => p.id === 'rumba')!);
  const first = buildPhrase(['Am'], rumba).events.filter((e) => e.step === 0);
  assert.equal(first.length, 2);
  assert.ok(first[0].string < first[1].string);
});

test('fingerpicked: the bass part only supports the thumb, and fills do not strum', () => {
  const plain = PATTERNS.find((p) => p.id === 'bossa-nova')!;
  const picked = pickedVersion(plain);
  const seg = loopSegments(['C', 'G'], 1, plain.steps.length);
  const loud = addBass(buildPhrase(['C', 'G'], plain), plain, seg, true).bass!;
  const soft = addBass(buildPhrase(['C', 'G'], picked), picked, seg, true).bass!;
  assert.equal(soft.length, loud.length);
  assert.ok(Math.max(...soft.map((b) => b.gain)) < Math.max(...loud.map((b) => b.gain)) * 0.6);

  const fill = buildPhrase(['C', 'G', 'Am', 'F'], pickedVersion(PATTERNS.find((p) => p.id === 'tango')!), 1, 0, { style: 'groove', where: 'every', long: true, keyHint: 'C' });
  for (const e of fill.events.filter((x) => x.fill)) assert.ok(e.order === 0 || e.order % 3 === 0, 'a fill is a pluck or a slow roll');
});

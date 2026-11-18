import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addBass, bassPitchClass, loopSegments, songSegments } from './bass.ts';
import { renderBass, BASS_VOICES } from './bassKit.ts';
import { parseChordPro } from './chordParser.ts';
import { detectPitch } from './pitch.ts';
import { buildPhrase, PATTERNS } from './patterns.ts';
import { songTiming } from './songTiming.ts';

const pattern = (id: string) => PATTERNS.find((p) => p.id === id)!;
const CHORDS = ['C', 'G', 'Am', 'F'];
const withBass = (id: string, chords = CHORDS, fill = false) => {
  const p = pattern(id);
  const built = buildPhrase(chords, p, 1, 0, fill ? { style: 'bass-run', where: 'every' } : undefined);
  return addBass(built, p, loopSegments(chords, 1, built.stepsPerBar), true);
};

test('the bass plays a chord\'s root, or the note after a slash', () => {
  assert.equal(bassPitchClass('C'), 0);
  assert.equal(bassPitchClass('F#m7'), 6);
  assert.equal(bassPitchClass('Bb'), 10);
  assert.equal(bassPitchClass('G/B'), 11);
  assert.equal(bassPitchClass('N.C.'), null);
});

test('bass off leaves the phrase alone', () => {
  const p = pattern('pop-strum');
  const built = buildPhrase(CHORDS, p);
  assert.equal(addBass(built, p, loopSegments(CHORDS, 1, built.stepsPerBar), false), built);
});

test('every rhythm gets a bass line that starts each bar on the root, inside the low range', () => {
  for (const p of PATTERNS) {
    const phrase = withBass(p.id);
    assert.ok(phrase.bass && phrase.bass.length > 0, p.id);
    for (const b of phrase.bass) {
      assert.ok(b.midi >= 28 && b.midi <= 56, `${p.id}: ${b.midi} is a bass note`);
      assert.ok(b.step >= 0 && b.step < phrase.stepsPerBar && b.steps >= 1, p.id);
    }
    const roots = [0, 7, 9, 5]; // C G A F
    CHORDS.forEach((_, bar) => {
      const first = phrase.bass!.filter((b) => b.bar === bar).sort((a, b) => a.step - b.step)[0];
      assert.equal(first.step, 0, `${p.id} bar ${bar} starts on the first step`);
      assert.equal(first.midi % 12, roots[bar], `${p.id} bar ${bar} starts on the root`);
    });
  }
});

test('a bolero bass is the root on 1 and the fifth on 3', () => {
  const phrase = withBass('bolero', ['C']);
  assert.deepEqual(phrase.bass!.map((b) => [b.step, b.midi % 12]), [[0, 0], [4, 7]]);
});

test('notes last until the next note, and tango notes are short', () => {
  const bolero = withBass('bolero', ['C']).bass!;
  assert.equal(bolero[0].steps, 4);
  assert.ok(withBass('tango', ['C']).bass!.every((b) => b.steps === 1));
});

test('where the guitar fills, the bass walks to the next root and lands a half step away from it', () => {
  const phrase = withBass('pop-strum', ['C', 'G'], true);
  const fillStart = Math.min(...phrase.events.filter((e) => e.fill && e.bar === 0).map((e) => e.step));
  const walk = phrase.bass!.filter((b) => b.bar === 0 && b.step >= fillStart);
  assert.ok(walk.length >= 2, 'a walk of several notes');
  const next = phrase.bass!.find((b) => b.bar === 1)!.midi;
  assert.equal(Math.abs(walk[walk.length - 1].midi - next), 1, 'the last step is a half step from the next root');
});

test('a held last bar rings the last chord\'s root', () => {
  const p = pattern('bolero');
  const built = buildPhrase(['C', 'G'], p);
  const long = { ...built, bars: built.bars + 1 };
  const out = addBass(long, p, loopSegments(['C', 'G'], 1, built.stepsPerBar), true, { holdBar: 2 });
  const held = out.bass!.filter((b) => b.bar === 2);
  assert.equal(held.length, 1);
  assert.equal(held[0].midi % 12, 7);
  assert.equal(held[0].steps, built.stepsPerBar);
});

test('two chords sharing a bar each get their own bass note', () => {
  const song = parseChordPro('{title: x}\n\n[C]a b c d e [G]f [Am]g\n');
  const t = songTiming(song, 'auto', 5, new Map([['0-0-1', 2], ['0-0-2', 2]]));
  const p = pattern('pop-strum');
  const built = buildPhrase(t.chords, p);
  const out = addBass(built, p, songSegments(t, built.stepsPerBar), true);
  const shared = out.bass!.filter((b) => b.bar === 1);
  assert.ok(shared.some((b) => b.step === 0 && b.midi % 12 === 7), 'G at the start of the bar');
  assert.ok(shared.some((b) => b.step === built.stepsPerBar / 2 && b.midi % 12 === 9), 'Am half-way through');
});

test('bass voices are finite, audible and loud enough in the harmonics for a small speaker', () => {
  for (const { id } of BASS_VOICES) {
    const freq = 55; // A1
    const w = renderBass(id, freq, 44100);
    assert.ok(w.every(Number.isFinite), id);
    assert.ok(Math.max(...w.map(Math.abs)) > 0.9, id);
    assert.ok(Math.abs(w[w.length - 1]) < 1e-3, `${id} ends quietly`);
    // the pitch is still heard as the note asked for
    const heard = detectPitch(w.slice(4410, 4410 + 8192), 44100, 40, 120);
    assert.ok(heard !== null && Math.abs(1200 * Math.log2(heard / freq)) < 40, `${id} heard as ${heard}`);
  }
});

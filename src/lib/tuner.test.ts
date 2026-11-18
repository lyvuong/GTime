import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectPitch } from './pitch.ts';
import { midiToFreq, noteName, noteOctave, readingFor, TUNINGS } from './tuning.ts';

// A plucked string: the fundamental plus decaying harmonics
function pluck(freq: number, sampleRate: number, size = 4096): Float32Array {
  const buf = new Float32Array(size);
  for (let i = 0; i < size; i++) {
    const t = i / sampleRate;
    buf[i] =
      0.5 * Math.sin(2 * Math.PI * freq * t) +
      0.3 * Math.sin(2 * Math.PI * freq * 2 * t) +
      0.15 * Math.sin(2 * Math.PI * freq * 3 * t);
  }
  return buf;
}

test('detects every standard string within 3 cents at 44.1 kHz and 48 kHz', () => {
  for (const sr of [44100, 48000]) {
    for (const midi of TUNINGS[0].strings) {
      const target = midiToFreq(midi);
      const got = detectPitch(pluck(target, sr), sr);
      assert.ok(got !== null, `no pitch for ${target} Hz at ${sr}`);
      const cents = 1200 * Math.log2(got / target);
      assert.ok(Math.abs(cents) < 3, `${target.toFixed(2)} Hz at ${sr} read ${got.toFixed(2)} Hz (${cents.toFixed(1)} cents)`);
    }
  }
});

test('detects a slightly flat low E and the lowest Drop D note', () => {
  const flatE = detectPitch(pluck(80, 44100), 44100)!;
  assert.ok(Math.abs(flatE - 80) < 0.5);
  const dropD = detectPitch(pluck(midiToFreq(38), 48000), 48000)!;
  assert.ok(Math.abs(dropD - 73.42) < 0.5);
});

test('returns null for silence and for very quiet noise', () => {
  assert.equal(detectPitch(new Float32Array(4096), 44100), null);
  const hiss = new Float32Array(4096).map(() => (Math.random() - 0.5) * 0.004);
  assert.equal(detectPitch(hiss, 44100), null);
});

test('note naming', () => {
  assert.equal(noteName(40), 'E');
  assert.equal(noteOctave(40), 2);
  assert.equal(noteName(61), 'C♯');
  assert.ok(Math.abs(midiToFreq(69) - 440) < 1e-9);
});

test('readingFor picks the nearest string and signs the offset', () => {
  const exact = readingFor(110, TUNINGS[0]);
  assert.equal(exact.stringIndex, 1);
  assert.ok(Math.abs(exact.cents) < 0.01);

  const sharp = readingFor(112, TUNINGS[0]);
  assert.equal(sharp.stringIndex, 1);
  assert.ok(sharp.cents > 25 && sharp.cents < 35);

  const flat = readingFor(145, TUNINGS[0]); // a bit under D3 (146.83)
  assert.equal(flat.stringIndex, 2);
  assert.ok(flat.cents < 0);

  // Drop D: the low string is D2, not E2
  assert.equal(readingFor(73.42, TUNINGS[1]).stringIndex, 0);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderPluck } from './pluck.ts';
import { detectPitch } from './pitch.ts';
import { midiToFreq } from './tuning.ts';

// Read the pitch of the sustained part of the note (after the attack), with the tuner's own detector
const measure = (freq: number, sr: number) => {
  const wave = renderPluck(freq, sr);
  const start = Math.floor(sr * 0.2);
  return detectPitch(wave.slice(start, start + 8192), sr, freq * 0.7, freq * 1.4);
};

test('every guitar pitch comes out in tune, at both common sample rates', () => {
  for (const sr of [44100, 48000]) {
    for (const midi of [40, 45, 50, 55, 59, 64, 69, 76]) {
      const f = midiToFreq(midi);
      const got = measure(f, sr);
      assert.ok(got !== null, `no pitch for ${f.toFixed(1)} Hz at ${sr}`);
      const cents = 1200 * Math.log2(got / f);
      assert.ok(Math.abs(cents) < 8, `${f.toFixed(1)} Hz at ${sr} rang ${cents.toFixed(1)} cents off`);
    }
  }
});

test('the note is loud at the start, dies away, stays within range and is repeatable', () => {
  const sr = 44100;
  const a = renderPluck(196, sr);
  const rms = (from: number, to: number) => Math.sqrt(a.slice(from, to).reduce((s, x) => s + x * x, 0) / (to - from));
  assert.ok(rms(0, 4410) > rms(sr, sr + 4410) * 1.5, 'it decays');
  assert.ok(a.every((x) => Math.abs(x) <= 1));
  assert.equal(Math.abs(a[a.length - 1]), 0, 'it fades to silence');
  assert.deepEqual(renderPluck(196, sr), a);
});

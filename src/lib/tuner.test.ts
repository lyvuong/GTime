import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectPitch } from './pitch.ts';
import { PitchTracker } from './pitchTracker.ts';
import { midiToFreq, noteName, noteOctave, readingFor, snapToTuning, TUNINGS, tuningRange } from './tuning.ts';

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

// ---- Octave folding and search range ----

test('snapToTuning folds octave errors onto the nearest string but leaves close pitches alone', () => {
  const t = TUNINGS[0];
  assert.ok(Math.abs(snapToTuning(164.81, t) - 82.41) < 0.05); // low E read an octave high
  assert.ok(Math.abs(snapToTuning(659.26, t) - 329.63) < 0.05); // high E read an octave high
  assert.ok(Math.abs(snapToTuning(165, t) - 82.5) < 0.1);
  // E3 fits both E2 and E4: the note already on screen decides, else the lower one
  assert.ok(Math.abs(snapToTuning(164.81, t, 329.6) - 329.62) < 0.1);
  assert.ok(Math.abs(snapToTuning(164.81, t, 82.4) - 82.41) < 0.1);
  assert.equal(snapToTuning(145, t), 145); // already close to D3
  assert.equal(snapToTuning(130, t), 130); // nowhere near a string in any octave: untouched
});

test('tuningRange brackets the strings without admitting the top string\'s 2nd harmonic', () => {
  const { min, max } = tuningRange(TUNINGS[0]);
  assert.ok(min < 82.41 && min > 55);
  assert.ok(max > 329.63 && max < 659.26);
});

// ---- Pitch tracker ----

const cents = (a: number, b: number) => 1200 * Math.log2(a / b);

test('tracker smooths jitter, ignores a stray reading, and holds then clears after the note ends', () => {
  const tr = new PitchTracker();
  tr.push(null, 0, 0.01);
  tr.push(110, 50, 0.2); // pluck
  const jitter = [112, 108.5, 111, 109, 110.5, 111.5, 108.8, 110.2];
  const out = jitter.map((f, i) => tr.push(f, 100 + i * 50, 0.18)!);
  const spread = Math.max(...out.slice(3)) - Math.min(...out.slice(3));
  assert.ok(spread < Math.max(...jitter) - Math.min(...jitter), 'output is steadier than input');

  const before = tr.push(110, 900, 0.17)!; // well after the pluck's onset window
  const afterStray = tr.push(180, 950, 0.17)!; // one stray reading far from the note
  assert.ok(Math.abs(cents(afterStray, before)) < 5, 'a single stray reading does not move the needle');

  // Readings stop: the last pitch stays up through the hold, then clears
  assert.ok(tr.push(null, 2500, 0.01) !== null);
  assert.equal(tr.push(null, 4500, 0.01), null);
});

test('tracker switches to a new string on a fresh pluck but not on noise after the note fades', () => {
  const tr = new PitchTracker();
  tr.push(null, 0, 0.01);
  tr.push(82.4, 50, 0.3);
  for (let t = 100; t < 1500; t += 50) tr.push(82.4, t, 0.3 * Math.exp(-(t - 50) / 800));
  // Faded to a trickle: a different pitch with no pluck behind it is ignored, however long it lasts
  for (let t = 1500; t < 2500; t += 50) tr.push(65.9, t, 0.02);
  assert.ok(Math.abs(cents(tr.push(65.9, 2550, 0.02)!, 82.4)) < 5);
  // A real pluck (level jumps) moves it straight away
  tr.push(110, 2600, 0.25);
  assert.ok(Math.abs(cents(tr.push(110, 2650, 0.25)!, 110)) < 5);
});

test('tracker never lights up on steady background noise', () => {
  const tr = new PitchTracker();
  for (let t = 0; t < 3000; t += 50) assert.equal(tr.push(180, t, 0.012), null);
});

// ---- Realistic plucks: pitch glide, hum, noise, weak fundamental, fast decay ----

const SR = 48000;
const BLOCK = 8192;
const FRAME_S = 0.05;
let seed = 777;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32) - 0.5;

function realisticBlock(f: number, amps: number[], t0: number): Float32Array {
  const buf = new Float32Array(BLOCK);
  for (let i = 0; i < BLOCK; i++) {
    const t = t0 + i / SR;
    const env = t < 0 ? 0 : Math.min(1, t / 0.005) * Math.exp(-t / 0.7);
    const ft = f * (1 + 0.012 * Math.exp(-Math.max(t, 0) / 0.5)); // starts ~20 cents sharp, settles
    let s = 0;
    amps.forEach((a, k) => {
      const h = k + 1;
      s += a * Math.sin(2 * Math.PI * h * ft * Math.sqrt(1 + 0.0001 * h * h) * t);
    });
    const hum = 0.012 * (Math.sin(2 * Math.PI * 60 * t) + 0.5 * Math.sin(2 * Math.PI * 120 * t) + 0.3 * Math.sin(2 * Math.PI * 180 * t));
    buf[i] = 0.5 * env * s + hum + rnd() * 0.03;
  }
  return buf;
}
const rmsOf = (b: Float32Array) => Math.sqrt(b.reduce((s, x) => s + x * x, 0) / b.length);

function trackPluck(midi: number, amps: number[]): { shown: (number | null)[]; target: number } {
  seed = 777;
  const tuning = TUNINGS[0];
  const { min, max } = tuningRange(tuning);
  const target = midiToFreq(midi);
  const tr = new PitchTracker();
  const shown: (number | null)[] = [];
  for (let i = -6; i * FRAME_S < 3; i++) {
    const buf = realisticBlock(target, amps, i * FRAME_S);
    const raw = detectPitch(buf, SR, min, max);
    const f = raw === null ? null : snapToTuning(raw, tuning, tr.value);
    shown.push(tr.push(f, (i + 6) * FRAME_S * 1000, rmsOf(buf)));
  }
  return { shown, target };
}

for (const [name, midi, amps] of [
  ['low E with a weak fundamental', 40, [0.06, 0.5, 0.4, 0.25, 0.15]],
  ['A with a weak fundamental', 45, [0.1, 0.5, 0.35, 0.2]],
  ['high E with a strong 2nd harmonic', 64, [0.3, 0.55, 0.3]],
] as const) {
  test(`stays on the right note and is steady for a noisy decaying ${name}`, () => {
    const { shown, target } = trackPluck(midi, [...amps]);
    const vals = shown.filter((x): x is number => x !== null);
    assert.ok(vals.length >= shown.length - 8, 'shows a reading for the whole note');
    for (const v of vals) assert.ok(Math.abs(cents(v, target)) < 25, `${v.toFixed(1)} Hz is not near ${target.toFixed(1)} Hz`);
    const jumps = vals.slice(1).map((v, i) => Math.abs(cents(v, vals[i])));
    assert.ok(jumps.reduce((a, b) => a + b, 0) / jumps.length < 2, 'needle barely moves between frames');
    assert.ok(Math.max(...jumps) < 20, 'no sudden jump');
  });
}

// ---- Multiples of the period ----
// With noise, 2T / 3T / 4T can look just as periodic as the real period T. Reading one of those
// gives a note an octave or more too low, and the multiple of a high E (E4 / 3) is almost exactly
// the A string, so the needle wandered between strings.

test('never returns a multiple of the period on any string, at any noise level', () => {
  const tuning = TUNINGS[0];
  const { min, max } = tuningRange(tuning);
  const strings: [number, number[]][] = [
    [40, [0.06, 0.5, 0.4, 0.25, 0.15]],
    [45, [0.1, 0.5, 0.35, 0.2]],
    [50, [0.2, 0.5, 0.3]],
    [55, [0.25, 0.5, 0.3]],
    [59, [0.3, 0.5, 0.3]],
    [64, [0.3, 0.55, 0.3]],
  ];
  seed = 4242;
  for (const [midi, amps] of strings) {
    const target = midiToFreq(midi);
    const signalRms = Math.sqrt(0.5 * amps.reduce((x, y) => x + y * y, 0));
    for (const snr of [3, 2, 1.2, 0.8, 0.5]) {
      for (let rep = 0; rep < 12; rep++) {
        const phase = rnd() * 6.28;
        const buf = new Float32Array(BLOCK);
        for (let i = 0; i < BLOCK; i++) {
          const t = i / SR;
          let s = 0;
          amps.forEach((a, k) => {
            const h = k + 1;
            s += a * Math.sin(2 * Math.PI * h * target * Math.sqrt(1 + 0.0001 * h * h) * t + phase * h);
          });
          buf[i] = s + (rnd() * 2 * signalRms * 0.7) / snr;
        }
        const f = detectPitch(buf, SR, min, max);
        if (f === null) continue;
        assert.ok(
          Math.abs(cents(f, target)) < 30,
          `string ${noteName(midi)}${noteOctave(midi)} at SNR ${snr}: read ${f.toFixed(1)} Hz (${(f / target).toFixed(2)}x)`,
        );
      }
    }
  }
});

// Other sounds for the same notes: the rhythm and chords stay the same, only the voice changes.
// Every voice is built from scratch (no audio files) and rendered once per pitch into a buffer.
import { renderPluck } from './pluck.ts';

export type Instrument = 'guitar' | 'strings' | 'brass' | 'synth' | 'piano';
type Wave = Float32Array<ArrayBuffer>;

export const INSTRUMENTS: { id: Instrument; name: string; desc: string }[] = [
  { id: 'guitar', name: 'Guitar', desc: 'A plucked nylon-string guitar.' },
  { id: 'strings', name: 'Strings', desc: 'A warm string section. Notes are held for the whole bar, so the chords swell like a pad.' },
  { id: 'brass', name: 'Brass', desc: 'Horn stabs that open up as they sound. Best with strums and rhythms.' },
  { id: 'synth', name: 'Synth', desc: 'A bright analogue-style pluck that fades as its filter closes.' },
  { id: 'piano', name: 'Piano', desc: 'A soft electric-piano-like tone with a quick attack and a long decay.' },
];

// How loud each voice is next to the guitar. Held notes pile up in a chord, so they sit lower.
export const LEVEL: Record<Instrument, number> = { guitar: 1, strings: 0.32, brass: 0.42, synth: 0.38, piano: 0.8 };

/** How long a note sounds, in seconds: held for the bar (strings), a short stab (brass, synth), or a long decay. */
export function noteSeconds(instrument: Instrument, bpm: number, beats: number, stepsPerBar: number): number {
  const beat = 60 / bpm;
  const bar = beat * beats;
  const step = bar / stepsPerBar;
  const clamp = (s: number) => Math.min(4, Math.max(0.25, s));
  switch (instrument) {
    case 'strings': return clamp(bar * 1.05);
    case 'brass': return clamp(step * 1.8);
    case 'synth': return clamp(step * 3);
    case 'piano': return clamp(beat * 3);
    default: return 0;
  }
}

const blank = (rate: number, seconds: number): Wave => new Float32Array(Math.floor(rate * seconds));

// A sawtooth with the sharp edge smoothed (PolyBLEP), so high notes do not alias into harsh noise
function polyBlep(t: number, dt: number): number {
  if (t < dt) {
    const x = t / dt;
    return x + x - x * x - 1;
  }
  if (t > 1 - dt) {
    const x = (t - 1) / dt;
    return x * x + x + x + 1;
  }
  return 0;
}

function saw(phase: number, dt: number): number {
  return 2 * phase - 1 - polyBlep(phase, dt);
}

// Two one-pole low-pass filters in a row, with a cutoff that can change at every sample
class Lowpass {
  private a = 0;
  private b = 0;
  private rate: number;
  constructor(rate: number) {
    this.rate = rate;
  }
  next(x: number, cutoff: number): number {
    const k = 1 - Math.exp((-2 * Math.PI * Math.min(cutoff, this.rate * 0.45)) / this.rate);
    this.a += k * (x - this.a);
    this.b += k * (this.a - this.b);
    return this.b;
  }
}

const cents = (c: number) => 2 ** (c / 1200);

function normalise(w: Wave, edge = 0.02): Wave {
  let peak = 0;
  for (const v of w) peak = Math.max(peak, Math.abs(v));
  if (peak > 0) for (let i = 0; i < w.length; i++) w[i] /= peak;
  const fade = Math.min(Math.floor(w.length * edge) + 1, w.length); // end on silence
  for (let i = 0; i < fade; i++) w[w.length - 1 - i] *= i / fade;
  return w;
}

// Five slightly detuned saws with a slow vibrato: the shimmer of many players on one line
function strings(freq: number, rate: number, seconds: number): Wave {
  const w = blank(rate, seconds);
  const lp = new Lowpass(rate);
  const detune = [-11, -5, 0, 5, 11];
  const phases = detune.map((_, i) => (i * 0.37) % 1);
  for (let i = 0; i < w.length; i++) {
    const t = i / rate;
    const vibrato = 1 + 0.0035 * Math.sin(2 * Math.PI * 5.2 * t) * Math.min(1, t / 0.6);
    let s = 0;
    detune.forEach((c, v) => {
      const dt = (freq * cents(c) * vibrato) / rate;
      phases[v] = (phases[v] + dt) % 1;
      s += saw(phases[v], dt);
    });
    const attack = Math.min(1, t / 0.14);
    const release = Math.min(1, (seconds - t) / 0.25);
    const sustain = 0.8 + 0.2 * Math.exp(-t / 1.5);
    w[i] = lp.next(s / detune.length, 2600 + 1400 * attack) * attack * release * sustain;
  }
  return normalise(w);
}

// Two saws through a filter that opens as the note starts: the "blat" of a horn
function brass(freq: number, rate: number, seconds: number): Wave {
  const w = blank(rate, seconds);
  const lp = new Lowpass(rate);
  const detune = [-3, 3];
  const phases = [0, 0.5];
  for (let i = 0; i < w.length; i++) {
    const t = i / rate;
    let s = 0;
    detune.forEach((c, v) => {
      const dt = (freq * cents(c)) / rate;
      phases[v] = (phases[v] + dt) % 1;
      s += saw(phases[v], dt);
    });
    const open = 1 - Math.exp(-t / 0.045); // the filter opens fast, then settles
    const attack = Math.min(1, t / 0.025);
    const release = Math.min(1, (seconds - t) / 0.08);
    w[i] = lp.next(s / 2, 500 + 2600 * open + Math.min(freq * 2, 1500) * 0.5) * attack * release * (0.75 + 0.25 * Math.exp(-t / 0.2));
  }
  return normalise(w);
}

// A saw and a square an octave down, through a filter that closes quickly: the classic analogue pluck
function synth(freq: number, rate: number, seconds: number): Wave {
  const w = blank(rate, seconds);
  const lp = new Lowpass(rate);
  let p1 = 0;
  let p2 = 0.3;
  let p3 = 0;
  for (let i = 0; i < w.length; i++) {
    const t = i / rate;
    const dt = freq / rate;
    p1 = (p1 + dt * cents(7)) % 1;
    p2 = (p2 + dt * cents(-7)) % 1;
    p3 = (p3 + dt / 2) % 1;
    const sub = p3 < 0.5 ? 1 : -1;
    const s = saw(p1, dt) * 0.5 + saw(p2, dt) * 0.5 + sub * 0.25;
    const cutoff = 350 + 5200 * Math.exp(-t / 0.18);
    w[i] = lp.next(s, cutoff) * Math.min(1, t / 0.004) * Math.exp(-t / 0.55);
  }
  return normalise(w);
}

// Harmonics that die away faster the higher they are, a hammer tick at the start, and a slow overall decay
function piano(freq: number, rate: number, seconds: number): Wave {
  const w = blank(rate, seconds);
  const partials = Math.min(12, Math.floor((rate * 0.45) / freq));
  for (let n = 1; n <= partials; n++) {
    const f = freq * n * Math.sqrt(1 + 0.0004 * n * n); // strings are slightly stiff, so upper partials run a little sharp
    const amp = 1 / n ** 1.15;
    const tau = 1.6 / (1 + 0.45 * n);
    let phase = 0;
    const step = (2 * Math.PI * f) / rate;
    for (let i = 0; i < w.length; i++) {
      phase += step;
      w[i] += Math.sin(phase) * amp * Math.exp(-(i / rate) / tau);
    }
  }
  let x = 7;
  for (let i = 0; i < Math.floor(rate * 0.006); i++) {
    x = (Math.imul(x, 1664525) + 1013904223) >>> 0;
    w[i] += ((x / 2147483648 - 1) * 0.25 * (1 - i / (rate * 0.006)));
  }
  for (let i = 0; i < w.length; i++) w[i] *= Math.min(1, (i / rate) / 0.003);
  return normalise(w);
}

/** One note of an instrument. `seconds` comes from noteSeconds (the guitar decides its own length). */
export function renderNote(instrument: Instrument, freq: number, rate: number, seconds: number): Wave {
  switch (instrument) {
    case 'strings': return strings(freq, rate, seconds);
    case 'brass': return brass(freq, rate, seconds);
    case 'synth': return synth(freq, rate, seconds);
    case 'piano': return piano(freq, rate, seconds);
    default: return renderPluck(freq, rate);
  }
}

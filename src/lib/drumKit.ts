// Drum sounds made from scratch (no audio files), modelled on how real drums behave:
//   kick   a skin that drops in pitch, plus the beater's click
//   snare  the shell's two tones, plus the rattle of the wires (filtered noise)
//   hats   a cluster of inharmonic metallic tones plus noise, filtered bright
//   toms   a pitched drop, shorter and higher than the kick
// Each sound is rendered once into a buffer. Three slightly different versions of each are made, and the
// part rotates through them, so a repeated hit does not sound like the same recording over and over.
import type { DrumEvent, DrumKind } from './drums.ts';

type Wave = Float32Array<ArrayBuffer>;

// Noise that is the same every time, so a sound never changes between plays (and can be tested)
function noise(seed: number): () => number {
  let x = seed >>> 0 || 1;
  return () => {
    x = (Math.imul(x, 1664525) + 1013904223) >>> 0;
    return x / 2147483648 - 1;
  };
}

type FilterKind = 'highpass' | 'lowpass' | 'bandpass';

/** A two-pole filter (RBJ biquad), applied in place. */
function filter(w: Wave, rate: number, kind: FilterKind, freq: number, q = 0.707): Wave {
  const f = Math.min(freq, rate * 0.45);
  const w0 = (2 * Math.PI * f) / rate;
  const alpha = Math.sin(w0) / (2 * q);
  const cos = Math.cos(w0);
  let b0: number, b1: number, b2: number;
  if (kind === 'lowpass') {
    b0 = (1 - cos) / 2; b1 = 1 - cos; b2 = (1 - cos) / 2;
  } else if (kind === 'highpass') {
    b0 = (1 + cos) / 2; b1 = -(1 + cos); b2 = (1 + cos) / 2;
  } else {
    b0 = alpha; b1 = 0; b2 = -alpha;
  }
  const a0 = 1 + alpha;
  const a1 = (-2 * cos) / a0;
  const a2 = (1 - alpha) / a0;
  b0 /= a0; b1 /= a0; b2 /= a0;
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < w.length; i++) {
    const x = w[i];
    const y = b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
    x2 = x1; x1 = x; y2 = y1; y1 = y;
    w[i] = y;
  }
  return w;
}

const blank = (rate: number, seconds: number): Wave => new Float32Array(Math.floor(rate * seconds));

function noiseBurst(rate: number, seconds: number, tau: number, seed: number, attack = 0.0005): Wave {
  const w = blank(rate, seconds);
  const rnd = noise(seed);
  for (let i = 0; i < w.length; i++) {
    const t = i / rate;
    w[i] = rnd() * Math.exp(-t / tau) * Math.min(1, t / attack);
  }
  return w;
}

/** A sine whose pitch falls from `from` to `to` (time constant `drop`) and whose level fades with `tau`. */
function sweep(rate: number, seconds: number, from: number, to: number, drop: number, tau: number): Wave {
  const w = blank(rate, seconds);
  let phase = 0;
  for (let i = 0; i < w.length; i++) {
    const t = i / rate;
    phase += (2 * Math.PI * (to + (from - to) * Math.exp(-t / drop))) / rate;
    w[i] = Math.sin(phase) * Math.exp(-t / tau);
  }
  return w;
}

function sine(rate: number, seconds: number, freq: number, tau: number): Wave {
  return sweep(rate, seconds, freq, freq, 1, tau);
}

function add(...parts: [Wave, number][]): Wave {
  const out = blank(1, Math.max(...parts.map(([p]) => p.length)));
  for (const [p, g] of parts) for (let i = 0; i < p.length; i++) out[i] += p[i] * g;
  return out;
}

// The tones of a metal cymbal are not in tune with each other; these ratios are the classic set for a synthetic hat
const METAL = [205.3, 304.4, 369.6, 522.7, 540, 800];
function metal(rate: number, seconds: number, tau: number, scale: number): Wave {
  const w = blank(rate, seconds);
  for (const f of METAL) {
    const step = (2 * Math.PI * f * scale) / rate;
    let phase = 0;
    for (let i = 0; i < w.length; i++) {
      phase += step;
      w[i] += (Math.sin(phase) > 0 ? 1 : -1) * Math.exp(-(i / rate) / tau);
    }
  }
  return w;
}

/** One drum hit. `variant` (0 to 2) changes the noise and nudges the pitch, so repeats are not identical. */
export function renderDrum(kind: DrumKind, rate: number, variant = 0): Wave {
  const seed = 101 + variant * 977;
  const nudge = 1 + (variant - 1) * 0.025; // a little higher or lower
  let w: Wave;
  switch (kind) {
    case 'K': {
      const skin = sweep(rate, 0.45, 165 * nudge, 50 * nudge, 0.022, 0.11);
      const thump = sweep(rate, 0.12, 95 * nudge, 70 * nudge, 0.03, 0.04);
      const click = filter(noiseBurst(rate, 0.02, 0.003, seed), rate, 'bandpass', 3200, 1.2);
      w = add([skin, 1], [thump, 0.5], [click, 0.55]);
      for (let i = 0; i < w.length; i++) w[i] = Math.tanh(w[i] * 1.6); // a touch of warmth
      break;
    }
    case 'S': {
      const shell = add(
        [sweep(rate, 0.2, 210 * nudge, 175 * nudge, 0.02, 0.045), 1],
        [sine(rate, 0.15, 330 * nudge, 0.03), 0.5],
      );
      const wires = filter(filter(noiseBurst(rate, 0.35, 0.07, seed, 0.001), rate, 'highpass', 1600), rate, 'bandpass', 5200, 0.6);
      const stick = filter(noiseBurst(rate, 0.01, 0.002, seed + 3), rate, 'highpass', 2500);
      w = add([shell, 0.75], [wires, 1.1], [stick, 0.5]);
      break;
    }
    case 'R': {
      // A cross-stick: the stick on the rim, a dry wooden knock
      const wood = add([sine(rate, 0.08, 480 * nudge, 0.012), 1], [sine(rate, 0.05, 1750 * nudge, 0.008), 0.6]);
      const tick = filter(noiseBurst(rate, 0.015, 0.002, seed), rate, 'bandpass', 2400, 1.5);
      w = add([wood, 1], [tick, 0.7]);
      break;
    }
    case 'H': {
      const body = filter(metal(rate, 0.12, 0.022, nudge), rate, 'highpass', 7000, 0.9);
      const air = filter(noiseBurst(rate, 0.1, 0.02, seed), rate, 'highpass', 8000);
      w = filter(add([body, 0.6], [air, 0.5]), rate, 'bandpass', 10000, 0.5);
      break;
    }
    case 'O': {
      const body = filter(metal(rate, 0.6, 0.16, nudge), rate, 'highpass', 6500, 0.9);
      const air = filter(noiseBurst(rate, 0.6, 0.14, seed), rate, 'highpass', 7500);
      w = filter(add([body, 0.5], [air, 0.5]), rate, 'bandpass', 9500, 0.5);
      break;
    }
    case 'T': {
      const skin = sweep(rate, 0.5, 220 * nudge, 112 * nudge, 0.04, 0.16);
      const click = filter(noiseBurst(rate, 0.015, 0.003, seed), rate, 'bandpass', 2000, 1);
      w = add([skin, 1], [click, 0.3]);
      break;
    }
    case 'C': {
      const body = filter(metal(rate, 1.6, 0.45, 1.2 * nudge), rate, 'highpass', 4500, 0.8);
      const wash = filter(noiseBurst(rate, 1.6, 0.4, seed, 0.004), rate, 'highpass', 5000);
      w = add([body, 0.4], [wash, 0.9]);
      break;
    }
  }
  let peak = 0;
  for (const v of w) peak = Math.max(peak, Math.abs(v));
  if (peak > 0) for (let i = 0; i < w.length; i++) w[i] /= peak; // every sound starts at the same loudness
  const fade = Math.min(96, w.length); // end on silence so there is no click
  for (let i = 0; i < fade; i++) w[w.length - 1 - i] *= i / fade;
  return w;
}

// With drums on, the guitar steps back and the drums come forward, so the beat can be heard
export const GUITAR_WITH_DRUMS = 0.3;
export const DRUM_BOOST = 1;

export const VARIANTS = 3;
export const drumKey = (d: Pick<DrumEvent, 'kind' | 'variant'>) => `${d.kind}${d.variant ?? 0}`;

/** Buffers for the drums a part uses, keyed by `drumKey` (browser only). */
export function drumBuffers(ctx: BaseAudioContext, drums: DrumEvent[]): Map<string, AudioBuffer> {
  const out = new Map<string, AudioBuffer>();
  for (const d of drums) {
    const key = drumKey(d);
    if (out.has(key)) continue;
    const wave = renderDrum(d.kind, ctx.sampleRate, d.variant ?? 0);
    const buffer = ctx.createBuffer(1, wave.length, ctx.sampleRate);
    buffer.copyToChannel(wave, 0);
    out.set(key, buffer);
  }
  return out;
}

/**
 * Where the drums plug in: most of the signal goes straight through, and a little goes through a small
 * "room" (a short burst of fading noise), which is what makes drums sound like they are in a space.
 */
export function drumBus(ctx: BaseAudioContext, destination: AudioNode): AudioNode {
  const input = ctx.createGain();
  input.connect(destination);
  const length = Math.floor(ctx.sampleRate * 0.35);
  const impulse = ctx.createBuffer(2, length, ctx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const rnd = noise(5 + c * 31);
    const data = impulse.getChannelData(c);
    for (let i = 0; i < length; i++) data[i] = rnd() * Math.exp(-(i / ctx.sampleRate) / 0.08);
  }
  const room = ctx.createConvolver();
  room.buffer = impulse;
  const wet = ctx.createGain();
  wet.gain.value = 0.22;
  input.connect(room).connect(wet).connect(destination);
  return input;
}

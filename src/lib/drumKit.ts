// Drum sounds made from scratch (no audio files): a pitched sweep for the kick and toms, filtered noise
// for the snare, hats and crash. Each is rendered once into a buffer and played from there.
import type { DrumEvent, DrumKind } from './drums.ts';

// Noise that is the same every time, so a sound never changes between plays (and can be tested)
function noise(seed: number): () => number {
  let x = seed >>> 0 || 1;
  return () => {
    x = (Math.imul(x, 1664525) + 1013904223) >>> 0;
    return x / 2147483648 - 1;
  };
}

// Keeps only the high end of noise by differencing it (once for hats, twice for a bright crash)
function brighten(w: Float32Array<ArrayBuffer>, times: number): Float32Array<ArrayBuffer> {
  for (let t = 0; t < times; t++) {
    let prev = 0;
    for (let i = 0; i < w.length; i++) {
      const cur = w[i];
      w[i] = (cur - prev) * 0.5;
      prev = cur;
    }
  }
  return w;
}

function tone(rate: number, seconds: number, from: number, to: number, decay: number): Float32Array<ArrayBuffer> {
  const n = Math.floor(rate * seconds);
  const w = new Float32Array(n);
  let phase = 0;
  for (let i = 0; i < n; i++) {
    const t = i / n;
    const f = to + (from - to) * Math.exp(-t * 8); // a fast drop in pitch, then settling
    phase += (2 * Math.PI * f) / rate;
    w[i] = Math.sin(phase) * Math.exp(-(i / rate) * decay);
  }
  return w;
}

const mix = (a: Float32Array<ArrayBuffer>, b: Float32Array<ArrayBuffer>, gainB: number): Float32Array<ArrayBuffer> => {
  const out = new Float32Array(Math.max(a.length, b.length));
  for (let i = 0; i < out.length; i++) out[i] = (a[i] ?? 0) + (b[i] ?? 0) * gainB;
  return out;
};

function burst(rate: number, seconds: number, decay: number, seed: number): Float32Array<ArrayBuffer> {
  const n = Math.floor(rate * seconds);
  const rnd = noise(seed);
  const w = new Float32Array(n);
  for (let i = 0; i < n; i++) w[i] = rnd() * Math.exp(-(i / rate) * decay);
  return w;
}

export function renderDrum(kind: DrumKind, rate: number): Float32Array<ArrayBuffer> {
  let w: Float32Array<ArrayBuffer>;
  switch (kind) {
    case 'K': w = mix(tone(rate, 0.35, 150, 48, 11), brighten(burst(rate, 0.012, 300, 7), 1), 0.35); break;
    case 'S': w = mix(brighten(burst(rate, 0.22, 20, 11), 1), tone(rate, 0.12, 210, 170, 28), 0.55); break;
    case 'R': w = mix(tone(rate, 0.05, 1750, 1650, 90), brighten(burst(rate, 0.02, 200, 5), 1), 0.4); break;
    case 'H': w = brighten(burst(rate, 0.07, 70, 13), 2); break;
    case 'T': w = tone(rate, 0.3, 160, 95, 12); break;
    case 'C': w = brighten(burst(rate, 1.1, 4.5, 17), 2); break;
  }
  let peak = 0;
  for (const v of w) peak = Math.max(peak, Math.abs(v));
  if (peak > 0) for (let i = 0; i < w.length; i++) w[i] /= peak; // every sound starts at the same loudness
  const fade = Math.min(64, w.length); // end on silence so there is no click
  for (let i = 0; i < fade; i++) w[w.length - 1 - i] *= i / fade;
  return w;
}

/** Buffers for the drums a part uses (browser only). */
export function drumBuffers(ctx: BaseAudioContext, drums: DrumEvent[]): Map<DrumKind, AudioBuffer> {
  const out = new Map<DrumKind, AudioBuffer>();
  for (const d of drums) {
    if (out.has(d.kind)) continue;
    const wave = renderDrum(d.kind, ctx.sampleRate);
    const buffer = ctx.createBuffer(1, wave.length, ctx.sampleRate);
    buffer.copyToChannel(wave, 0);
    out.set(d.kind, buffer);
  }
  return out;
}

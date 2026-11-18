import type { BassEvent } from './bass.ts';
// Bass voices, built from scratch. Real bass notes sit below what a phone speaker can play, so each voice
// carries strong upper harmonics: a small speaker plays those and the ear fills in the low note,
// while headphones and larger speakers still get the weight of the fundamental.
export type BassVoice = 'electric' | 'upright' | 'synth';
type Wave = Float32Array<ArrayBuffer>;

export const BASS_VOICES: { id: BassVoice; name: string; desc: string }[] = [
  { id: 'electric', name: 'Electric bass', desc: 'A round, fingered electric bass.' },
  { id: 'upright', name: 'Upright bass', desc: 'A woody acoustic bass with a short thump.' },
  { id: 'synth', name: 'Synth bass', desc: 'A smooth analogue bass with a filter that closes as it plays.' },
];

export const BASS_LEVEL = 0.85; // next to a guitar note of the same gain

const SECONDS = 2; // each pitch is rendered once at this length; shorter notes are cut with a quick fade

function noise(seed: number): () => number {
  let x = seed >>> 0 || 1;
  return () => {
    x = (Math.imul(x, 1664525) + 1013904223) >>> 0;
    return x / 2147483648 - 1;
  };
}

function normalise(w: Wave): Wave {
  let peak = 0;
  for (const v of w) peak = Math.max(peak, Math.abs(v));
  if (peak > 0) for (let i = 0; i < w.length; i++) w[i] /= peak;
  const fade = Math.min(480, w.length);
  for (let i = 0; i < fade; i++) w[w.length - 1 - i] *= i / fade; // end on silence
  return w;
}

// The fundamental plus overtones. `weights[n]` is the strength of harmonic n + 1 and `taus[n]` how long it lasts.
function additive(freq: number, rate: number, weights: number[], tau: (n: number) => number): Wave {
  const w = new Float32Array(Math.floor(rate * SECONDS));
  weights.forEach((weight, idx) => {
    const n = idx + 1;
    if (freq * n > rate * 0.45) return;
    const step = (2 * Math.PI * freq * n) / rate;
    const t = tau(n);
    let phase = 0;
    for (let i = 0; i < w.length; i++) {
      phase += step;
      w[i] += Math.sin(phase) * weight * Math.exp(-(i / rate) / t);
    }
  });
  return w;
}

export function renderBass(voice: BassVoice, freq: number, rate: number): Wave {
  switch (voice) {
    case 'upright': {
      // A pitch that starts a touch sharp and settles, the thump of the string, and a quick decay
      const w = additive(freq, rate, [1, 0.9, 0.6, 0.4, 0.25, 0.15], (n) => 0.5 / (1 + 0.5 * n));
      const rnd = noise(11);
      let lp = 0;
      for (let i = 0; i < Math.floor(rate * 0.04); i++) {
        lp += 0.12 * (rnd() - lp); // low-passed noise: the finger on the string
        w[i] += lp * 1.8 * (1 - i / (rate * 0.04));
      }
      return normalise(w);
    }
    case 'synth': {
      const w = new Float32Array(Math.floor(rate * SECONDS));
      const dt = freq / rate;
      let phase = 0;
      let sub = 0;
      let a = 0;
      let b = 0;
      for (let i = 0; i < w.length; i++) {
        const t = i / rate;
        phase = (phase + dt) % 1;
        sub += (2 * Math.PI * freq) / rate;
        const saw = 2 * phase - 1;
        const cutoff = 220 + 1600 * Math.exp(-t / 0.25);
        const k = 1 - Math.exp((-2 * Math.PI * cutoff) / rate);
        a += k * (saw - a);
        b += k * (a - b);
        w[i] = (b * 1.4 + Math.sin(sub) * 0.7) * Math.min(1, t / 0.005) * (0.6 + 0.4 * Math.exp(-t / 1.2));
      }
      return normalise(w);
    }
    default: {
      // The overtones of a fingered electric bass fade faster than its fundamental
      const w = additive(freq, rate, [1, 0.85, 0.55, 0.35, 0.22, 0.12], (n) => 1.3 / (1 + 0.9 * n));
      const rnd = noise(23);
      for (let i = 0; i < Math.floor(rate * 0.012); i++) w[i] += rnd() * 0.25 * (1 - i / (rate * 0.012)); // the fingertip
      return normalise(w);
    }
  }
}

/** One buffer per pitch the bass part uses (browser only). */
export function bassBuffers(ctx: BaseAudioContext, voice: BassVoice, events: BassEvent[]): Map<number, AudioBuffer> {
  const out = new Map<number, AudioBuffer>();
  for (const e of events) {
    if (out.has(e.midi)) continue;
    const wave = renderBass(voice, 440 * 2 ** ((e.midi - 69) / 12), ctx.sampleRate);
    const buffer = ctx.createBuffer(1, wave.length, ctx.sampleRate);
    buffer.copyToChannel(wave, 0);
    out.set(e.midi, buffer);
  }
  return out;
}

/** Schedules one bass note, holding it for its length and then fading it quickly so notes do not run together. */
export function playBassNote(ctx: BaseAudioContext, out: AudioNode, buffers: Map<number, AudioBuffer>, e: BassEvent, when: number, stepSeconds: number): AudioBufferSourceNode {
  const src = ctx.createBufferSource();
  src.buffer = buffers.get(e.midi)!;
  const gain = ctx.createGain();
  const level = e.gain * BASS_LEVEL;
  const end = when + Math.min(SECONDS - 0.05, Math.max(0.08, e.steps * stepSeconds * 0.97));
  gain.gain.setValueAtTime(level, when);
  gain.gain.setValueAtTime(level, Math.max(when, end - 0.04));
  gain.gain.linearRampToValueAtTime(0, end);
  src.connect(gain).connect(out);
  src.start(when);
  src.stop(end + 0.02);
  return src;
}

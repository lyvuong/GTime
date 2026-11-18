// Plays a phrase through Web Audio using plucked-string notes. Browser only.
import type { Phrase } from './patterns';
import { renderPluck } from './pluck';

export interface PlayOptions {
  bpm: number;
  onBar?: (bar: number) => void;
  onEnd?: () => void;
}

const STRUM_SPREAD = 0.014; // seconds between strings in a strum

/** Starts playing and returns a function that stops it. */
export function playPhrase(phrase: Phrase, { bpm, onBar, onEnd }: PlayOptions): () => void {
  const ctx = new AudioContext();
  const master = ctx.createGain();
  master.gain.value = 0.7;
  const limiter = ctx.createDynamicsCompressor(); // a strum stacks six notes; keep it from clipping
  master.connect(limiter).connect(ctx.destination);

  const barSeconds = (60 / bpm) * phrase.beats;
  const stepSeconds = barSeconds / phrase.stepsPerBar; // an eighth in 4/4, a triplet eighth in 12/8
  const t0 = ctx.currentTime + 0.1;

  const buffers = new Map<number, AudioBuffer>();
  const bufferFor = (midi: number) => {
    let b = buffers.get(midi);
    if (!b) {
      const freq = 440 * 2 ** ((midi - 69) / 12);
      const wave = renderPluck(freq, ctx.sampleRate);
      b = ctx.createBuffer(1, wave.length, ctx.sampleRate);
      b.copyToChannel(wave, 0);
      buffers.set(midi, b);
    }
    return b;
  };

  const sources: AudioBufferSourceNode[] = [];
  for (const e of phrase.events) {
    const src = ctx.createBufferSource();
    src.buffer = bufferFor(e.midi);
    const gain = ctx.createGain();
    gain.gain.value = e.gain;
    src.connect(gain).connect(master);
    src.start(t0 + e.bar * barSeconds + e.step * stepSeconds + e.order * STRUM_SPREAD);
    sources.push(src);
  }

  const timers: number[] = [];
  for (let bar = 0; bar < phrase.bars; bar++) {
    timers.push(window.setTimeout(() => onBar?.(bar), 100 + bar * barSeconds * 1000));
  }

  let stopped = false;
  const stop = () => {
    if (stopped) return;
    stopped = true;
    timers.forEach(clearTimeout);
    sources.forEach((s) => {
      try {
        s.stop();
      } catch {
        /* never started */
      }
    });
    ctx.close().catch(() => {});
    onEnd?.();
  };
  // Let the last note ring out, then clean up
  timers.push(window.setTimeout(stop, 100 + phrase.bars * barSeconds * 1000 + 1200));
  return stop;
}

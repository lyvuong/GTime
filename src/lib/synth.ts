// Plays a phrase through Web Audio using plucked-string notes. Browser only.
import type { Phrase } from './patterns';
import { DRUM_BOOST, drumBuffers, GUITAR_WITH_DRUMS } from './drumKit';
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
  limiter.attack.value = 0.002; // catch the first hit of a loud strum or drum
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
    gain.gain.value = e.gain * ((phrase.drums?.length ?? 0) > 0 ? GUITAR_WITH_DRUMS : 1);
    src.connect(gain).connect(master);
    src.start(t0 + e.bar * barSeconds + e.step * stepSeconds + e.order * STRUM_SPREAD);
    sources.push(src);
  }

  // The drum part, when there is one
  const drums = phrase.drums ?? [];
  const kit = drumBuffers(ctx, drums);
  for (const d of drums) {
    const src = ctx.createBufferSource();
    src.buffer = kit.get(d.kind)!;
    const gain = ctx.createGain();
    gain.gain.value = d.gain * DRUM_BOOST;
    src.connect(gain).connect(master);
    src.start(t0 + d.bar * barSeconds + d.step * stepSeconds);
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
    releaseAudio(stop);
    onEnd?.();
  };
  claimAudio(stop);
  // Let the last note ring out, then clean up
  timers.push(window.setTimeout(stop, 100 + phrase.bars * barSeconds * 1000 + 1200));
  return stop;
}

// Only one thing plays at a time: starting something stops whatever was playing before it
let currentStop: (() => void) | null = null;

export function claimAudio(stop: () => void): void {
  const previous = currentStop;
  currentStop = stop;
  if (previous && previous !== stop) previous();
}

export function releaseAudio(stop: () => void): void {
  if (currentStop === stop) currentStop = null;
}

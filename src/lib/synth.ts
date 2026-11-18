// Plays a phrase through Web Audio using plucked-string notes. Browser only.
import type { Phrase } from './patterns';
import { DRUM_BOOST, drumBuffers, drumBus, drumKey, GUITAR_WITH_DRUMS } from './drumKit';
import { LEVEL, noteSeconds, renderNote, type Instrument } from './instruments';

export interface PlayOptions {
  bpm: number;
  instrument?: Instrument;
  onBar?: (bar: number) => void;
  onEnd?: () => void;
}

/**
 * A safety limiter: it does nothing until the sound gets close to the top, then holds it there. (The
 * default compressor starts working far below that, so every loud drum hit would turn the rest down
 * and the sound would pump.)
 */
export function makeLimiter(ctx: BaseAudioContext): DynamicsCompressorNode {
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -2;
  limiter.knee.value = 0;
  limiter.ratio.value = 20;
  limiter.attack.value = 0.001;
  limiter.release.value = 0.1;
  return limiter;
}

const STRUM_SPREAD = 0.014; // seconds between strings in a strum

/** Starts playing and returns a function that stops it. */
export function playPhrase(phrase: Phrase, { bpm, instrument = 'guitar', onBar, onEnd }: PlayOptions): () => void {
  const ctx = new AudioContext();
  const master = ctx.createGain();
  master.gain.value = 0.7;
  master.connect(makeLimiter(ctx)).connect(ctx.destination);

  const barSeconds = (60 / bpm) * phrase.beats;
  const stepSeconds = barSeconds / phrase.stepsPerBar; // an eighth in 4/4, a triplet eighth in 12/8
  const t0 = ctx.currentTime + 0.1;

  const buffers = new Map<number, AudioBuffer>();
  const bufferFor = (midi: number) => {
    let b = buffers.get(midi);
    if (!b) {
      const freq = 440 * 2 ** ((midi - 69) / 12);
      const wave = renderNote(instrument, freq, ctx.sampleRate, noteSeconds(instrument, bpm, phrase.beats, phrase.stepsPerBar));
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
    gain.gain.value = e.gain * LEVEL[instrument] * ((phrase.drums?.length ?? 0) > 0 ? GUITAR_WITH_DRUMS : 1);
    src.connect(gain).connect(master);
    src.start(t0 + e.bar * barSeconds + e.step * stepSeconds + e.order * STRUM_SPREAD);
    sources.push(src);
  }

  // The drum part, when there is one
  const drums = phrase.drums ?? [];
  const kit = drumBuffers(ctx, drums);
  const kitIn = drums.length ? drumBus(ctx, master) : master;
  for (const d of drums) {
    const src = ctx.createBufferSource();
    src.buffer = kit.get(drumKey(d))!;
    const gain = ctx.createGain();
    gain.gain.value = d.gain * DRUM_BOOST;
    src.connect(gain).connect(kitIn);
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

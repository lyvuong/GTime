// A live looper: record a take from the microphone, replay it in a gapless loop, and layer more takes on top.
// Every layer is the same length as the first take and is kept as its own buffer, so undo just drops the last one.

export const MAX_LOOP_SECONDS = 60;
const FADE_SECONDS = 0.005; // a few ms of fade at each end of a take hides the click at the loop seam
const MIN_LEAD_SECONDS = 0.05; // an overdub needs a little time to arm before the loop comes round

export type LooperState = 'idle' | 'recording' | 'playing' | 'overdubbing';

/** When the loop next starts a new pass, at least `minLead` seconds from `now` (all times in seconds). */
export function nextBoundary(loopStart: number, now: number, loopLength: number, minLead = MIN_LEAD_SECONDS): number {
  const passes = Math.ceil((now - loopStart) / loopLength);
  let boundary = loopStart + Math.max(passes, 0) * loopLength;
  while (boundary - now < minLead) boundary += loopLength;
  return boundary;
}

/** Where in the loop (seconds) a layer started at `when` should begin, so it lines up with the first take. */
export function layerOffset(loopStart: number, when: number, loopLength: number): number {
  const into = (when - loopStart) % loopLength;
  return into < 0 ? into + loopLength : into;
}

/** Ramps the first and last few milliseconds of a take to silence, in place. */
export function applyFades(data: Float32Array, sampleRate: number, fadeSeconds = FADE_SECONDS): Float32Array {
  const n = Math.min(Math.floor(sampleRate * fadeSeconds), Math.floor(data.length / 2));
  for (let i = 0; i < n; i++) {
    const g = i / n;
    data[i] *= g;
    data[data.length - 1 - i] *= g;
  }
  return data;
}

// Runs on the audio thread: copies mic samples into a take. `start` begins at once, or at an exact audio frame
// (so an overdub lines up with the loop); a take with a length ends itself, otherwise `stop` ends it.
const WORKLET_SOURCE = `
class LooperCapture extends AudioWorkletProcessor {
  constructor() {
    super();
    this.rec = null;
    this.meterSum = 0;
    this.meterCount = 0;
    this.port.onmessage = (e) => {
      const m = e.data;
      if (m.cmd === 'start') {
        this.rec = { startFrame: m.at ?? 0, length: m.length ?? Infinity, data: new Float32Array(m.capacity), written: 0 };
      } else if (m.cmd === 'stop') {
        this.finish();
      } else if (m.cmd === 'cancel') {
        this.rec = null;
      }
    };
  }
  finish() {
    const r = this.rec;
    if (!r) return;
    this.rec = null;
    const data = r.data.slice(0, r.written);
    this.port.postMessage({ type: 'take', data }, [data.buffer]);
  }
  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (!ch) return true;
    for (let i = 0; i < ch.length; i++) this.meterSum += ch[i] * ch[i];
    this.meterCount += ch.length;
    if (this.meterCount >= 2048) {
      this.port.postMessage({ type: 'level', rms: Math.sqrt(this.meterSum / this.meterCount) });
      this.meterSum = 0;
      this.meterCount = 0;
    }
    const r = this.rec;
    if (r) {
      const skip = Math.max(0, r.startFrame - currentFrame);
      const cap = Math.min(r.length, r.data.length);
      for (let i = skip; i < ch.length && r.written < cap; i++) r.data[r.written++] = ch[i];
      if (r.written >= cap) this.finish();
    }
    return true;
  }
}
registerProcessor('looper-capture', LooperCapture);
`;

export interface LooperSnapshot {
  state: LooperState;
  layers: number;
  seconds: number; // loop length, 0 until a first take exists
}

export class Looper {
  private ctx: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private node: AudioWorkletNode | null = null;
  private out: GainNode | null = null;
  private layers: { buffer: AudioBuffer; source: AudioBufferSourceNode }[] = [];
  private state: LooperState = 'idle';
  private loopStart = 0;
  private loopLength = 0;
  private overdubStart = 0; // ctx time the pending overdub begins
  private level = 0;

  private onChange: (s: LooperSnapshot) => void;

  constructor(onChange: (s: LooperSnapshot) => void) {
    this.onChange = onChange;
  }

  /**
   * Opens the microphone and audio graph. Must be called from a tap, or iOS keeps the audio silent.
   * `echoCancel` asks the browser to remove the loop's own sound from the mic, for playing through speakers;
   * it works on the signal, so it is off by default and headphones are better.
   */
  async init(echoCancel = false): Promise<void> {
    if (this.ctx) return;
    if (!navigator.mediaDevices?.getUserMedia) throw new Error('This browser or connection does not allow microphone access.');
    const ctx = new AudioContext();
    if (!ctx.audioWorklet) {
      ctx.close().catch(() => {});
      throw new Error('This browser cannot record for the looper. Try a recent Safari or Chrome.');
    }
    try {
      await ctx.resume();
      // Raw signal by default: voice processing would mangle a guitar
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: echoCancel, noiseSuppression: false, autoGainControl: false },
      });
      const url = URL.createObjectURL(new Blob([WORKLET_SOURCE], { type: 'application/javascript' }));
      try {
        await ctx.audioWorklet.addModule(url);
      } finally {
        URL.revokeObjectURL(url);
      }
    } catch (e) {
      this.stream?.getTracks().forEach((t) => t.stop());
      this.stream = null;
      ctx.close().catch(() => {});
      throw e;
    }
    const node = new AudioWorkletNode(ctx, 'looper-capture', { numberOfInputs: 1, numberOfOutputs: 0 });
    node.port.onmessage = (e) => {
      if (e.data.type === 'level') this.level = e.data.rms;
      else if (e.data.type === 'take') this.onTake(e.data.data as Float32Array);
    };
    ctx.createMediaStreamSource(this.stream!).connect(node);
    const out = ctx.createGain();
    out.connect(ctx.destination);
    this.ctx = ctx;
    this.node = node;
    this.out = out;
  }

  get inputLevel(): number {
    return this.level;
  }

  /** 0..1 position within the loop, for drawing the playhead. */
  get phase(): number {
    if (!this.ctx || this.loopLength === 0 || this.layers.length === 0) return 0;
    return layerOffset(this.loopStart, this.ctx.currentTime, this.loopLength) / this.loopLength;
  }

  private emit() {
    this.onChange({ state: this.state, layers: this.layers.length, seconds: this.loopLength });
  }

  /** Starts the first take. Tapping again ends it and starts the loop. */
  record() {
    if (!this.ctx || !this.node || this.state !== 'idle') return;
    const capacity = Math.floor(this.ctx.sampleRate * MAX_LOOP_SECONDS);
    this.node.port.postMessage({ cmd: 'start', capacity });
    this.state = 'recording';
    this.emit();
  }

  /** Ends the first take (or an overdub early, throwing it away). */
  stopRecording() {
    if (!this.node) return;
    if (this.state === 'recording') this.node.port.postMessage({ cmd: 'stop' });
    else if (this.state === 'overdubbing') {
      this.node.port.postMessage({ cmd: 'cancel' });
      this.state = 'playing';
      this.emit();
    }
  }

  /** Records one more pass over the loop, starting where the loop next comes round. */
  overdub() {
    if (!this.ctx || !this.node || this.state !== 'playing') return;
    const sr = this.ctx.sampleRate;
    const length = Math.round(this.loopLength * sr);
    this.overdubStart = nextBoundary(this.loopStart, this.ctx.currentTime, this.loopLength);
    this.node.port.postMessage({ cmd: 'start', at: Math.round(this.overdubStart * sr), length, capacity: length });
    this.state = 'overdubbing';
    this.emit();
  }

  /** Time until the pending overdub starts recording (0 once it has). */
  get armedFor(): number {
    if (!this.ctx || this.state !== 'overdubbing') return 0;
    return Math.max(0, this.overdubStart - this.ctx.currentTime);
  }

  private onTake(data: Float32Array) {
    const ctx = this.ctx;
    if (!ctx || data.length === 0) {
      this.state = this.layers.length ? 'playing' : 'idle';
      this.emit();
      return;
    }
    if (this.state === 'recording') {
      if (data.length < ctx.sampleRate * 0.2) {
        // an accidental double tap: not a loop
        this.state = 'idle';
        this.emit();
        return;
      }
      this.loopLength = data.length / ctx.sampleRate;
      this.loopStart = ctx.currentTime + 0.05;
      this.addLayer(data, this.loopStart);
      this.state = 'playing';
    } else if (this.state === 'overdubbing') {
      // The take covers exactly one pass from `overdubStart`; join the loop at the matching point in the next pass
      const when = ctx.currentTime + 0.03;
      this.addLayer(data, when);
      this.state = 'playing';
    }
    this.emit();
  }

  private addLayer(data: Float32Array, when: number) {
    const ctx = this.ctx!;
    const buffer = ctx.createBuffer(1, data.length, ctx.sampleRate);
    buffer.copyToChannel(applyFades(data, ctx.sampleRate) as Float32Array<ArrayBuffer>, 0);
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    source.connect(this.out!);
    source.start(when, layerOffset(this.loopStart, when, this.loopLength));
    this.layers.push({ buffer, source });
  }

  /** Drops the most recent layer; undoing the only layer clears the loop. */
  undo() {
    if (this.state !== 'playing') return;
    const last = this.layers.pop();
    if (last) this.stopSource(last.source);
    if (this.layers.length === 0) this.dispose();
    this.emit();
  }

  /** Stops everything and closes the microphone; the next Record opens it again. */
  clear() {
    this.dispose();
    this.emit();
  }

  private stopSource(source: AudioBufferSourceNode) {
    try {
      source.stop();
    } catch {
      /* not started yet */
    }
    source.disconnect();
  }

  /** Releases the microphone and audio device. */
  dispose() {
    this.layers.forEach((l) => this.stopSource(l.source));
    this.layers = [];
    this.stream?.getTracks().forEach((t) => t.stop());
    this.node?.disconnect();
    this.ctx?.close().catch(() => {});
    this.stream = null;
    this.node = null;
    this.out = null;
    this.ctx = null;
    this.state = 'idle';
    this.loopLength = 0;
    this.level = 0;
  }
}

// Plays a whole song as a backing track. Unlike a short intro, a song can run for minutes, so the notes
// are scheduled a little ahead of the clock instead of all at once, and playback can start part-way
// through, loop one paragraph, and report which bar is sounding so the sheet can follow along.
import type { NoteEvent, Phrase } from './patterns';
import { drumBuffers } from './drumKit';
import type { DrumEvent } from './drums';
import { renderPluck } from './pluck';
import { claimAudio, releaseAudio } from './synth';

export interface PlayAlongLive {
  volume: number; // 0 to 1, read as the track plays
  click: boolean; // a click on every beat
  drums: number; // 0 to 1, how loud the drum part is
}

export interface PlayAlongOptions {
  bpm: number;
  startBar: number;
  loop: { start: number; end: number } | null; // repeat these bars (end exclusive)
  countIn: boolean;
  live: PlayAlongLive;
  cues?: { bar: number; quarter: number }[]; // chord changes part-way through a bar
  onBar: (position: number | null) => void; // the bar (plus quarters/4 at a mid-bar chord change); null during the count-in
  onEnd: () => void;
}

const LOOKAHEAD = 1.5; // seconds scheduled ahead; generous so a throttled background tab keeps playing
const TICK_MS = 50;
const STRUM_SPREAD = 0.014;

export function playAlong(phrase: Phrase, opts: PlayAlongOptions): () => void {
  const { bpm, startBar, loop, countIn, live, onBar, onEnd } = opts;
  const cuesByBar = new Map<number, number[]>();
  for (const c of opts.cues ?? []) cuesByBar.set(c.bar, [...(cuesByBar.get(c.bar) ?? []), c.quarter]);
  const ctx = new AudioContext();
  const master = ctx.createGain();
  master.gain.value = live.volume;
  const limiter = ctx.createDynamicsCompressor();
  master.connect(limiter).connect(ctx.destination);

  const beatSeconds = 60 / bpm;
  const barSeconds = beatSeconds * phrase.beats;
  const stepSeconds = barSeconds / phrase.stepsPerBar;

  // Render every pitch the song uses up front, so nothing is computed while it plays
  const buffers = new Map<number, AudioBuffer>();
  for (const e of phrase.events) {
    if (buffers.has(e.midi)) continue;
    const wave = renderPluck(440 * 2 ** ((e.midi - 69) / 12), ctx.sampleRate);
    const buffer = ctx.createBuffer(1, wave.length, ctx.sampleRate);
    buffer.copyToChannel(wave, 0);
    buffers.set(e.midi, buffer);
  }
  // The drum part has its own level, so it can be turned up or down while it plays
  const drumMaster = ctx.createGain();
  drumMaster.gain.value = live.drums;
  drumMaster.connect(master);
  const kit = drumBuffers(ctx, phrase.drums ?? []);
  const drumsByBar = new Map<number, DrumEvent[]>();
  for (const d of phrase.drums ?? []) {
    const list = drumsByBar.get(d.bar);
    if (list) list.push(d);
    else drumsByBar.set(d.bar, [d]);
  }
  const byBar = new Map<number, NoteEvent[]>();
  for (const e of phrase.events) {
    const list = byBar.get(e.bar);
    if (list) list.push(e);
    else byBar.set(e.bar, [e]);
  }

  const live_sources = new Set<AudioScheduledSourceNode>();
  const track = (node: AudioScheduledSourceNode) => {
    live_sources.add(node);
    node.onended = () => live_sources.delete(node);
  };

  const noteAt = (e: NoteEvent, when: number) => {
    const src = ctx.createBufferSource();
    src.buffer = buffers.get(e.midi)!;
    const gain = ctx.createGain();
    gain.gain.value = e.gain;
    src.connect(gain).connect(master);
    src.start(when);
    track(src);
  };

  const drumAt = (d: DrumEvent, when: number) => {
    const src = ctx.createBufferSource();
    src.buffer = kit.get(d.kind)!;
    const gain = ctx.createGain();
    gain.gain.value = d.gain;
    src.connect(gain).connect(drumMaster);
    src.start(when);
    track(src);
  };

  const clickAt = (when: number, accent: boolean) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = accent ? 1900 : 1300;
    gain.gain.setValueAtTime(0.0001, when);
    gain.gain.exponentialRampToValueAtTime(accent ? 0.5 : 0.32, when + 0.004);
    gain.gain.exponentialRampToValueAtTime(0.0001, when + 0.05);
    osc.connect(gain).connect(master);
    osc.start(when);
    osc.stop(when + 0.06);
    track(osc);
  };

  // What has been scheduled, so the bar that is sounding now can be reported
  const log: { bar: number | null; time: number }[] = [];
  let t = ctx.currentTime + 0.15;
  if (countIn) {
    log.push({ bar: null, time: t });
    for (let b = 0; b < phrase.beats; b++) clickAt(t + b * beatSeconds, b === 0);
    t += barSeconds;
  }

  let bar = Math.max(0, Math.min(startBar, phrase.bars - 1));
  let done = phrase.bars === 0;
  const scheduleBar = () => {
    log.push({ bar, time: t });
    for (const q of cuesByBar.get(bar) ?? []) log.push({ bar: bar + q / 4, time: t + (q / 4) * barSeconds });
    for (const d of drumsByBar.get(bar) ?? []) drumAt(d, t + d.step * stepSeconds);
    for (const e of byBar.get(bar) ?? []) noteAt(e, t + e.step * stepSeconds + e.order * STRUM_SPREAD);
    if (live.click) for (let b = 0; b < phrase.beats; b++) clickAt(t + b * beatSeconds, b === 0);
    t += barSeconds;
    bar += 1;
    if (loop && bar >= loop.end) bar = loop.start;
    else if (!loop && bar >= phrase.bars) done = true;
  };

  let reported: (typeof log)[number] | undefined;
  let stopped = false;
  let timer = 0;
  const stop = () => {
    if (stopped) return;
    stopped = true;
    clearInterval(timer);
    live_sources.forEach((n) => {
      try {
        n.stop();
      } catch {
        /* not started yet */
      }
    });
    ctx.close().catch(() => {});
    releaseAudio(stop);
    onEnd();
  };

  const tick = () => {
    if (stopped) return;
    master.gain.value = live.volume;
    drumMaster.gain.value = live.drums;
    while (!done && t < ctx.currentTime + LOOKAHEAD) scheduleBar();
    const now = ctx.currentTime;
    while (log.length > 1 && log[1].time <= now) log.shift();
    const head = log[0];
    if (head && head.time <= now && head !== reported) {
      reported = head;
      onBar(head.bar);
    }
    if (done && now > t + 1.5) stop(); // the last chord has rung out
  };

  claimAudio(stop);
  tick();
  timer = window.setInterval(tick, TICK_MS);
  return stop;
}

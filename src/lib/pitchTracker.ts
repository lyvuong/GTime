// Smooths a stream of raw pitch readings so the needle is steady, survives a fading note, and
// is not dragged off by noise once the note has died away. Time and level are passed in (not read
// from a clock or the microphone) so the behaviour can be unit-tested.

const centsBetween = (a: number, b: number) => 1200 * Math.log2(a / b);

export interface TrackerOptions {
  smoothing: number; // 0..1, how far the median of recent readings pulls the value (lower is steadier)
  medianFrames: number; // readings in that median, so one odd reading can't nudge the needle
  agreeCents: number; // readings within this of the current value are treated as the same note
  confirmFrames: number; // consecutive readings needed before accepting a different pitch
  holdMs: number; // keep showing the last pitch this long after the readings stop
  onsetRatio: number; // a level jump of this factor between frames means a new pluck
  onsetWindowMs: number; // after a pluck, a different pitch may take over for this long
  tailRatio: number; // below this fraction of the note's peak level, a different pitch is just noise
  peakDecayMs: number; // how quickly the remembered peak level fades
}

export const DEFAULT_TRACKER: TrackerOptions = {
  smoothing: 0.2,
  medianFrames: 5,
  agreeCents: 35,
  confirmFrames: 3,
  holdMs: 3000,
  onsetRatio: 1.8,
  onsetWindowMs: 600, // longer than a few frames even on a slow phone
  tailRatio: 0.4,
  peakDecayMs: 2500,
};

export class PitchTracker {
  private current: number | null = null;
  private lastHit = 0;
  private lastTime = 0;
  private lastLevel = Infinity; // Infinity: the very first frame is not an "onset"
  private onsetUntil = -Infinity;
  private peak = 0;
  private candidate: number | null = null;
  private candidateCount = 0;
  private recent: number[] = [];
  private opts: TrackerOptions;

  constructor(opts: TrackerOptions = DEFAULT_TRACKER) {
    this.opts = opts;
  }

  /** The pitch currently being shown, if any. */
  get value(): number | null {
    return this.current;
  }

  reset() {
    this.current = null;
    this.candidate = null;
    this.candidateCount = 0;
    this.recent = [];
    this.peak = 0;
  }

  private accept(freq: number, now: number, level: number) {
    this.current = freq;
    this.lastHit = now;
    this.peak = Math.max(this.peak, level);
    this.candidate = null;
    this.candidateCount = 0;
    this.recent = [freq];
  }

  /**
   * Feed one frame: the detected pitch (or null) and the block's RMS level.
   * Returns the pitch to display, or null.
   */
  push(freq: number | null, now: number, level = 1): number | null {
    const o = this.opts;
    const dt = Math.max(0, now - this.lastTime);
    this.peak = Math.max(level, this.peak * Math.exp(-dt / o.peakDecayMs));

    // A jump in loudness is a new pluck. For a moment afterwards a different pitch may take over,
    // because the first frame of a pluck often has no clear pitch yet
    if (level > this.lastLevel * o.onsetRatio) {
      this.onsetUntil = now + o.onsetWindowMs;
      this.peak = level;
    }
    this.lastTime = now;
    this.lastLevel = level;
    const switching = now <= this.onsetUntil;

    if (freq === null) {
      if (this.current !== null && now - this.lastHit > o.holdMs) this.reset();
      return this.current;
    }

    // Starting from nothing needs a pluck too, so steady hum or room noise never lights the display
    if (this.current === null) {
      if (switching) this.accept(freq, now, level);
      return this.current;
    }

    const off = centsBetween(freq, this.current);
    if (Math.abs(off) <= o.agreeCents) {
      // Same note: ease toward the median of the last few readings (log-frequency domain)
      this.recent.push(freq);
      if (this.recent.length > o.medianFrames) this.recent.shift();
      const median = [...this.recent].sort((a, b) => a - b)[this.recent.length >> 1];
      this.current *= 2 ** ((o.smoothing * centsBetween(median, this.current)) / 1200);
      this.lastHit = now;
      this.candidate = null;
      this.candidateCount = 0;
      return this.current;
    }

    if (switching) {
      this.accept(freq, now, level);
      return this.current;
    }

    // A different pitch with no new pluck behind it. Once the note has faded this is almost
    // certainly room noise or hum, so keep the current note
    if (level < this.peak * o.tailRatio) return this.current;

    if (this.candidate !== null && Math.abs(centsBetween(freq, this.candidate)) <= o.agreeCents) {
      this.candidateCount++;
    } else {
      this.candidate = freq;
      this.candidateCount = 1;
    }
    if (this.candidateCount >= o.confirmFrames) this.accept(freq, now, level);
    return this.current;
  }
}

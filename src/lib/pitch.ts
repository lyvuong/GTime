// Monophonic pitch detection using the YIN algorithm (de Cheveigné & Kawahara, 2002).
// Pure function over a block of samples so it can be unit-tested without a microphone.

const SILENCE_RMS = 0.004; // below this the block is treated as silence
const LOOSE_LIMIT = 0.35; // the deepest dip must be at least this clear, or the block has no pitch

/**
 * Returns the fundamental frequency in Hz, or null when the block is too quiet or has no clear pitch.
 * The block should hold at least 2 * sampleRate / minFreq samples (8192 gives plenty of room at 48 kHz).
 *
 * Restricting minFreq/maxFreq to the strings being tuned rules out most octave mistakes outright.
 */
export function detectPitch(
  buf: Float32Array,
  sampleRate: number,
  minFreq = 60,
  maxFreq = 700,
  margin = 0.15,
): number | null {
  const n = buf.length;
  const half = Math.floor(n / 2);

  // Gate out silence and room hiss
  let energy = 0;
  for (let i = 0; i < n; i++) energy += buf[i] * buf[i];
  if (Math.sqrt(energy / n) < SILENCE_RMS) return null;

  const tauMax = Math.min(half, Math.floor(sampleRate / minFreq));
  const tauMin = Math.max(2, Math.floor(sampleRate / maxFreq));
  if (tauMax <= tauMin + 2) return null;

  // Difference function, then cumulative mean normalisation
  const cmnd = new Float32Array(tauMax + 1);
  cmnd[0] = 1;
  let running = 0;
  for (let tau = 1; tau <= tauMax; tau++) {
    let sum = 0;
    for (let j = 0; j < half; j++) {
      const diff = buf[j] - buf[j + tau];
      sum += diff * diff;
    }
    running += sum;
    cmnd[tau] = running === 0 ? 1 : (sum * tau) / running;
  }

  // The deepest dip says how periodic the block is. Anything shallower than LOOSE_LIMIT is noise
  let deepest = Infinity;
  for (let t = tauMin; t <= tauMax; t++) if (cmnd[t] < deepest) deepest = cmnd[t];
  if (deepest > LOOSE_LIMIT) return null;

  // A signal with period T is just as periodic at 2T, 3T and so on, and noise can make one of
  // those multiples the deepest dip. That reads as a note an octave or more too low, and the
  // multiple of a high E can land right on another string (E4 / 3 is almost exactly A2). So take
  // the SHORTEST period whose dip is nearly as deep as the best one.
  let tau = -1;
  for (let t = tauMin + 1; t < tauMax; t++) {
    if (cmnd[t] <= cmnd[t - 1] && cmnd[t] <= cmnd[t + 1] && cmnd[t] <= deepest + margin) {
      tau = t;
      break;
    }
  }
  if (tau === -1) return null;

  // The first qualifying minimum can sit on the shoulder of the dip, a little short of its bottom.
  // Settle onto the bottom: the lowest point within a few percent of that period
  const reach = Math.min(tauMax, Math.ceil(tau * 1.04));
  for (let t = tau + 1; t <= reach; t++) if (cmnd[t] < cmnd[tau]) tau = t;

  // Parabolic interpolation around the minimum for sub-sample accuracy
  let better = tau;
  if (tau > 1 && tau < tauMax) {
    const s0 = cmnd[tau - 1];
    const s1 = cmnd[tau];
    const s2 = cmnd[tau + 1];
    const denom = 2 * (2 * s1 - s2 - s0);
    if (denom !== 0) better = tau + (s2 - s0) / denom;
  }
  return sampleRate / better;
}

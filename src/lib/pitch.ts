// Monophonic pitch detection using the YIN algorithm (de Cheveigné & Kawahara, 2002).
// Pure function over a block of samples so it can be unit-tested without a microphone.

/**
 * Returns the fundamental frequency in Hz, or null when the block is too quiet or has no clear pitch.
 * The block should hold at least 2 * sampleRate / minFreq samples (4096 at 44.1/48 kHz for 60 Hz).
 */
export function detectPitch(
  buf: Float32Array,
  sampleRate: number,
  minFreq = 60,
  maxFreq = 700,
  threshold = 0.12,
): number | null {
  const n = buf.length;
  const half = Math.floor(n / 2);

  // Gate out silence and room hiss
  let energy = 0;
  for (let i = 0; i < n; i++) energy += buf[i] * buf[i];
  if (Math.sqrt(energy / n) < 0.01) return null;

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

  // First dip under the threshold, walked down to its local minimum
  let tau = -1;
  for (let t = tauMin; t <= tauMax; t++) {
    if (cmnd[t] < threshold) {
      while (t + 1 <= tauMax && cmnd[t + 1] < cmnd[t]) t++;
      tau = t;
      break;
    }
  }
  if (tau === -1) return null;

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

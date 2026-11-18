// A plucked-string sound made with the Karplus-Strong method: a burst of noise circulates through a
// short delay line that slowly loses its high end, which is much like a real string. Rendered as plain
// samples so it can be tested without a browser.

/** Renders `seconds` of a plucked string at `freq` Hz. */
export function renderPluck(freq: number, sampleRate: number, seconds = 1.8): Float32Array<ArrayBuffer> {
  const n = Math.floor(sampleRate * seconds);
  const out = new Float32Array(n);

  // The averaging filter adds half a sample of delay, so the line is a little shorter than a full period.
  // A fractional part is handled by an all-pass filter so high notes stay in tune.
  const total = sampleRate / freq - 0.5;
  let len = Math.floor(total);
  let frac = total - len;
  if (frac < 0.1) {
    len -= 1;
    frac += 1;
  }
  const coef = (1 - frac) / (1 + frac);
  const decay = 0.9965;

  // Fixed seed: every pluck of the same note sounds the same
  let seed = 12345;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32) * 2 - 1;
  const line = new Float32Array(len);
  let soft = 0;
  for (let i = 0; i < len; i++) {
    soft = 0.6 * soft + 0.4 * rnd(); // a rounded burst: less hiss, more pluck
    line[i] = soft;
  }

  let idx = 0;
  let prev = 0; // previous output of the delay line
  let apOut = 0;
  let apIn = 0;
  for (let i = 0; i < n; i++) {
    const x = line[idx];
    out[i] = x;
    const lp = 0.5 * (x + prev);
    prev = x;
    const ap = coef * (lp - apOut) + apIn;
    apOut = ap;
    apIn = lp;
    line[idx] = decay * ap;
    idx = (idx + 1) % len;
  }

  // Normalise to a fixed peak and fade the tail so notes never click off
  let peak = 0;
  for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(out[i]));
  const scale = peak > 0 ? 0.9 / peak : 0;
  const fade = Math.floor(sampleRate * 0.15);
  for (let i = 0; i < n; i++) out[i] *= scale * (i > n - fade ? (n - 1 - i) / fade : 1);
  return out;
}

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Mic, MicOff, Volume2 } from 'lucide-react';
import { detectPitch } from '../lib/pitch';
import { PitchTracker } from '../lib/pitchTracker';
import { IN_TUNE_CENTS, midiToFreq, noteName, noteOctave, readingFor, snapToTuning, TUNINGS, tuningRange } from '../lib/tuning';

type Status = 'idle' | 'starting' | 'listening' | 'error';

const FFT_SIZE = 8192; // a long window: low strings need several full cycles to read steadily
const FRAME_MS = 55;
const GAUGE_RANGE = 50; // cents shown either side of centre
// Open the app with ?debug to get a "Copy debug log" button on the tuner (for diagnosing a problem)
const DEBUG = new URLSearchParams(window.location.search).has('debug');

const blockRms = (buf: Float32Array) => {
  let sum = 0;
  for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
  return Math.sqrt(sum / buf.length);
};

function loadTuningId(): string {
  try {
    const id = localStorage.getItem('gtime_tuning');
    if (id && TUNINGS.some((t) => t.id === id)) return id;
  } catch {
    /* storage unavailable */
  }
  return TUNINGS[0].id;
}

export function Tuner() {
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState('');
  const [freq, setFreq] = useState<number | null>(null);
  const [tuningId, setTuningId] = useState(loadTuningId);

  const ctxRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef(0);
  const toneUntilRef = useRef(0); // ignore the mic while a reference tone is playing
  const trackerRef = useRef(new PitchTracker());
  const debugLogRef = useRef<string[]>([]);
  const [copied, setCopied] = useState(false);

  const tuning =TUNINGS.find((t) => t.id === tuningId) ?? TUNINGS[0];
  const tuningRef = useRef(tuning);
  tuningRef.current = tuning; // the listening loop reads the tuning that is current, not the one at start
  const reading = useMemo(() => (freq ? readingFor(freq, tuning) : null), [freq, tuning]);

  const stop = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    ctxRef.current?.close().catch(() => {});
    ctxRef.current = null;
    setFreq(null);
    setStatus('idle');
  }, []);

  // Always release the microphone when leaving the tuner
  useEffect(() => stop, [stop]);

  const start = async () => {
    setStatus('starting');
    setError('');
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error('This browser or connection does not allow microphone access.');
      // Tuning needs the raw signal, so switch off the phone's voice processing
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      });
      ctxRef.current?.close().catch(() => {}); // drop a context left over from a reference tone
      const ctx = new AudioContext();
      const analyser = ctx.createAnalyser();
      analyser.fftSize = FFT_SIZE;
      ctx.createMediaStreamSource(stream).connect(analyser);
      streamRef.current = stream;
      ctxRef.current = ctx;

      const buf = new Float32Array(analyser.fftSize);
      const tracker = trackerRef.current;
      tracker.reset();
      let last = 0;
      const loop = (t: number) => {
        rafRef.current = requestAnimationFrame(loop);
        if (t - last < FRAME_MS || t < toneUntilRef.current) return;
        last = t;
        analyser.getFloatTimeDomainData(buf);
        // Only look for pitches a string could make, fold octave slips onto the nearest string,
        // then smooth. The tracker keeps the note up while it fades and ignores noise afterwards
        const tn = tuningRef.current;
        const { min, max } = tuningRange(tn);
        const raw = detectPitch(buf, ctx.sampleRate, min, max);
        const snapped = raw === null ? null : snapToTuning(raw, tn, tracker.value);
        const level = blockRms(buf);
        const shown = tracker.push(snapped, t, level);
        if (DEBUG) {
          const log = debugLogRef.current;
          log.push(`${Math.round(t)},${level.toFixed(4)},${raw?.toFixed(2) ?? ''},${snapped?.toFixed(2) ?? ''},${shown?.toFixed(2) ?? ''}`);
          if (log.length > 400) log.shift();
        }
        setFreq(shown);
      };
      rafRef.current = requestAnimationFrame(loop);
      setStatus('listening');
    } catch (e) {
      const denied = e instanceof DOMException && (e.name === 'NotAllowedError' || e.name === 'SecurityError');
      const missing = e instanceof DOMException && e.name === 'NotFoundError';
      setError(
        denied
          ? 'Microphone access was blocked. Allow it in your browser settings and try again.'
          : missing
            ? 'No microphone was found on this device.'
            : e instanceof Error
              ? e.message
              : 'Could not start the microphone.',
      );
      stop();
      setStatus('error');
    }
  };

  // Plays a reference tone for a string so you can tune by ear
  const playTone = (midi: number) => {
    const ctx = ctxRef.current ?? new AudioContext();
    if (!ctxRef.current) ctxRef.current = ctx;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const now = ctx.currentTime;
    osc.type = 'triangle';
    osc.frequency.value = midiToFreq(midi);
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.3, now + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 1.6);
    osc.connect(gain).connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 1.7);
    toneUntilRef.current = performance.now() + 1800;
    trackerRef.current.reset();
    setFreq(null);
  };

  const changeTuning = (id: string) => {
    trackerRef.current.reset();
    setFreq(null);
    setTuningId(id);
    try {
      localStorage.setItem('gtime_tuning', id);
    } catch {
      /* storage unavailable */
    }
  };

  const cents = reading ? reading.cents : 0;
  const roundedCents = Math.round(cents) + 0; // + 0 turns -0 into 0
  const inTune = reading !== null && Math.abs(cents) <= IN_TUNE_CENTS;
  const needle = Math.max(-GAUGE_RANGE, Math.min(GAUGE_RANGE, cents));
  const tone = inTune ? 'text-emerald-400' : 'text-stage-accent';
  const hint = !reading
    ? status === 'listening'
      ? 'Pluck a string…'
      : ''
    : inTune
      ? 'In tune'
      : cents > 0
        ? 'Too high: tune down'
        : 'Too low: tune up';

  return (
    <div className="max-w-md mx-auto pt-2 space-y-5">
      <select
        value={tuningId}
        onChange={(e) => changeTuning(e.target.value)}
        className="w-full px-3 py-2.5 rounded-xl bg-stage-card border border-stage-border text-sm focus:outline-none focus:border-stage-accent"
        aria-label="Tuning"
      >
        {TUNINGS.map((t) => (
          <option key={t.id} value={t.id}>
            {t.name}
          </option>
        ))}
      </select>

      {/* Readout */}
      <div className="rounded-2xl bg-stage-card border border-stage-border p-5 text-center" aria-live="polite">
        <div className={`h-24 flex items-end justify-center gap-1 font-extrabold tracking-tight ${tone}`}>
          {reading ? (
            <>
              <span className="text-7xl leading-none">{noteName(reading.targetMidi)}</span>
              <span className="text-2xl mb-1 text-stage-muted">{noteOctave(reading.targetMidi)}</span>
            </>
          ) : (
            <span className="text-7xl leading-none text-stage-border">–</span>
          )}
        </div>
        <div className="mt-1 h-5 text-sm font-semibold">
          <span className={reading ? tone : 'text-stage-muted'}>{hint}</span>
        </div>

        {/* Gauge */}
        <div className="relative mt-4 h-10" role="img" aria-label={reading ? `${roundedCents} cents` : 'No signal'}>
          <div className="absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-stage-border" />
          {[-50, -25, 0, 25, 50].map((c) => (
            <div
              key={c}
              className={`absolute top-1/2 -translate-y-1/2 w-px ${c === 0 ? 'h-8 bg-stage-text' : 'h-4 bg-stage-muted/60'}`}
              style={{ left: `${50 + c}%` }}
            />
          ))}
          {reading && (
            <div
              className={`absolute top-1/2 w-1.5 h-9 -translate-x-1/2 -translate-y-1/2 rounded-full transition-[left] duration-150 ${
                inTune ? 'bg-emerald-400' : 'bg-stage-accent'
              }`}
              style={{ left: `${50 + needle}%` }}
            />
          )}
        </div>
        <div className="flex justify-between text-[10px] font-mono text-stage-muted mt-1">
          <span>♭ −50</span>
          <span>0</span>
          <span>+50 ♯</span>
        </div>
        <div className="mt-2 h-5 font-mono text-xs text-stage-muted">
          {reading && `${roundedCents > 0 ? '+' : ''}${roundedCents} cents · ${reading.freq.toFixed(1)} Hz`}
        </div>
      </div>

      {/* Strings: highlights the detected one, tap to hear it */}
      <div>
        <div className="grid grid-cols-6 gap-2">
          {tuning.strings.map((midi, i) => {
            const active = reading?.stringIndex === i;
            return (
              <button
                key={`${tuning.id}-${i}`}
                onClick={() => playTone(midi)}
                className={`py-2.5 rounded-xl border font-bold text-sm transition ${
                  active
                    ? inTune
                      ? 'bg-emerald-500/20 border-emerald-400 text-emerald-400'
                      : 'bg-stage-accent/20 border-stage-accent text-stage-accent'
                    : 'bg-stage-card border-stage-border text-stage-text hover:bg-stage-cardHover'
                }`}
                aria-label={`Play ${noteName(midi)}${noteOctave(midi)}`}
              >
                {noteName(midi)}
                <span className="block text-[10px] font-mono font-normal text-stage-muted">{noteOctave(midi)}</span>
              </button>
            );
          })}
        </div>
        <p className="mt-2 flex items-center justify-center gap-1 text-[11px] text-stage-muted">
          <Volume2 className="w-3 h-3" /> Tap a string to hear its reference note
        </p>
      </div>

      {status === 'listening' ? (
        <button onClick={stop} className="w-full py-3 rounded-xl bg-stage-card border border-stage-border font-semibold flex items-center justify-center gap-2">
          <MicOff className="w-4 h-4" /> Stop listening
        </button>
      ) : (
        <button
          onClick={start}
          disabled={status === 'starting'}
          className="w-full py-3 rounded-xl bg-stage-accent text-slate-950 font-bold flex items-center justify-center gap-2 disabled:opacity-60"
        >
          <Mic className="w-4 h-4" /> {status === 'starting' ? 'Starting…' : 'Start tuner'}
        </button>
      )}
      {status === 'error' && <p className="text-sm text-red-400 text-center">{error}</p>}
      {DEBUG && (
        <button
          onClick={async () => {
            const text = `ms,level,raw_hz,snapped_hz,shown_hz,tuning=${tuning.id}\n${debugLogRef.current.join('\n')}`;
            try {
              await navigator.clipboard.writeText(text);
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            } catch {
              window.prompt('Copy this log', text);
            }
          }}
          className="w-full py-2 rounded-xl border border-dashed border-stage-border text-xs text-stage-muted"
        >
          {copied ? 'Copied' : `Copy debug log (${debugLogRef.current.length} frames)`}
        </button>
      )}
      {status === 'idle' && (
        <p className="text-[11px] text-stage-muted text-center">
          The tuner listens through your microphone and nothing is recorded or sent anywhere.
        </p>
      )}
    </div>
  );
}

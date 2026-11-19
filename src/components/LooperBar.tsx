import { useEffect, useRef, useState } from 'react';
import { Circle, Layers, Square, Trash2, Undo2 } from 'lucide-react';
import { Looper, type LooperSnapshot } from '../lib/looper';

const IDLE: LooperSnapshot = { state: 'idle', layers: 0, seconds: 0 };

// A slim looper for the bottom of the song view: record a phrase, loop it, layer more on top, while the chart stays in sight
export function LooperBar() {
  const [snap, setSnap] = useState<LooperSnapshot>(IDLE);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState('');
  const [speakers, setSpeakers] = useState(() => {
    try {
      return localStorage.getItem('gtime_looper_speakers') === '1';
    } catch {
      return false;
    }
  });
  const [armed, setArmed] = useState(false); // an overdub waiting for the loop to come round
  const looperRef = useRef<Looper | null>(null);
  const meterRef = useRef<HTMLDivElement>(null);
  const playheadRef = useRef<HTMLDivElement>(null);

  if (!looperRef.current) looperRef.current = new Looper(setSnap);
  const looper = looperRef.current;

  // Release the microphone when leaving the song
  useEffect(() => () => looper.dispose(), [looper]);

  // Input meter and loop playhead are drawn straight to the DOM, not through React state
  useEffect(() => {
    let raf = 0;
    let level = 0;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      level = Math.max(looper.inputLevel, level * 0.9);
      if (meterRef.current) meterRef.current.style.width = `${Math.min(100, Math.sqrt(level) * 140)}%`;
      if (playheadRef.current) playheadRef.current.style.left = `${looper.phase * 100}%`;
      setArmed(looper.armedFor > 0);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [looper]);

  const main = async () => {
    setError('');
    try {
      if (snap.state === 'idle') {
        setStarting(true);
        await looper.init(speakers);
        setStarting(false);
        looper.record();
      } else if (snap.state === 'playing') looper.overdub();
      else looper.stopRecording();
    } catch (e) {
      setStarting(false);
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
    }
  };

  const toggleSpeakers = (on: boolean) => {
    setSpeakers(on);
    try {
      localStorage.setItem('gtime_looper_speakers', on ? '1' : '0');
    } catch {
      /* storage unavailable */
    }
  };

  const { state } = snap;
  const busy = state === 'recording' || state === 'overdubbing';
  const label = starting ? 'Starting…' : state === 'idle' ? 'Record' : state === 'recording' ? 'Stop & loop' : state === 'playing' ? 'Overdub' : armed ? 'Get ready…' : 'Cancel';
  const status =
    state === 'idle'
      ? speakers
        ? 'Looper · echo cancelling'
        : 'Looper · use headphones'
      : state === 'recording'
        ? 'Recording…'
        : state === 'overdubbing'
          ? armed
            ? 'Layer starts at the top of the loop'
            : 'Recording a layer…'
          : `Looping ${snap.seconds.toFixed(1)}s`;

  return (
    <div className="border-t-2 border-stage-border bg-stage-card/95 px-3 pt-1.5 pb-2" role="group" aria-label="Looper">
      {error && <p className="text-xs text-red-400 pb-1">{error}</p>}
      <div className="flex items-center gap-2">
        <button
          onClick={main}
          disabled={starting}
          className={`shrink-0 min-w-32 h-11 px-3 rounded-xl font-bold text-sm flex items-center justify-center gap-1.5 disabled:opacity-60 ${busy ? 'bg-red-500 text-white' : 'bg-stage-accent text-slate-950'}`}
        >
          {busy ? <Square className="w-4 h-4 fill-current" /> : <Circle className="w-4 h-4 fill-current" />} {label}
        </button>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 text-[11px] text-stage-muted" aria-live="polite">
            <span className="truncate">{status}</span>
            {state === 'idle' && (
              <label className="ml-auto shrink-0 flex items-center gap-1 cursor-pointer" title="Tick this when playing through the speakers: it stops the loop feeding back into the microphone">
                <input type="checkbox" checked={speakers} onChange={(e) => toggleSpeakers(e.target.checked)} /> Speakers
              </label>
            )}
            {snap.layers > 0 && (
              <span className="shrink-0 flex items-center gap-0.5">
                <Layers className="w-3 h-3" /> {snap.layers}
              </span>
            )}
          </div>
          <div className="relative mt-1 h-1.5 rounded-full bg-stage-border overflow-hidden" role="img" aria-label="Loop position">
            <div ref={playheadRef} className="absolute top-0 h-full w-1.5 -translate-x-1/2 rounded-full bg-stage-accent" style={{ display: snap.layers ? undefined : 'none' }} />
          </div>
          <div className="mt-1 h-0.5 rounded-full bg-stage-border overflow-hidden" role="img" aria-label="Input level">
            <div ref={meterRef} className="h-full bg-emerald-400" style={{ width: 0 }} />
          </div>
        </div>

        <button
          onClick={() => looper.undo()}
          disabled={state !== 'playing'}
          className="shrink-0 p-2.5 rounded-xl border border-stage-border disabled:opacity-40"
          aria-label="Undo last layer"
          title="Undo last layer"
        >
          <Undo2 className="w-4 h-4" />
        </button>
        <button
          onClick={() => looper.clear()}
          disabled={state === 'idle'}
          className="shrink-0 p-2.5 rounded-xl border border-stage-border disabled:opacity-40"
          aria-label="Clear loop"
          title="Clear loop"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

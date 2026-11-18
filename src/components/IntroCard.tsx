import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, Music2, Play, Square } from 'lucide-react';
import type { IntroOption } from '../lib/intro';
import { FILLS, type FillOptions, type FillStyle } from '../lib/fills';
import { buildPhrase, tabBars } from '../lib/patterns';
import type { Rhythm } from '../lib/useRhythm';
import { playPhrase } from '../lib/synth';

const STRING_LABELS = ['e', 'B', 'G', 'D', 'A', 'E'];

function loadTabOpen(): boolean {
  try {
    return localStorage.getItem('gtime_tab_open') !== '0';
  } catch {
    return true; // storage unavailable
  }
}

interface Props {
  options: IntroOption[];
  current: IntroOption | undefined; // the chosen intro (chosen here, but also played before the song when that is switched on)
  onPick: (id: IntroOption['id']) => void;
  capo?: number;
  keyHint?: string;
  rhythm: Rhythm; // the rhythm and speed come from the shared Rhythm bar
}

// Ways to start the song, with the tab and a short fill. Part of the play-along section.
export function IntroCard({ options, current, onPick, capo, keyHint, rhythm }: Props) {
  const [open, setOpen] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [playingBar, setPlayingBar] = useState<number | null>(null);
  const [tabOpen, setTabOpen] = useState(loadTabOpen);
  const stopRef = useRef<(() => void) | null>(null);

  const { pattern, bpm, fillStyle, fillWhere, setFillStyle, setFillWhere } = rhythm;
  const toggleTab = () => {
    setTabOpen((o) => {
      try {
        localStorage.setItem('gtime_tab_open', o ? '0' : '1');
      } catch {
        /* storage unavailable */
      }
      return !o;
    });
  };
  const fill = useMemo<FillOptions>(() => ({ style: fillStyle, where: fillWhere, keyHint }), [fillStyle, fillWhere, keyHint]);
  const tab = useMemo(() => (current ? tabBars(current.chords, pattern, fill) : []), [current, pattern, fill]);

  const stop = () => stopRef.current?.();
  const run = () => {
    if (!current) return;
    stop();
    const phrase = buildPhrase(current.chords, pattern, current.repeat, capo ?? 0, fill);
    setPlaying(true);
    setPlayingBar(0);
    stopRef.current = playPhrase(phrase, {
      bpm,
      onBar: (b) => setPlayingBar(b),
      onEnd: () => {
        stopRef.current = null;
        setPlaying(false);
        setPlayingBar(null);
      },
    });
  };

  // Leaving the song silences it. A change of rhythm, fill or intro stops it; a new speed restarts it.
  useEffect(() => stop, []);
  useEffect(() => {
    stopRef.current?.();
  }, [open, current?.id, pattern.id, fillStyle, fillWhere]);
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    if (stopRef.current) run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bpm]);

  if (options.length === 0 || !current) return null;

  return (
    <div className="border-b border-stage-border">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="w-full px-4 py-1.5 flex items-center gap-2 text-sm font-semibold text-stage-muted hover:text-stage-text"
      >
        <Music2 className="w-4 h-4 text-stage-accent" /> Intro ideas
        <ChevronDown className={`w-4 h-4 ml-auto transition-transform ${open ? '' : 'rotate-180'}`} />
      </button>
      {open && (
        <div className="px-3 pb-2 space-y-1.5 max-h-[40dvh] overflow-y-auto">
          {/* Which intro: a chip each, with its chords on the same line when there is room */}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <div className="flex flex-wrap gap-1" role="tablist" aria-label="Intro options">
              {options.map((o) => (
                <button
                  key={o.id}
                  role="tab"
                  aria-selected={o.id === current.id}
                  onClick={() => onPick(o.id)}
                  className={`px-2.5 py-0.5 rounded-full border text-[11px] font-semibold ${
                    o.id === current.id ? 'bg-stage-accent/20 border-stage-accent text-stage-accent' : 'border-stage-border text-stage-muted'
                  }`}
                >
                  {o.label}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-1 font-mono font-bold text-sm">
              {current.chords.map((c, i) => (
                <span key={i} className="px-1.5 py-0.5 rounded-md bg-stage-bg border border-stage-border">
                  {c}
                </span>
              ))}
              {current.repeat > 1 && <span className="text-xs text-stage-muted font-semibold">× {current.repeat}</span>}
            </div>
          </div>
          <p className="text-[11px] text-stage-muted truncate" title={current.note}>
            {current.note}
          </p>

          {/* The intro's own fill (a short flourish), and playing the intro on its own */}
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <select
              value={fillStyle}
              onChange={(e) => setFillStyle(e.target.value as FillStyle)}
              aria-label="Intro fill"
              className="min-w-0 basis-32 max-w-[12rem] px-2 py-1 rounded-lg bg-stage-bg border border-stage-border text-xs font-semibold focus:outline-none focus:border-stage-accent"
            >
              {FILLS.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.id === 'none' ? 'No intro fill' : `Intro fill: ${f.name}`}
                </option>
              ))}
            </select>
            {fillStyle !== 'none' && (
              <button
                onClick={() => setFillWhere(fillWhere === 'end' ? 'every' : 'end')}
                className="px-2 py-1 rounded-lg border border-stage-border text-[11px] font-semibold text-stage-muted hover:text-stage-text"
                title={fillWhere === 'end' ? 'Fill only at the end of the loop. Tap for every chord change.' : 'Fill at every chord change. Tap for the end of the loop only.'}
                aria-label={`Fill placement: ${fillWhere === 'end' ? 'end of the loop' : 'every chord change'}`}
              >
                {fillWhere === 'end' ? 'End only' : 'Every bar'}
              </button>
            )}
            <button
              onClick={playing ? stop : run}
              className="px-2.5 py-1 rounded-lg bg-stage-accent text-slate-950 text-xs font-bold flex items-center gap-1"
            >
              {playing ? <Square className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
              {playing ? 'Stop' : 'Play intro'}
            </button>
          </div>

          {/* The tab can be folded away; when shown it scrolls sideways instead of wrapping onto more lines */}
          <div className="flex items-center gap-2">
            <button
              onClick={toggleTab}
              aria-expanded={tabOpen}
              className="flex items-center gap-1 text-[11px] font-semibold text-stage-muted hover:text-stage-text"
            >
              <ChevronDown className={`w-3.5 h-3.5 transition-transform ${tabOpen ? '' : '-rotate-90'}`} /> Tab
            </button>
            {!!capo && <span className="text-[10px] text-stage-muted">Capo {capo}: fret numbers are counted from the capo.</span>}
          </div>
          <div className={`flex gap-1.5 overflow-x-auto pb-1 ${tabOpen ? '' : 'hidden'}`} aria-label="Guitar tab">
            {tab.map((bar, i) => (
              <div
                key={i}
                className={`flex-none rounded-lg border px-1.5 py-1 ${playing && playingBar !== null && playingBar % tab.length === i ? 'border-stage-accent bg-stage-accent/10' : 'border-stage-border bg-stage-bg'}`}
              >
                <div className="text-[11px] leading-none font-bold text-stage-accent pb-0.5">{bar.chord}</div>
                <pre className="font-mono text-[10px] leading-[1.15] text-stage-text">
                  {bar.marks.trim() !== '' && <span className="block text-stage-muted">{`  ${bar.marks}`}</span>}
                  {bar.rows.map((row, s) => (
                    <span key={s} className="block">{`${STRING_LABELS[s]}|${row}|`}</span>
                  ))}
                </pre>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

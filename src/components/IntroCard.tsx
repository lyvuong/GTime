import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, Music2, Play, Square } from 'lucide-react';
import type { IntroOption } from '../lib/intro';
import { buildPhrase, patternsFor, tabBars } from '../lib/patterns';
import { playPhrase } from '../lib/synth';

const STRING_LABELS = ['e', 'B', 'G', 'D', 'A', 'E'];

// A collapsible strip under the song toolbar with ways to start the song, how to play them, and a tab
export function IntroCard({ options, time, capo }: { options: IntroOption[]; time?: string; capo?: number }) {
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState<IntroOption['id'] | null>(null);
  const [patternId, setPatternId] = useState('arpeggio');
  const [bpm, setBpm] = useState(80);
  const [playingBar, setPlayingBar] = useState<number | null>(null);
  const stopRef = useRef<(() => void) | null>(null);

  const patterns = useMemo(() => patternsFor(time), [time]);
  const pattern = patterns.find((p) => p.id === patternId) ?? patterns[0];
  const current = options.find((o) => o.id === picked) ?? options[0];
  const tab = useMemo(() => (current ? tabBars(current.chords, pattern) : []), [current, pattern]);

  const stop = () => stopRef.current?.();
  // Silence the intro when anything it depends on changes, when the card closes, and when leaving the song
  useEffect(() => stop, []);
  useEffect(() => {
    stopRef.current?.();
  }, [open, current?.id, pattern.id]);

  if (options.length === 0 || !current) return null;

  const play = () => {
    stop();
    const phrase = buildPhrase(current.chords, pattern, current.repeat, capo ?? 0);
    setPlayingBar(0);
    const end = () => {
      stopRef.current = null;
      setPlayingBar(null);
    };
    stopRef.current = playPhrase(phrase, { bpm, onBar: (b) => setPlayingBar(b), onEnd: end });
  };

  return (
    <div className="border-b border-stage-border bg-stage-card/60">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="w-full px-4 py-2 flex items-center gap-2 text-sm font-semibold text-stage-muted hover:text-stage-text"
      >
        <Music2 className="w-4 h-4 text-stage-accent" /> Intro ideas
        <ChevronDown className={`w-4 h-4 ml-auto transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="px-4 pb-3 space-y-3 max-h-[55dvh] overflow-y-auto">
          <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Intro options">
            {options.map((o) => (
              <button
                key={o.id}
                role="tab"
                aria-selected={o.id === current.id}
                onClick={() => setPicked(o.id)}
                className={`px-3 py-1 rounded-full border text-xs font-semibold ${
                  o.id === current.id ? 'bg-stage-accent/20 border-stage-accent text-stage-accent' : 'border-stage-border text-stage-muted'
                }`}
              >
                {o.label}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-1.5 font-mono font-bold text-lg">
            {current.chords.map((c, i) => (
              <span key={i} className="px-2.5 py-1 rounded-lg bg-stage-bg border border-stage-border">
                {c}
              </span>
            ))}
            {current.repeat > 1 && <span className="text-sm text-stage-muted font-semibold">× {current.repeat}</span>}
          </div>
          <p className="text-xs text-stage-muted">{current.note}</p>

          {/* How to play it */}
          <div className="pt-2 border-t border-stage-border space-y-2">
            <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Pattern">
              {patterns.map((p) => (
                <button
                  key={p.id}
                  role="radio"
                  aria-checked={p.id === pattern.id}
                  onClick={() => setPatternId(p.id)}
                  className={`px-3 py-1 rounded-full border text-xs font-semibold ${
                    p.id === pattern.id ? 'bg-sky-500/20 border-sky-400 text-sky-300' : 'border-stage-border text-stage-muted'
                  }`}
                >
                  {p.name}
                </button>
              ))}
            </div>

            <div className="flex flex-wrap gap-2" aria-label="Guitar tab">
              {tab.map((bar, i) => (
                <div
                  key={i}
                  className={`rounded-lg border px-2 py-1.5 ${playingBar !== null && playingBar % tab.length === i ? 'border-stage-accent bg-stage-accent/10' : 'border-stage-border bg-stage-bg'}`}
                >
                  <div className="text-xs font-bold text-stage-accent">{bar.chord}</div>
                  <pre className="font-mono text-[11px] leading-[1.15] text-stage-text">
                    {pattern.kind === 'strum' && <span className="block text-stage-muted">{`  ${bar.marks}`}</span>}
                    {bar.rows.map((row, s) => (
                      <span key={s} className="block">{`${STRING_LABELS[s]}|${row}|`}</span>
                    ))}
                  </pre>
                </div>
              ))}
            </div>
            {!!capo && <p className="text-[11px] text-stage-muted">Capo {capo}: fret numbers are counted from the capo.</p>}

            <div className="flex items-center gap-3">
              <button
                onClick={playingBar === null ? play : stop}
                className="px-3 py-1.5 rounded-lg bg-stage-accent text-slate-950 text-sm font-bold flex items-center gap-1.5"
              >
                {playingBar === null ? <Play className="w-4 h-4" /> : <Square className="w-4 h-4" />}
                {playingBar === null ? 'Play' : 'Stop'}
              </button>
              <label className="flex-1 flex items-center gap-2 text-xs text-stage-muted">
                Tempo
                <input
                  type="range"
                  min={50}
                  max={140}
                  step={2}
                  value={bpm}
                  onChange={(e) => setBpm(Number(e.target.value))}
                  onPointerUp={() => playingBar !== null && play()}
                  className="flex-1 accent-amber-400"
                  aria-label="Tempo in beats per minute"
                />
                <span className="w-12 text-right font-mono">{bpm} bpm</span>
              </label>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

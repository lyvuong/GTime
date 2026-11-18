import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, CircleHelp, Minus, Music2, Play, Plus, Square } from 'lucide-react';
import type { IntroOption } from '../lib/intro';
import { FILLS, type FillOptions, type FillStyle } from '../lib/fills';
import { buildPhrase, tabBars, type Pattern } from '../lib/patterns';
import type { Rhythm } from '../lib/useRhythm';
import { playPhrase } from '../lib/synth';
import { snapTempo, stepTempo, TEMPOS } from '../lib/tempo';
import { RhythmGuide } from './RhythmGuide';

const STRING_LABELS = ['e', 'B', 'G', 'D', 'A', 'E'];

function loadTabOpen(): boolean {
  try {
    return localStorage.getItem('gtime_tab_open') !== '0';
  } catch {
    return true; // storage unavailable
  }
}

// A compact strip under the song toolbar: ways to start the song, a rhythm to play them with, the tab, and playback
export function IntroCard({ options, capo, keyHint, rhythm }: { options: IntroOption[]; capo?: number; keyHint?: string; rhythm: Rhythm }) {
  const [open, setOpen] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const [picked, setPicked] = useState<IntroOption['id'] | null>(null);
  const [playingId, setPlayingId] = useState<string | null>(null); // the pattern that is sounding
  const [playingBar, setPlayingBar] = useState<number | null>(null);
  const [tabOpen, setTabOpen] = useState(loadTabOpen);
  const stopRef = useRef<(() => void) | null>(null);

  // The rhythm, fill and tempo are shared with the play-along track
  const { patterns, pattern, bpm, fillStyle, fillWhere, setFillStyle, setFillWhere } = rhythm;
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
  // A tempo change while playing restarts at the new speed
  const setTempo = (next: number) => {
    rhythm.setBpm(next);
    if (playing) run(pattern.id, pattern, next);
  };
  const current = options.find((o) => o.id === picked) ?? options[0];
  const fill = useMemo<FillOptions>(() => ({ style: fillStyle, where: fillWhere, keyHint }), [fillStyle, fillWhere, keyHint]);
  const tab = useMemo(() => (current ? tabBars(current.chords, pattern, fill) : []), [current, pattern, fill]);

  const stop = () => stopRef.current?.();
  // Silence the intro when anything it depends on changes, when the card closes, and when leaving the song
  useEffect(() => stop, []);
  useEffect(() => {
    stopRef.current?.();
  }, [open, current?.id, pattern.id, fillStyle, fillWhere]);

  if (options.length === 0 || !current) return null;

  // `key` says what is sounding (a pattern's id, or "fill:<id>" for a fill demo from the guide)
  const run = (key: string, p: Pattern, tempo: number, fillOverride?: FillOptions) => {
    stop();
    const phrase = buildPhrase(current.chords, p, current.repeat, capo ?? 0, fillOverride ?? fill);
    setPlayingId(key);
    setPlayingBar(0);
    const end = () => {
      stopRef.current = null;
      setPlayingId(null);
      setPlayingBar(null);
    };
    stopRef.current = playPhrase(phrase, { bpm: tempo, onBar: (b) => setPlayingBar(b), onEnd: end });
  };
  const playing = playingId === pattern.id;
  const groups = [
    ['Picking', patterns.filter((p) => p.kind === 'pick')],
    ['Strums and rhythms', patterns.filter((p) => p.kind === 'strum')],
  ] as const;

  return (
    <div className="border-b border-stage-border bg-stage-card/60">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="w-full px-4 py-1.5 flex items-center gap-2 text-sm font-semibold text-stage-muted hover:text-stage-text"
      >
        <Music2 className="w-4 h-4 text-stage-accent" /> Intro ideas
        <ChevronDown className={`w-4 h-4 ml-auto transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="px-3 pb-2 space-y-1.5 max-h-[50dvh] overflow-y-auto">
          {/* Which intro: a chip each, with its chords on the same line when there is room */}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <div className="flex flex-wrap gap-1" role="tablist" aria-label="Intro options">
              {options.map((o) => (
                <button
                  key={o.id}
                  role="tab"
                  aria-selected={o.id === current.id}
                  onClick={() => setPicked(o.id)}
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

          {/* Rhythm, guide, play and tempo on one line (wrapping on a narrow screen) */}
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <select
              value={pattern.id}
              onChange={(e) => {
                rhythm.setPattern(e.target.value); // each style starts at its own tempo
              }}
              aria-label="Rhythm"
              className="min-w-0 flex-1 basis-40 max-w-[15rem] px-2 py-1 rounded-lg bg-stage-bg border border-stage-border text-xs font-semibold focus:outline-none focus:border-stage-accent"
            >
              {groups.map(([heading, group]) => (
                <optgroup key={heading} label={heading}>
                  {group.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                      {p.meter ? ` (${p.meter})` : ''}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
            <select
              value={fillStyle}
              onChange={(e) => setFillStyle(e.target.value as FillStyle)}
              aria-label="Fill"
              className="min-w-0 basis-32 max-w-[11rem] px-2 py-1 rounded-lg bg-stage-bg border border-stage-border text-xs font-semibold focus:outline-none focus:border-stage-accent"
            >
              {FILLS.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.id === 'none' ? 'No fill' : `Fill: ${f.name}`}
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
              onClick={() => setGuideOpen(true)}
              className="p-1 rounded-full text-stage-muted hover:text-sky-300"
              aria-label="Rhythm guide: how each rhythm sounds"
              title="Rhythm guide"
            >
              <CircleHelp className="w-4 h-4" />
            </button>
            <button
              onClick={playing ? stop : () => run(pattern.id, pattern, bpm)}
              className="px-2.5 py-1 rounded-lg bg-stage-accent text-slate-950 text-xs font-bold flex items-center gap-1"
            >
              {playing ? <Square className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
              {playing ? 'Stop' : 'Play'}
            </button>
            <div className="flex-1 basis-40 flex items-center gap-1 text-[11px] text-stage-muted">
              <button onClick={() => setTempo(stepTempo(bpm, -1))} className="p-1 rounded-full hover:text-stage-text" aria-label="Slower">
                <Minus className="w-3.5 h-3.5" />
              </button>
              {/* The slider moves through the metronome settings, not every number */}
              <input
                type="range"
                min={0}
                max={TEMPOS.length - 1}
                step={1}
                value={TEMPOS.indexOf(bpm)}
                onChange={(e) => rhythm.setBpm(TEMPOS[Number(e.target.value)])}
                onPointerUp={() => playing && run(pattern.id, pattern, bpm)}
                className="flex-1 min-w-0 accent-amber-400"
                aria-label="Tempo"
                aria-valuetext={`${bpm} beats per minute`}
              />
              <button onClick={() => setTempo(stepTempo(bpm, 1))} className="p-1 rounded-full hover:text-stage-text" aria-label="Faster">
                <Plus className="w-3.5 h-3.5" />
              </button>
              <span className="w-12 text-right font-mono">{bpm} bpm</span>
            </div>
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

      <RhythmGuide
        isOpen={guideOpen}
        onClose={() => setGuideOpen(false)}
        patterns={patterns}
        selectedId={pattern.id}
        listeningId={playingId}
        onSelect={rhythm.setPattern}
        onListen={(p) => run(p.id, p, snapTempo(p.bpm))}
        selectedFill={fillStyle}
        onSelectFill={setFillStyle}
        onListenFill={(style) => run(`fill:${style}`, pattern, bpm, { style, where: 'every', keyHint })}
        onStopListening={stop}
      />
    </div>
  );
}

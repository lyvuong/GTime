import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronUp, Ruler, Minus, Pause, Play, Plus, Square, X } from 'lucide-react';
import type { ParsedSong } from '../lib/chordParser';
import { FILLS, type FillStyle } from '../lib/fills';
import { playAlong, type PlayAlongLive } from '../lib/playAlong';
import { buildSongPhrase } from '../lib/songPhrase';
import { blockOf, lineKey, songTiming, type BarsMode, type LineRef, type TokenRef } from '../lib/songTiming';
import { stepTempo } from '../lib/tempo';
import type { LengthEdit } from './ChordProViewer';
import type { Rhythm } from '../lib/useRhythm';

interface Props {
  song: ParsedSong;
  songId: string; // lengths set by hand are remembered per song
  rhythm: Rhythm;
  capo?: number;
  keyHint?: string;
  startLine: LineRef | null; // set by tapping a line
  onClearStart: () => void;
  follow: boolean;
  onFollowChange: (follow: boolean) => void;
  onActive: (ref: TokenRef | null) => void; // the chord that is sounding
  onLengthEdit: (edit: LengthEdit) => void; // lets the sheet show and pick chord lengths
}

const CYCLE = [undefined, 1, 2, 4, 8]; // auto, a quarter, a half, one bar, two bars (in quarters of a bar)
const LABEL: Record<number, string> = { 1: '¼', 2: '½', 4: '1', 8: '2' };
const storeKey = (id: string) => `gtime_lengths_${id}`;

function loadLengths(id: string): Map<string, number> {
  try {
    return new Map(Object.entries(JSON.parse(localStorage.getItem(storeKey(id)) ?? '{}') as Record<string, number>));
  } catch {
    return new Map();
  }
}

export function PlayAlongBar({ song, songId, rhythm, capo = 0, keyHint, startLine, onClearStart, follow, onFollowChange, onActive, onLengthEdit }: Props) {
  const { pattern, bpm, fillStyle, fillWhere } = rhythm;
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<BarsMode>('auto');
  const [countIn, setCountIn] = useState(true);
  const [click, setClick] = useState(false);
  const [loopBlock, setLoopBlock] = useState(false);
  const [volume, setVolume] = useState(0.7);
  const [state, setState] = useState<'stopped' | 'playing' | 'paused'>('stopped');
  const [bar, setBar] = useState<number | null>(null);

  const [lengths, setLengths] = useState(() => loadLengths(songId));
  const [editing, setEditing] = useState(false);
  const timing = useMemo(() => songTiming(song, mode, undefined, lengths), [song, mode, lengths]);

  const cycleLength = (id: string) => {
    setLengths((prev) => {
      const next = new Map(prev);
      const i = CYCLE.indexOf(prev.get(id));
      const to = CYCLE[(i + 1) % CYCLE.length];
      if (to === undefined) next.delete(id);
      else next.set(id, to);
      try {
        localStorage.setItem(storeKey(songId), JSON.stringify(Object.fromEntries(next)));
      } catch {
        /* storage unavailable */
      }
      return next;
    });
  };
  useEffect(() => {
    const labels = new Map<string, string>();
    lengths.forEach((q, id) => labels.set(id, LABEL[q] ?? String(q / 4)));
    onLengthEdit({ labels, onPick: editing ? cycleLength : null });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lengths, editing]);
  const phrase = useMemo(
    () => buildSongPhrase(timing, pattern, capo, { style: fillStyle, where: fillWhere, keyHint }),
    [timing, pattern, capo, fillStyle, fillWhere, keyHint],
  );

  const live = useRef<PlayAlongLive>({ volume, click });
  live.current.volume = volume;
  live.current.click = click;
  const stopRef = useRef<(() => void) | null>(null);
  const barRef = useRef(0); // the bar that is sounding, for resuming and restarting
  const wake = useRef<{ release: () => Promise<void> } | null>(null);

  // The chord sounding at a position (a bar, plus quarters/4 when a bar holds several chords)
  const segPos = useMemo(() => timing.segments.map((s) => s.bar + s.from / 4), [timing]);
  const cues = useMemo(() => timing.segments.filter((s) => s.from > 0).map((s) => ({ bar: s.bar, quarter: s.from })), [timing]);
  const refFor = (pos: number): TokenRef | null => {
    let found = -1;
    segPos.forEach((p, i) => {
      if (p <= pos + 1e-9) found = i;
    });
    return found >= 0 ? timing.segments[found].ref : null;
  };

  const releaseWake = () => {
    wake.current?.release().catch(() => {});
    wake.current = null;
  };

  const halt = () => {
    stopRef.current?.();
  };

  const start = (from: number, withCountIn: boolean) => {
    halt();
    if (phrase.bars === 0) return;
    const loop = loopBlock ? blockOf(timing, from) : null;
    setState('playing');
    try {
      navigator.wakeLock?.request('screen').then((w) => (wake.current = w)).catch(() => {});
    } catch {
      /* not supported */
    }
    const end = () => {
      stopRef.current = null;
      releaseWake();
      setState((s) => (s === 'playing' ? 'stopped' : s));
      setBar(null);
      onActive(null);
    };
    stopRef.current = playAlong(phrase, {
      bpm,
      startBar: from,
      loop,
      countIn: withCountIn,
      cues,
      live: live.current,
      onBar: (b) => {
        if (b === null) {
          onActive(null);
          return;
        }
        barRef.current = Math.floor(b);
        setBar(b);
        onActive(refFor(b));
      },
      onEnd: end,
    });
  };

  const startBar = () => (startLine ? timing.lineStartBar.get(lineKey(startLine.s, startLine.l)) ?? 0 : 0);

  const toggle = () => {
    if (state === 'playing') {
      halt();
      setState('paused');
    } else if (state === 'paused') start(barRef.current, false);
    else start(startBar(), countIn);
  };
  const stopAll = () => {
    halt();
    setState('stopped');
    barRef.current = 0;
  };

  // Tapping a line while it is playing jumps there; while stopped it just moves the start marker
  const lastStart = useRef<LineRef | null>(startLine);
  useEffect(() => {
    if (startLine && startLine !== lastStart.current && state !== 'stopped') {
      start(startBar(), false);
    } else if (startLine && startLine !== lastStart.current) {
      barRef.current = startBar();
    }
    lastStart.current = startLine;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startLine]);

  // A different rhythm, tempo, fill, transposition or length continues from the current bar
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    if (state === 'playing') start(Math.min(barRef.current, Math.max(0, phrase.bars - 1)), false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phrase, bpm, loopBlock]);

  // Silence when leaving the song
  useEffect(
    () => () => {
      stopRef.current?.();
      wake.current?.release().catch(() => {});
    },
    [],
  );

  if (timing.totalBars === 0) return null;

  const segIndex = bar === null ? -1 : segPos.reduce((found, p, i) => (p <= bar + 1e-9 ? i : found), 0);
  const now = state === 'playing' && segIndex >= 0 ? timing.segments[segIndex].chord : null;
  const next = segIndex >= 0 ? timing.segments[segIndex + 1]?.chord ?? null : null;
  const playing = state === 'playing';

  return (
    <div className="border-t border-stage-border bg-stage-card/95 backdrop-blur" aria-label="Play along">
      {open && (
        <div className="px-3 pt-2 pb-1 grid grid-cols-2 gap-x-3 gap-y-2 text-xs text-stage-muted sm:grid-cols-4">
          <label className="flex flex-col gap-0.5">
            Rhythm
            <select
              value={pattern.id}
              onChange={(e) => rhythm.setPattern(e.target.value)}
              className="px-2 py-1 rounded-lg bg-stage-bg border border-stage-border text-stage-text font-semibold"
            >
              {rhythm.patterns.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-0.5">
            Fills
            <select
              value={fillStyle}
              onChange={(e) => rhythm.setFillStyle(e.target.value as FillStyle)}
              className="px-2 py-1 rounded-lg bg-stage-bg border border-stage-border text-stage-text font-semibold"
            >
              {FILLS.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.id === 'none' ? 'No fill' : f.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-0.5">
            Fill placement
            <select
              value={fillWhere}
              onChange={(e) => rhythm.setFillWhere(e.target.value as 'end' | 'every')}
              disabled={fillStyle === 'none'}
              className="px-2 py-1 rounded-lg bg-stage-bg border border-stage-border text-stage-text font-semibold disabled:opacity-50"
            >
              <option value="end">End of each paragraph</option>
              <option value="every">Every chord change</option>
            </select>
          </label>
          <label className="flex flex-col gap-0.5">
            Bars per chord
            <select
              value={String(mode)}
              onChange={(e) => setMode(e.target.value === 'auto' ? 'auto' : (Number(e.target.value) as 1 | 2))}
              className="px-2 py-1 rounded-lg bg-stage-bg border border-stage-border text-stage-text font-semibold"
            >
              <option value="auto">Auto (from the words)</option>
              <option value="1">1</option>
              <option value="2">2</option>
            </select>
          </label>
          <label className="flex items-center gap-1.5">
            <input type="checkbox" checked={countIn} onChange={(e) => setCountIn(e.target.checked)} /> Count-in
          </label>
          <label className="flex items-center gap-1.5">
            <input type="checkbox" checked={click} onChange={(e) => setClick(e.target.checked)} /> Click
          </label>
          <label className="flex items-center gap-1.5">
            <input type="checkbox" checked={follow} onChange={(e) => onFollowChange(e.target.checked)} /> Follow along
          </label>
          <label className="flex items-center gap-1.5">
            <input type="checkbox" checked={loopBlock} onChange={(e) => setLoopBlock(e.target.checked)} /> Loop paragraph
          </label>
          <div className="col-span-2 sm:col-span-4 flex flex-wrap items-center gap-2">
            <button
              onClick={() => setEditing((e) => !e)}
              aria-pressed={editing}
              className={`px-2 py-1 rounded-lg border text-xs font-semibold flex items-center gap-1 ${editing ? 'bg-sky-400/20 border-sky-400 text-sky-300' : 'border-stage-border'}`}
            >
              <Ruler className="w-3.5 h-3.5" /> {editing ? 'Done setting lengths' : 'Set chord lengths'}
            </button>
            {editing ? (
              <span>Tap a chord in the song: ¼ → ½ → 1 → 2 bars → auto.</span>
            ) : (
              lengths.size > 0 && (
                <button onClick={() => { setLengths(new Map()); try { localStorage.removeItem(storeKey(songId)); } catch { /* storage unavailable */ } }} className="underline">
                  Reset {lengths.size} custom {lengths.size === 1 ? 'length' : 'lengths'}
                </button>
              )
            )}
          </div>
          <label className="flex items-center gap-1.5 col-span-2">
            Volume
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={volume}
              onChange={(e) => setVolume(Number(e.target.value))}
              className="flex-1 accent-amber-400"
              aria-label="Volume"
            />
          </label>
          {startLine && (
            <button onClick={onClearStart} className="col-span-2 flex items-center gap-1 text-sky-300 font-semibold">
              <X className="w-3.5 h-3.5" /> Start from the top instead of the marked line
            </button>
          )}
        </div>
      )}

      <div className="px-3 py-1.5 flex items-center gap-2">
        <button
          onClick={toggle}
          className="px-3 py-1.5 rounded-lg bg-stage-accent text-slate-950 text-sm font-bold flex items-center gap-1.5"
          aria-label={playing ? 'Pause' : state === 'paused' ? 'Resume' : 'Play along'}
        >
          {playing ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
          {playing ? 'Pause' : state === 'paused' ? 'Resume' : 'Play along'}
        </button>
        {state !== 'stopped' && (
          <button onClick={stopAll} className="p-2 rounded-lg border border-stage-border text-stage-muted" aria-label="Stop">
            <Square className="w-4 h-4" />
          </button>
        )}
        <div className="min-w-0 flex-1 font-mono text-sm font-bold truncate">
          {playing && bar === null ? (
            <span className="text-stage-muted font-semibold">Count-in…</span>
          ) : now ? (
            <>
              <span className="text-stage-accent">{now}</span>
              {next && <span className="text-stage-muted font-semibold"> → {next}</span>}
            </>
          ) : state === 'paused' ? (
            <span className="text-stage-muted font-semibold text-xs">Paused</span>
          ) : startLine ? (
            <span className="text-sky-300 font-semibold text-xs">Starts at the marked line</span>
          ) : (
            <span className="text-stage-muted font-semibold text-xs">Tap a line to start there</span>
          )}
        </div>
        <div className="flex items-center gap-0.5 text-xs text-stage-muted">
          <button onClick={() => rhythm.setBpm(stepTempo(bpm, -1))} className="p-1 rounded-full hover:text-stage-text" aria-label="Slower">
            <Minus className="w-3.5 h-3.5" />
          </button>
          <span className="w-8 text-center font-mono">{bpm}</span>
          <button onClick={() => rhythm.setBpm(stepTempo(bpm, 1))} className="p-1 rounded-full hover:text-stage-text" aria-label="Faster">
            <Plus className="w-3.5 h-3.5" />
          </button>
        </div>
        <button
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className="p-1.5 rounded-lg text-stage-muted hover:text-stage-text"
          aria-label="Play-along settings"
        >
          <ChevronUp className={`w-4 h-4 transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>
      </div>
    </div>
  );
}

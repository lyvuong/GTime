import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronUp, CircleHelp, Drum, Guitar, Music2, Ruler, Pause, Play, Square, X } from 'lucide-react';
import type { ParsedSong } from '../lib/chordParser';
import { FILLS, type FillStyle } from '../lib/fills';
import { playAlong, type PlayAlongLive } from '../lib/playAlong';
import type { IntroOption } from '../lib/intro';
import { addBass, loopSegments, shiftBass, songSegments } from '../lib/bass';
import { addDrums, shiftDrums } from '../lib/drums';
import { loadLengths, saveLengths } from '../lib/libraryStore';
import { buildPhrase, type Phrase } from '../lib/patterns';
import { buildSongPhrase, type SongFillWhere } from '../lib/songPhrase';
import { blockOf, lineKey, songTiming, type BarsMode, type LineRef, type TokenRef } from '../lib/songTiming';
import type { LengthEdit } from './ChordProViewer';
import type { Rhythm } from '../lib/useRhythm';
import { PlayAlongHelp } from './PlayAlongHelp';

interface Props {
  song: ParsedSong;
  songId: string; // chord lengths set by hand are saved with the song in the library
  intro?: IntroOption; // the intro chosen in Intro ideas, which can be played before the song
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

const CYCLE = [undefined, 1, 2, 3, 4, 6, 8]; // auto, then ¼ ½ ¾ 1 1½ 2 bars (counted in quarters of a bar)
const LABEL: Record<number, string> = { 1: '¼', 2: '½', 3: '¾', 4: '1', 6: '1½', 8: '2' };

export function PlayAlongBar({ song, songId, intro, rhythm, capo = 0, keyHint, startLine, onClearStart, follow, onFollowChange, onActive, onLengthEdit }: Props) {
  const { pattern, bpm, songFill, songFillWhere, drums, bass } = rhythm;
  const bassOn = bass !== 'off';
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<BarsMode>('auto');
  const [countIn, setCountIn] = useState(true);
  const [click, setClick] = useState(false);
  const [loopBlock, setLoopBlock] = useState(false);
  const [volume, setVolume] = useState(0.7);
  const [drumVolume, setDrumVolume] = useState(0.8);
  const [bassVolume, setBassVolume] = useState(0.8);
  const [state, setState] = useState<'stopped' | 'playing' | 'paused'>('stopped');
  const [bar, setBar] = useState<number | null>(null);

  const [withIntro, setWithIntro] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [lengths, setLengths] = useState<Map<string, number>>(new Map());
  useEffect(() => {
    let live = true;
    loadLengths(songId).then((m) => live && setLengths(m)).catch(() => {});
    return () => {
      live = false;
    };
  }, [songId]);
  const [editing, setEditing] = useState(false);
  const timing = useMemo(() => songTiming(song, mode, undefined, lengths), [song, mode, lengths]);

  const changeLengths = (next: Map<string, number>) => {
    setLengths(next);
    saveLengths(songId, next).catch(() => {});
  };
  const cycleLength = (id: string) => {
    const next = new Map(lengths);
    const to = CYCLE[(CYCLE.indexOf(lengths.get(id)) + 1) % CYCLE.length];
    if (to === undefined) next.delete(id);
    else next.set(id, to);
    changeLengths(next);
  };
  useEffect(() => {
    const labels = new Map<string, string>();
    lengths.forEach((q, id) => labels.set(id, LABEL[q] ?? String(q / 4)));
    onLengthEdit({ labels, onPick: editing ? cycleLength : null });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lengths, editing]);
  const songPhrase = useMemo(
    () => {
      const phrase = buildSongPhrase(timing, pattern, capo, { style: songFill, where: songFillWhere, keyHint });
      const hold = phrase.bars - 1; // the last bar is the held chord
      const withDrums = addDrums(phrase, pattern, drums, { holdBar: hold });
      return addBass(withDrums, pattern, songSegments(timing, phrase.stepsPerBar), bassOn, { holdBar: hold });
    },
    [timing, pattern, capo, songFill, songFillWhere, keyHint, drums, bassOn],
  );
  // The intro, when switched on, plays first: its bars come before the song's, so every song bar moves along by "offset"
  const introPhrase = useMemo(
    () =>
      withIntro && intro
        ? (() => {
            const built = addDrums(buildPhrase(intro.chords, pattern, intro.repeat, capo, { style: rhythm.fillStyle, where: rhythm.fillWhere, keyHint }), pattern, drums);
            return addBass(built, pattern, loopSegments(intro.chords, intro.repeat, built.stepsPerBar), bassOn);
          })()
        : null,
    [withIntro, intro, pattern, capo, rhythm.fillStyle, rhythm.fillWhere, keyHint, drums, bassOn],
  );
  const offset = introPhrase?.bars ?? 0;
  const phrase = useMemo<Phrase>(
    () =>
      introPhrase
        ? {
            events: [...introPhrase.events, ...songPhrase.events.map((e) => ({ ...e, bar: e.bar + offset }))],
            stepsPerBar: songPhrase.stepsPerBar,
            beats: songPhrase.beats,
            bars: offset + songPhrase.bars,
            shapes: [...introPhrase.shapes, ...songPhrase.shapes],
            drums: [...(introPhrase.drums ?? []), ...shiftDrums(songPhrase.drums, offset)],
            bass: [...(introPhrase.bass ?? []), ...shiftBass(songPhrase.bass, offset)],
          }
        : songPhrase,
    [introPhrase, songPhrase, offset],
  );

  const live = useRef<PlayAlongLive>({ volume, click, drums: drumVolume, bass: bassVolume });
  live.current.volume = volume;
  live.current.drums = drumVolume;
  live.current.bass = bassVolume;
  live.current.click = click;
  const stopRef = useRef<(() => void) | null>(null);
  const barRef = useRef(0); // the bar that is sounding, for resuming and restarting
  const wake = useRef<{ release: () => Promise<void> } | null>(null);

  // The chord sounding at a position (a bar, plus quarters/4 when a bar holds several chords)
  const segPos = useMemo(() => timing.segments.map((s) => s.bar + s.from / 4), [timing]);
  const cues = useMemo(() => timing.segments.filter((s) => s.from > 0).map((s) => ({ bar: s.bar + offset, quarter: s.from })), [timing, offset]);
  const refFor = (absolute: number): TokenRef | null => {
    const pos = absolute - offset;
    if (pos < 0) return null; // the intro has no place on the sheet
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
    const block = loopBlock && from >= offset ? blockOf(timing, from - offset) : null;
    const loop = block ? { start: block.start + offset, end: block.end + offset } : null;
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
      instrument: rhythm.instrument,
      bassVoice: bass === 'off' ? undefined : bass,
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

  const startBar = () => (startLine ? (timing.lineStartBar.get(lineKey(startLine.s, startLine.l)) ?? 0) + offset : 0);

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
  }, [phrase, bpm, loopBlock, rhythm.instrument, bass]);

  // Silence when leaving the song
  useEffect(
    () => () => {
      stopRef.current?.();
      wake.current?.release().catch(() => {});
    },
    [],
  );

  if (timing.totalBars === 0) return null;

  const inIntro = bar !== null && bar < offset;
  const rel = bar === null ? null : bar - offset;
  const segIndex = rel === null || rel < 0 ? -1 : segPos.reduce((found, p, i) => (p <= rel + 1e-9 ? i : found), 0);
  const now = state === 'playing' && segIndex >= 0 ? timing.segments[segIndex].chord : null;
  const next = segIndex >= 0 ? timing.segments[segIndex + 1]?.chord ?? null : null;
  const playing = state === 'playing';

  return (
    <div className="border-t border-stage-border bg-stage-card/95 backdrop-blur" aria-label="Play along">
      {open && (
        <div className="px-3 pt-2 pb-1 grid grid-cols-2 gap-x-3 gap-y-2 text-xs text-stage-muted sm:grid-cols-4">
          <label className="flex flex-col gap-0.5">
            Song fill
            <select
              value={songFill}
              onChange={(e) => rhythm.setSongFill(e.target.value as FillStyle)}
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
            Fill goes
            <select
              value={songFillWhere}
              onChange={(e) => rhythm.setSongFillWhere(e.target.value as SongFillWhere)}
              disabled={songFill === 'none'}
              className="px-2 py-1 rounded-lg bg-stage-bg border border-stage-border text-stage-text font-semibold disabled:opacity-50"
            >
              <option value="line">End of each line</option>
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
            <input type="checkbox" checked={loopBlock} onChange={(e) => setLoopBlock(e.target.checked)} /> Loop this paragraph
          </label>
          {intro && (
            <label className="flex items-center gap-1.5 col-span-2">
              <input type="checkbox" checked={withIntro} onChange={(e) => setWithIntro(e.target.checked)} /> Play the intro first ({intro.label})
            </label>
          )}
          <div className="col-span-2 sm:col-span-4 flex flex-wrap items-center gap-2">
            <button
              onClick={() => setEditing((e) => !e)}
              aria-pressed={editing}
              className={`px-2 py-1 rounded-lg border text-xs font-semibold flex items-center gap-1 ${editing ? 'bg-sky-400/20 border-sky-400 text-sky-300' : 'border-stage-border'}`}
            >
              <Ruler className="w-3.5 h-3.5" /> {editing ? 'Done setting lengths' : 'Set chord lengths'}
            </button>
            {editing ? (
              <span>Tap a chord in the song: ¼ → ½ → ¾ → 1 → 1½ → 2 bars → auto.</span>
            ) : (
              lengths.size > 0 && (
                <button onClick={() => changeLengths(new Map())} className="underline">
                  Reset {lengths.size} custom {lengths.size === 1 ? 'length' : 'lengths'}
                </button>
              )
            )}
          </div>
          <label className="flex items-center gap-1.5 col-span-2">
            Bass volume
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={bassVolume}
              onChange={(e) => setBassVolume(Number(e.target.value))}
              disabled={!bassOn}
              className="flex-1 accent-amber-400 disabled:opacity-40"
              aria-label="Bass volume"
            />
          </label>
          <label className="flex items-center gap-1.5 col-span-2">
            Drum volume
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={drumVolume}
              onChange={(e) => setDrumVolume(Number(e.target.value))}
              disabled={drums === 'off'}
              className="flex-1 accent-amber-400 disabled:opacity-40"
              aria-label="Drum volume"
            />
          </label>
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
          ) : playing && inIntro ? (
            <span className="text-sky-300 font-semibold">Intro</span>
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
        <button
          onClick={rhythm.toggleDrums}
          aria-pressed={drums !== 'off'}
          title={drums === 'off' ? 'Tap to add drums (choose light or full in the rhythm bar).' : `Drums: ${drums}. Tap to turn off.`}
          className={`px-2.5 py-1.5 rounded-lg border text-xs font-semibold flex items-center gap-1 ${drums !== 'off' ? 'bg-sky-400/20 border-sky-400 text-sky-300' : 'border-stage-border text-stage-muted'}`}
        >
          <Drum className="w-3.5 h-3.5" /> Drums {drums === 'off' ? 'off' : 'on'}
        </button>
        <button
          onClick={rhythm.toggleBass}
          aria-pressed={bassOn}
          title={bassOn ? `Bass: ${bass}. Tap to turn off.` : 'Tap to add a bass line (choose the voice in the rhythm bar).'}
          className={`px-2.5 py-1.5 rounded-lg border text-xs font-semibold flex items-center gap-1 ${bassOn ? 'bg-sky-400/20 border-sky-400 text-sky-300' : 'border-stage-border text-stage-muted'}`}
        >
          <Guitar className="w-3.5 h-3.5" /> Bass {bassOn ? 'on' : 'off'}
        </button>
        {intro && (
          <button
            onClick={() => setWithIntro((w) => !w)}
            aria-pressed={withIntro}
            title={withIntro ? `The song starts with the intro (${intro.label}). Tap to turn off.` : 'Tap to play the chosen intro before the song.'}
            className={`px-2.5 py-1.5 rounded-lg border text-xs font-semibold flex items-center gap-1 ${withIntro ? 'bg-sky-400/20 border-sky-400 text-sky-300' : 'border-stage-border text-stage-muted'}`}
          >
            <Music2 className="w-3.5 h-3.5" /> Intro {withIntro ? 'on' : 'off'}
          </button>
        )}
        <button onClick={() => setHelpOpen(true)} className="p-1.5 rounded-lg text-stage-muted hover:text-sky-300" aria-label="How Play along works" title="How Play along works">
          <CircleHelp className="w-4 h-4" />
        </button>
        <button
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className="p-1.5 rounded-lg text-stage-muted hover:text-stage-text"
          aria-label="Play-along settings"
        >
          <ChevronUp className={`w-4 h-4 transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>
      </div>
      <PlayAlongHelp isOpen={helpOpen} onClose={() => setHelpOpen(false)} />
    </div>
  );
}

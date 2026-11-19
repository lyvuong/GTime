import { useEffect, useMemo, useRef, useState } from 'react';
import type { ParsedSong } from '../lib/chordParser';
import { beatsPerBar, buildGrid, exportGridChordPro, foldGrid, locateInBlocks, playingAt, refId, shortWords, similes, slashCount, type GridBar, type GridBlock, type GridCell, type Simile } from '../lib/gridChart';
import type { SongTiming } from '../lib/songTiming';
import type { LengthEdit } from './ChordProViewer';

interface Props {
  song: ParsedSong;
  timing: SongTiming;
  position: number | null; // where the play-along is, in bars from the start of the song
  follow: boolean;
  startBar: number | null; // where playback will start from
  onPickBar: (bar: number) => void;
  lengthEdit?: LengthEdit;
}

const FOLD_KEY = 'gtime_grid_fold';

// The notation is drawn, not typed: the Unicode music symbols are missing from many phone fonts.

/** The simile mark: a slash with a dot either side. Two of them make the two-bar mark. */
function SimileMark({ two = false, className = '' }: { two?: boolean; className?: string }) {
  return (
    <svg viewBox={two ? '0 0 44 24' : '0 0 24 24'} className={`${two ? 'w-11' : 'w-6'} h-6 ${className}`} fill="currentColor" stroke="currentColor" aria-hidden="true">
      {two ? (
        <>
          <line x1="3" y1="20" x2="17" y2="4" strokeWidth="3.2" strokeLinecap="round" />
          <line x1="27" y1="20" x2="41" y2="4" strokeWidth="3.2" strokeLinecap="round" />
          <circle cx="5" cy="6" r="2.2" stroke="none" />
          <circle cx="39" cy="18" r="2.2" stroke="none" />
          <circle cx="22" cy="6" r="1.8" stroke="none" />
          <circle cx="22" cy="18" r="1.8" stroke="none" />
        </>
      ) : (
        <>
          <line x1="4" y1="20" x2="20" y2="4" strokeWidth="3.4" strokeLinecap="round" />
          <circle cx="5" cy="6" r="2.4" stroke="none" />
          <circle cx="19" cy="18" r="2.4" stroke="none" />
        </>
      )}
    </svg>
  );
}

/** A repeat barline: a thick and a thin line with two dots, facing into the repeated part. */
function RepeatSign({ side }: { side: 'start' | 'end' }) {
  const start = side === 'start';
  return (
    <div className="relative w-4 flex-shrink-0 text-stage-accent" aria-hidden="true">
      <div className={`absolute inset-y-0 w-[4px] bg-current rounded-sm ${start ? 'left-0' : 'right-0'}`} />
      <div className={`absolute inset-y-0 w-[2px] bg-current ${start ? 'left-[7px]' : 'right-[7px]'}`} />
      <div className={`absolute top-[34%] w-1.5 h-1.5 rounded-full bg-current ${start ? 'left-[11px]' : 'right-[11px]'}`} />
      <div className={`absolute top-[62%] w-1.5 h-1.5 rounded-full bg-current ${start ? 'left-[11px]' : 'right-[11px]'}`} />
    </div>
  );
}

/** The song as a grid: bars in rows, the chord in each box and a few lyric words beneath it. Repeated parts are shown once with a repeat count. */
export function GridChart({ song, timing, position, follow, startBar, onPickBar, lengthEdit }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const [wide, setWide] = useState(false);
  const [fold, setFold] = useState(() => {
    try {
      return localStorage.getItem(FOLD_KEY) !== 'off';
    } catch {
      return true;
    }
  });
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => setWide(entry.contentRect.width >= 900));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const editing = Boolean(lengthEdit?.onPick);
  const folded = fold && !editing; // changing one chord's length would break a repeat apart, so the full chart shows while editing
  const blocks = useMemo<GridBlock[]>(() => {
    const perRow = wide ? 8 : 4;
    return folded ? foldGrid(song, timing, perRow) : buildGrid(song, timing, perRow).map((r) => ({ rows: [r], repeats: 1, firstBar: r.bars[0].bar, passBars: r.bars.length }));
  }, [song, timing, wide, folded]);
  const beats = beatsPerBar(song.metadata.time);

  const now = playingAt(position);
  const where = now ? locateInBlocks(blocks, now.bar) : null; // a later pass of a repeat lights up the bar shown once
  const shown = where?.shown ?? null;

  // Keep the part that is sounding in the middle of the screen
  const activeBlock = where?.block ?? -1;
  useEffect(() => {
    if (follow && activeBlock >= 0) box.current?.querySelector(`[data-block="${activeBlock}"]`)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [follow, activeBlock]);

  const cols = wide ? 8 : 4;
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    const text = exportGridChordPro(song, timing);
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // no clipboard (an insecure page, say): hand it over as a file instead
      const url = URL.createObjectURL(new Blob([text], { type: 'text/plain' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `${song.metadata.title}.cho`;
      a.click();
      URL.revokeObjectURL(url);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };
  const toggleFold = (value: boolean) => {
    setFold(value);
    try {
      localStorage.setItem(FOLD_KEY, value ? 'on' : 'off');
    } catch {
      /* storage unavailable */
    }
  };

  return (
    <div ref={box} className="w-full h-full overflow-y-auto p-3 sm:p-5 pb-36 select-none">
      <div className="mb-3 border-b border-stage-border/60 pb-2.5 flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h1 className="text-xl sm:text-2xl font-extrabold tracking-tight">{song.metadata.title}</h1>
          {song.metadata.artist && <p className="text-xs sm:text-sm font-medium text-stage-muted mt-0.5">{song.metadata.artist}</p>}
        </div>
        <div className="flex items-center gap-2 flex-wrap text-xs font-mono font-bold">
          {song.metadata.key && <span className="px-2.5 py-0.5 rounded-md bg-stage-cardHover border border-stage-border text-stage-accent">Key: {song.metadata.key}</span>}
          {(song.metadata.capo ?? 0) > 0 && (
            <span className="px-2.5 py-0.5 rounded-md bg-amber-500/15 border border-amber-500/35 text-amber-600 dark:text-amber-300">🎸 Capo {song.metadata.capo}</span>
          )}
        </div>
      </div>

      <div className="flex items-start gap-3 pb-2 text-[11px] text-stage-muted">
        <div className="flex-1 space-y-1">
          <p>{editing ? 'Tap a chord to change how long it lasts.' : 'Tap a bar to start playing from it.'}</p>
          <p className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="inline-flex items-center gap-1 text-stage-text">
              <SimileMark className="!w-4 !h-4" /> same as the bar before
            </span>
            <span className="inline-flex items-center gap-1 text-stage-text">
              <SimileMark two className="!w-7 !h-4" /> same as the two before
            </span>
            <span className="inline-flex items-center gap-1 text-stage-text">
              <span className="font-mono font-bold">C / / /</span> the chord on every beat
            </span>
          </p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <label className="flex items-center gap-1.5 whitespace-nowrap">
            <input type="checkbox" checked={fold} onChange={(e) => toggleFold(e.target.checked)} /> Fold repeats
          </label>
          <button onClick={copy} title="Copy this chart as ChordPro grid text, to correct and add back with Add a song" className="px-2 py-0.5 rounded-md border border-stage-border font-semibold hover:bg-stage-cardHover whitespace-nowrap">
            {copied ? 'Copied' : 'Copy as ChordPro grid'}
          </button>
        </div>
      </div>

      <div className="space-y-3">
        {blocks.map((block, i) => {
          const repeated = block.repeats > 1;
          const pass = where && where.block === i ? where.pass : null;
          const span = repeated ? Math.max(...block.rows.map((r) => r.bars.length)) : cols; // a folded part is only as wide as its bars
          const rows = (
            <div className="flex-1 min-w-0 space-y-3">
              {block.rows.map((row, r) => {
                const marks = similes(row.bars);
                return (
                  <div key={r}>
                    {row.title && (
                      <span
                        className={`inline-block mb-1 text-[11px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded-md font-mono ${
                          row.type === 'chorus' ? 'bg-stage-accent text-slate-950' : row.type === 'bridge' ? 'bg-amber-400 text-slate-950' : 'bg-stage-border/70 text-stage-muted border border-stage-border'
                        }`}
                      >
                        {row.title}
                      </span>
                    )}
                    <div className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${span}, minmax(0, 1fr))` }}>
                      {row.bars.map((bar, b) => (
                        <BarBox
                          key={bar.bar}
                          bar={bar}
                          simile={marks[b]}
                          beats={beats}
                          quarter={now && shown === bar.bar ? now.quarter : null}
                          isStart={startBar === bar.bar}
                          lengthEdit={lengthEdit}
                          onPickBar={onPickBar}
                        />
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          );
          return (
            <div key={i} data-block={i} style={repeated ? { width: `calc(${span} / ${cols} * 100%)`, minWidth: 'min(100%, 9rem)' } : undefined}>
              {repeated ? (
                <div className="flex items-stretch gap-1.5">
                  <RepeatSign side="start" />
                  {rows}
                  <RepeatSign side="end" />
                </div>
              ) : (
                rows
              )}
              {repeated && (
                <div className="flex justify-end pt-1">
                  <span
                    title={`Play this part ${block.repeats} times`}
                    className={`text-sm font-mono font-black px-2.5 py-0.5 rounded-md ${pass !== null ? 'bg-stage-accent text-slate-950' : 'bg-stage-border/70 text-stage-muted'}`}
                  >
                    {pass !== null ? `pass ${pass + 1} of ${block.repeats}` : `×${block.repeats}`}
                  </span>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function BarBox({ bar, simile, beats, quarter, isStart, lengthEdit, onPickBar }: { bar: GridBar; simile: Simile; beats: number; quarter: number | null; isStart: boolean; lengthEdit?: LengthEdit; onPickBar: (bar: number) => void }) {
  const playing = quarter !== null;
  const several = bar.cells.length > 1;
  const onPick = lengthEdit?.onPick ?? null;
  const marked = simile !== 'none';

  const cell = (c: GridCell) => {
    const id = refId(c.ref);
    const lit = playing && quarter! >= c.from - 1e-9 && quarter! < c.to - 1e-9;
    const label = lengthEdit?.labels.get(id);
    const slashes = slashCount(c, beats);
    return (
      <div
        key={`${c.from}-${c.chord}`}
        style={{ flex: c.to - c.from }}
        onClick={onPick ? (e) => (e.stopPropagation(), onPick(id)) : undefined}
        className={`min-w-0 px-1 py-1 rounded-md ${lit ? 'bg-stage-accent text-slate-950' : ''} ${onPick ? 'cursor-pointer outline outline-1 outline-dashed outline-sky-400/70' : ''}`}
      >
        <div className={`font-mono font-black leading-tight whitespace-nowrap overflow-hidden ${several ? 'text-xs sm:text-sm' : 'text-lg sm:text-xl'} ${lit ? '' : 'text-stage-accent'}`}>
          {marked && !onPick ? (
            // a simile mark stands in for the chord; the two-bar mark is drawn once, across the barline
            simile === 'two-first' || simile === 'two-second' ? <span className="inline-block h-6" /> : <SimileMark />
          ) : (
            <>
              {c.chord}
              {slashes > 0 && <span className={`font-bold ${several ? 'text-[10px]' : 'text-sm'} ${lit ? 'opacity-70' : 'text-stage-muted'}`}>{' /'.repeat(slashes)}</span>}
            </>
          )}
          {label && <sup className={`ml-0.5 text-[0.55em] font-bold ${lit ? 'text-slate-800' : 'text-sky-400'}`}>{label}</sup>}
        </div>
        <div className={`text-[10px] sm:text-xs leading-tight truncate ${lit ? 'text-slate-800' : 'text-stage-muted'}`}>{shortWords(c.words, several ? 1 : 4) || ' '}</div>
      </div>
    );
  };

  return (
    <div
      data-bar={bar.bar}
      onClick={() => !onPick && onPickBar(bar.bar)}
      className={`relative flex divide-x divide-stage-border/60 rounded-lg border bg-stage-card transition-colors min-h-[3.4rem] ${!onPick ? 'cursor-pointer' : ''} ${
        playing ? 'border-stage-accent ring-2 ring-stage-accent/60' : isStart ? 'border-sky-400 border-l-4' : 'border-stage-border'
      }`}
    >
      {bar.cells.map(cell)}
      {simile === 'two-first' && !onPick && (
        <span className="absolute right-0 top-3 z-10 translate-x-1/2 rounded bg-stage-card px-0.5 text-stage-accent" style={{ marginRight: '-3px' }}>
          <SimileMark two />
        </span>
      )}
    </div>
  );
}

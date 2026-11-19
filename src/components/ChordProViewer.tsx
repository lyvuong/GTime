import React, { createContext, useContext, useRef, useEffect, useLayoutEffect, useState } from 'react';
import type { ParsedSong, SongSection, SongLine, ChordToken } from '../lib/chordParser';

interface ChordProViewerProps {
  song: ParsedSong;
  capo?: number;
  zoomLevel: number;
  // 'auto' measures the rendered song and fits it on one screen; 1 is a plain scrolling column
  columnsPreference: 'auto' | 1;
  isAutoScrolling?: boolean;
  themeStyle?: string;
  chordColor?: string;
  onChordClick?: (chord: string) => void;
  // Play-along: the chord that is sounding, the line playback will start from, and whether to scroll with it
  activeToken?: { s: number; l: number; t: number } | null;
  startLine?: { s: number; l: number } | null;
  follow?: boolean;
  onLineTap?: (s: number, l: number) => void;
  lengthEdit?: LengthEdit;
}

const MIN_FIT_REM = 0.5;
const FIT_STEP_REM = 0.05;
const MAX_COLUMNS = 3;
const MIN_COLUMN_WIDTH_PX = 240;

export const ChordProViewer: React.FC<ChordProViewerProps> = ({
  song,
  capo = 0,
  zoomLevel,
  columnsPreference,
  isAutoScrolling = false,
  chordColor,
  onChordClick,
  activeToken = null,
  startLine = null,
  follow = false,
  onLineTap,
  lengthEdit,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const [fit, setFit] = useState<{ columns: number; fontRem: number; split: boolean } | null>(null);

  // Re-run the fit whenever the container is resized
  useEffect(() => {
    if (!containerRef.current) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setDimensions({
          width: entry.contentRect.width,
          height: entry.contentRect.height,
        });
      }
    });

    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  // Measurement-based fit: try the largest font first and the fewest columns, and keep the
  // first combination whose real rendered height fits the space below the header.
  useLayoutEffect(() => {
    const container = containerRef.current;
    const content = contentRef.current;
    if (columnsPreference !== 'auto' || isAutoScrolling || !container || !content) {
      setFit(null);
      return;
    }

    const prevFontSize = container.style.fontSize;
    const prevCount = content.style.columnCount;
    const prevPad = content.style.paddingBottom;
    content.style.paddingBottom = '0';

    const bottomPad = parseFloat(getComputedStyle(container).paddingBottom) || 0;
    const maxColumns = Math.max(1, Math.min(MAX_COLUMNS, Math.floor(container.clientWidth / MIN_COLUMN_WIDTH_PX)));
    const maxRem = 1.4 * zoomLevel;

    const sectionEls = Array.from(content.children) as HTMLElement[];
    const setSplit = (split: boolean) => {
      for (const el of sectionEls) el.style.breakInside = split ? 'auto' : 'avoid';
    };

    // At each size prefer keeping sections whole; only let a section flow across columns if that
    // is what it takes (e.g. a song with no verse/chorus tags is one big section).
    let best: { columns: number; fontRem: number; split: boolean } | null = null;
    search: for (let rem = maxRem; rem >= MIN_FIT_REM - 1e-6; rem -= FIT_STEP_REM) {
      container.style.fontSize = `${rem}rem`;
      for (let cols = 1; cols <= maxColumns; cols++) {
        content.style.columnCount = String(cols);
        for (const split of cols === 1 ? [false] : [false, true]) {
          setSplit(split);
          const available = container.clientHeight - content.offsetTop - bottomPad;
          const fitsHeight = content.getBoundingClientRect().height <= available + 0.5;
          const fitsWidth = content.scrollWidth <= content.clientWidth + 1;
          if (fitsHeight && fitsWidth) {
            best = { columns: cols, fontRem: Number(rem.toFixed(2)), split };
            break search;
          }
        }
      }
    }

    for (const el of sectionEls) el.style.breakInside = '';
    container.style.fontSize = prevFontSize;
    content.style.columnCount = prevCount;
    content.style.paddingBottom = prevPad;

    setFit((prev) =>
      prev && best && prev.columns === best.columns && prev.fontRem === best.fontRem && prev.split === best.split ? prev : best
    );
  }, [song, zoomLevel, columnsPreference, isAutoScrolling, dimensions]);

  // Scroll to top whenever the song changes
  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = 0;
    }
  }, [song.metadata.title, song.metadata.key]);

  // Follow the line that is sounding, keeping it in the middle of the screen
  const activeLine = activeToken ? `${activeToken.s}-${activeToken.l}` : null;
  useEffect(() => {
    if (!follow || !activeLine) return;
    containerRef.current?.querySelector(`[data-line="${activeLine}"]`)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [follow, activeLine]);

  // Auto that fits -> fixed one-screen layout; otherwise (1 Col, auto-scrolling, or too long) -> scrolling column
  const fitted = columnsPreference === 'auto' && !isAutoScrolling ? fit : null;
  const activeColumns = fitted ? fitted.columns : 1;
  const activeFontSize = fitted ? `${fitted.fontRem}rem` : `${zoomLevel}rem`;

  return (
    <div
      ref={containerRef}
      className={`chordpro-scroll-surface relative w-full h-full p-3 sm:p-5 flex flex-col select-text transition-colors duration-150 ${
        fitted ? 'overflow-hidden' : 'overflow-y-auto'
      }`}
      style={{ fontSize: activeFontSize }}
    >
      {/* Header Info Block */}
      <div className="flex-shrink-0 mb-3 border-b border-stage-border/60 pb-2.5 flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h1 className="text-xl sm:text-2xl lg:text-3xl font-extrabold tracking-tight text-stage-text flex items-center gap-2">
            {song.metadata.title}
          </h1>
          {song.metadata.artist && (
            <p className="text-xs sm:text-sm font-medium text-stage-muted mt-0.5">
              {song.metadata.artist}
            </p>
          )}
        </div>

        {/* Badges: Key, Capo, Tempo, Time */}
        <div className="flex items-center gap-2 flex-wrap">
          {song.metadata.key && (
            <span 
              className="px-2.5 py-0.5 rounded-md bg-stage-cardHover border border-stage-border font-mono text-xs font-bold shadow-sm"
              style={{ color: chordColor || 'rgb(var(--color-stage-accent))' }}
            >
              Key: {song.metadata.key}
            </span>
          )}
          {((song.metadata.capo !== undefined ? song.metadata.capo : (capo || 0)) > 0) && (
            <span className="px-2.5 py-0.5 rounded-md bg-amber-500/15 border border-amber-500/35 text-amber-600 dark:text-amber-300 font-mono text-xs font-bold shadow-xs">
              🎸 Capo {song.metadata.capo !== undefined ? song.metadata.capo : capo}
            </span>
          )}
          {song.metadata.tempo && (
            <span className="px-2 py-0.5 rounded-md bg-stage-cardHover border border-stage-border text-stage-muted font-mono text-xs">
              {song.metadata.tempo} BPM
            </span>
          )}
          {song.metadata.style && (
            <span className="px-2 py-0.5 rounded-md bg-stage-cardHover border border-stage-border text-purple-400 font-mono text-xs font-bold">
              {song.metadata.style}
            </span>
          )}
          {song.metadata.time && (
            <span className="px-2 py-0.5 rounded-md bg-stage-cardHover border border-stage-border text-stage-muted font-mono text-xs">
              {song.metadata.time}
            </span>
          )}
        </div>
      </div>

      {/* Multi-Column Song Sections Container */}
      <div
        ref={contentRef}
        className={`w-full ${fitted ? '' : 'pb-36'}`}
        style={{
          columnCount: activeColumns,
          columnGap: '1.75rem',
          columnFill: 'balance',
        }}
      >
        <LengthContext.Provider value={lengthEdit ?? NO_LENGTHS}>
        {song.sections.map((section, secIdx) => (
          <SectionView
            allowSplit={Boolean(fitted?.split)}
            key={`sec-${secIdx}`}
            secIdx={secIdx}
            section={section}
            chordColor={chordColor}
            onChordClick={onChordClick}
            activeToken={activeToken}
            startLine={startLine}
            onLineTap={onLineTap}
          />
        ))}
        </LengthContext.Provider>
      </div>
    </div>
  );
};

const SectionView: React.FC<{
  allowSplit?: boolean;
  secIdx: number;
  section: SongSection;
  chordColor?: string;
  onChordClick?: (chord: string) => void;
  activeToken: { s: number; l: number; t: number } | null;
  startLine: { s: number; l: number } | null;
  onLineTap?: (s: number, l: number) => void;
}> = ({ allowSplit, secIdx, section, chordColor, onChordClick, activeToken, startLine, onLineTap }) => {
  const isChorus = section.type === 'chorus';
  const isBridge = section.type === 'bridge';

  return (
    <div
      className={`${allowSplit ? "break-inside-auto" : "break-inside-avoid"} mb-[1em] rounded-xl ${
        isChorus
          ? 'bg-stage-card/70 border-l-4 pl-[0.9em] pr-[0.5em] py-[0.6em] border-t border-r border-b border-stage-border/30'
          : isBridge
          ? 'bg-stage-card/40 border-l-4 border-l-amber-500 pl-[0.9em] pr-[0.5em] py-[0.5em] border-t border-r border-b border-stage-border/20'
          : 'pl-[0.25em] py-[0.25em]'
      }`}
      style={isChorus ? { borderLeftColor: chordColor || 'rgb(var(--color-stage-accent))' } : undefined}
    >
      {/* Section Title Header */}
      {section.title && (
        <div className="mb-[0.5em] flex items-center gap-1.5 break-after-avoid">
          <span
            className={`text-[0.75em] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded-md font-mono ${
              isBridge
                ? 'bg-amber-400 text-slate-950 shadow-sm'
                : !isChorus
                ? 'bg-stage-border/70 text-stage-muted border border-stage-border'
                : 'text-slate-950 shadow-sm'
            }`}
            style={isChorus ? { backgroundColor: chordColor || 'rgb(var(--color-stage-accent))', color: '#090d16' } : undefined}
          >
            {section.title}
          </span>
        </div>
      )}

      {/* Section Lines */}
      <div className="space-y-[0.5em]">
        {section.grid?.rows.map((row, r) => (
          <div key={`grid-${r}`} className="font-mono font-bold text-[0.95em] whitespace-pre-wrap break-words" style={{ color: chordColor || 'rgb(var(--color-stage-accent))' }}>
            {'| ' + row.map((bar) => bar.beats.map((b) => (b.hold ? '.' : b.chords.join('~'))).join(' ')).join(' | ') + ' |'}
          </div>
        ))}
        {section.lines.map((line, lIdx) => (
          <LineView
            key={`line-${lIdx}`}
            line={line}
            lineId={`${secIdx}-${lIdx}`}
            activeTok={activeToken && activeToken.s === secIdx && activeToken.l === lIdx ? activeToken.t : null}
            isStart={Boolean(startLine && startLine.s === secIdx && startLine.l === lIdx)}
            onTap={onLineTap ? () => onLineTap(secIdx, lIdx) : undefined}
            chordColor={chordColor}
            onChordClick={onChordClick}
          />
        ))}
      </div>
    </div>
  );
};

const LineView: React.FC<{
  line: SongLine;
  lineId: string;
  activeTok: number | null; // the token that is sounding on this line, if any
  isStart: boolean; // playback will start from this line
  onTap?: () => void;
  chordColor?: string;
  onChordClick?: (chord: string) => void;
}> = ({ line, lineId, activeTok, isStart, onTap, chordColor, onChordClick }) => {
  if (line.type === 'comment') {
    return (
      <div className="my-[0.4em] px-[0.6em] py-[0.25em] rounded bg-amber-500/10 border-l-2 border-amber-500 text-amber-800 dark:text-amber-200 font-semibold text-[0.85em] font-mono italic">
        💡 {line.commentText}
      </div>
    );
  }

  if (line.type === 'empty') {
    return <div className="h-[0.5em]" />;
  }

  return (
    <div
      data-line={lineId}
      onClick={onTap}
      className={`break-inside-avoid flex flex-wrap items-end leading-tight tracking-normal font-sans group rounded-md transition-colors ${
        onTap ? 'cursor-pointer' : ''
      } ${activeTok !== null ? 'bg-stage-accent/10' : ''} ${isStart ? 'border-l-2 border-sky-400 pl-1' : ''}`}
    >
      {line.tokens?.map((token, tIdx) => (
        <TokenView
          key={`tok-${tIdx}`}
          tokenId={`${lineId}-${tIdx}`}
          active={activeTok === tIdx}
          token={token}
          chordColor={chordColor}
          onChordClick={onChordClick}
        />
      ))}
    </div>
  );
};

// Chord lengths set by hand ("s-l-t" -> label), and the picker used while editing them
export interface LengthEdit {
  labels: Map<string, string>;
  onPick: ((id: string) => void) | null; // null: just show the labels
}
const NO_LENGTHS: LengthEdit = { labels: new Map(), onPick: null };
const LengthContext = createContext<LengthEdit>(NO_LENGTHS);

const TokenView: React.FC<{
  token: ChordToken;
  tokenId: string;
  active?: boolean;
  chordColor?: string;
  onChordClick?: (chord: string) => void;
}> = ({ token, tokenId, active = false, chordColor, onChordClick }) => {
  const hasChord = Boolean(token.chord && token.chord.trim().length > 0);
  const { labels, onPick } = useContext(LengthContext);
  const lengthLabel = labels.get(tokenId);

  return (
    <div className="inline-flex flex-col items-start min-w-[0.5em] max-w-full align-top mr-[0.15em] relative">
      {/* Chord Line (Above Lyrics) */}
      <div className="min-h-[1.25em] flex items-center">
        {hasChord ? (
          <button
            onClick={(e) => {
              if (onPick) {
                e.stopPropagation(); // editing a length, not choosing a start line
                onPick(tokenId);
              } else if (token.chord) onChordClick?.(token.chord);
            }}
            type="button"
            className={`font-mono font-black text-[0.95em] tracking-tight hover:opacity-80 hover:underline cursor-pointer select-none whitespace-nowrap px-0.5 rounded transition-colors ${
              active ? 'bg-stage-accent text-slate-950 ring-1 ring-stage-accent' : ''
            } ${onPick ? 'outline outline-1 outline-dashed outline-sky-400/70' : ''}`}
            style={{ color: chordColor || 'rgb(var(--color-stage-accent))' }}
            title={onPick ? `${token.chord}: tap to change how long it lasts` : `Chord: ${token.chord}`}
          >
            {token.chord}
            {lengthLabel && <sup className="ml-0.5 text-[0.6em] font-bold text-sky-300">{lengthLabel}</sup>}
          </button>
        ) : (
          <span className="invisible text-[0.95em] font-mono select-none">&nbsp;</span>
        )}
      </div>

      {/* Lyric Line (Below Chords) */}
      <div className="text-stage-text whitespace-pre-wrap break-words text-[1.0em] font-medium leading-tight">
        {token.lyric || '\u00A0'}
      </div>
    </div>
  );
};

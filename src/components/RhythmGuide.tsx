import { useEffect, useRef } from 'react';
import { Check, Play, Square, X } from 'lucide-react';
import { FILLS, type FillStyle } from '../lib/fills';
import { countLabels, strokeGlyph, type Pattern } from '../lib/patterns';
import { snapTempo } from '../lib/tempo';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  patterns: Pattern[];
  selectedId: string;
  listeningId: string | null; // what is being played from this guide: a pattern's id, or "fill:<id>"
  onSelect: (id: string) => void;
  onListen: (pattern: Pattern) => void;
  onStopListening: () => void;
  selectedFill: FillStyle;
  onSelectFill: (style: FillStyle) => void;
  onListenFill: (style: FillStyle) => void;
}

const GLYPH_TONE: Record<string, string> = {
  B: 'text-stage-accent font-extrabold',
  b: 'text-stage-accent',
  '↓': 'text-sky-300 font-bold',
  '↑': 'text-sky-300/80',
  '·': 'text-stage-border',
};

// Explains how each rhythm sounds and lets you hear it on the chords of the intro you are looking at
export function RhythmGuide({ isOpen, onClose, patterns, selectedId, listeningId, onSelect, onListen, onStopListening, selectedFill, onSelectFill, onListenFill }: Props) {
  const selectedRef = useRef<HTMLLIElement | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    selectedRef.current?.scrollIntoView({ block: 'nearest' });
    return () => document.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-3 pt-[max(0.75rem,env(safe-area-inset-top))] pb-[max(0.75rem,env(safe-area-inset-bottom))]"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Rhythm guide"
    >
      <div className="bg-stage-card border border-stage-border rounded-2xl w-full max-w-xl shadow-2xl flex flex-col max-h-[90dvh]" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 px-4 py-3 border-b border-stage-border">
          <h2 className="font-extrabold text-lg flex-1">Rhythm guide</h2>
          <button onClick={onClose} className="p-1.5 rounded-full hover:bg-stage-cardHover text-stage-muted" aria-label="Close">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="overflow-y-auto px-4 py-3 space-y-3">
          <p className="text-xs text-stage-muted leading-relaxed">
            Each rhythm is one bar, read left to right along the count. Tap <b>Listen</b> to hear it on the chords of the intro you have open.
          </p>
          <p className="text-[11px] text-stage-muted leading-relaxed">
            <b className="text-stage-accent">B</b> bass note · <b className="text-stage-accent">b</b> next bass note · <b className="text-sky-300">↓</b> strum down (after a bass note, just the upper strings) ·{' '}
            <b className="text-sky-300">↑</b> quick up-strum · <b>1 2 3</b> single picked strings (1 is the thinnest) · · rest
          </p>

          {(
            [
              ['Picking', patterns.filter((p) => p.kind === 'pick')],
              ['Strums and rhythms', patterns.filter((p) => p.kind === 'strum')],
            ] as const
          ).map(([heading, group]) => (
            <section key={heading}>
              <h3 className="text-[10px] font-semibold uppercase tracking-wide text-stage-muted pb-1.5">{heading}</h3>
              <ul className="space-y-2">
                {group.map((p) => {
                  const selected = p.id === selectedId;
                  const listening = p.id === listeningId;
                  const counts = countLabels(p);
                  return (
                    <li
                      key={p.id}
                      ref={selected ? selectedRef : undefined}
                      className={`rounded-xl border p-3 space-y-2 ${selected ? 'border-sky-400/60 bg-sky-500/5' : 'border-stage-border bg-stage-bg'}`}
                    >
                      <div className="flex items-baseline gap-2">
                        <h4 className="font-bold">{p.name}</h4>
                        <span className="text-[11px] font-mono text-stage-muted">
                          {p.meter ?? '4/4'} · about {snapTempo(p.bpm)} bpm
                        </span>
                        {selected && <span className="ml-auto text-[10px] font-semibold text-sky-300 flex items-center gap-1"><Check className="w-3 h-3" /> In use</span>}
                      </div>
                      <p className="text-xs text-stage-muted leading-relaxed">{p.desc}</p>

                      <div className="font-mono text-[11px] leading-tight" aria-label={`${p.name} count and strokes`}>
                        <div className="flex text-stage-muted">
                          {counts.map((c, i) => (
                            <span key={i} className={`flex-1 text-center ${/\d/.test(c) ? 'text-stage-text font-bold' : ''}`}>
                              {c}
                            </span>
                          ))}
                        </div>
                        <div className="flex text-sm">
                          {p.steps.map((t, i) => {
                            const g = strokeGlyph(t);
                            return (
                              <span key={i} className={`flex-1 text-center ${GLYPH_TONE[g] ?? 'text-stage-text'}`}>
                                {g}
                              </span>
                            );
                          })}
                        </div>
                      </div>

                      <div className="flex gap-2">
                        <button
                          onClick={() => (listening ? onStopListening() : onListen(p))}
                          className="px-3 py-1 rounded-lg bg-stage-accent text-slate-950 text-xs font-bold flex items-center gap-1.5"
                        >
                          {listening ? <Square className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                          {listening ? 'Stop' : 'Listen'}
                        </button>
                        {!selected && (
                          <button
                            onClick={() => {
                              onSelect(p.id);
                              onClose();
                            }}
                            className="px-3 py-1 rounded-lg border border-stage-border text-xs font-semibold text-stage-muted hover:text-stage-text"
                          >
                            Use this
                          </button>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}

          <section>
            <h3 className="text-[10px] font-semibold uppercase tracking-wide text-stage-muted pb-1.5">Fills</h3>
            <p className="text-[11px] text-stage-muted leading-relaxed pb-2">
              A fill replaces the last beat of a bar with a few notes that lead into the next chord. It is worked out from the chords and the song's key. In the demo, every chord change gets one.
            </p>
            <ul className="space-y-2">
              {FILLS.filter((f) => f.id !== 'none').map((f) => {
                const selected = f.id === selectedFill;
                const listening = listeningId === `fill:${f.id}`;
                return (
                  <li key={f.id} className={`rounded-xl border p-3 space-y-2 ${selected ? 'border-sky-400/60 bg-sky-500/5' : 'border-stage-border bg-stage-bg'}`}>
                    <div className="flex items-baseline gap-2">
                      <h4 className="font-bold">{f.name}</h4>
                      {selected && <span className="ml-auto text-[10px] font-semibold text-sky-300 flex items-center gap-1"><Check className="w-3 h-3" /> In use</span>}
                    </div>
                    <p className="text-xs text-stage-muted leading-relaxed">{f.desc}</p>
                    <div className="flex gap-2">
                      <button
                        onClick={() => (listening ? onStopListening() : onListenFill(f.id))}
                        className="px-3 py-1 rounded-lg bg-stage-accent text-slate-950 text-xs font-bold flex items-center gap-1.5"
                      >
                        {listening ? <Square className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                        {listening ? 'Stop' : 'Listen'}
                      </button>
                      {!selected && (
                        <button
                          onClick={() => {
                            onSelectFill(f.id);
                            onClose();
                          }}
                          className="px-3 py-1 rounded-lg border border-stage-border text-xs font-semibold text-stage-muted hover:text-stage-text"
                        >
                          Use this
                        </button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
}

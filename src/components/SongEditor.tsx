import { useMemo, useRef, useState } from 'react';
import { Check, Edit3, RotateCcw, Sparkles, X } from 'lucide-react';
import { parseChordPro } from '../lib/chordParser';
import { ChordProViewer } from './ChordProViewer';

const GRID = `{start_of_grid label="Verse 1"}
|| C . . . | G . . . | Am . . . | F . . . ||
{end_of_grid}`;

const TOOLS: { label: string; hint?: string; snippet: string; line?: boolean }[] = [
  { label: '{title}', snippet: '{title: Song title}', line: true },
  { label: '{artist}', snippet: '{artist: Artist}', line: true },
  { label: '{key}', snippet: '{key: C}', line: true },
  { label: '{tempo}', snippet: '{tempo: 100}', line: true },
  { label: '{time}', snippet: '{time: 4/4}', line: true },
  { label: '{style}', hint: 'Rhythm style, e.g. Tango, Twist, Bolero', snippet: '{style: Bolero}', line: true },
  { label: '[Chord]', snippet: '[C]' },
  { label: 'Verse', snippet: '{start_of_verse}\n\n{end_of_verse}', line: true },
  { label: 'Chorus', snippet: '{start_of_chorus}\n\n{end_of_chorus}', line: true },
  { label: 'Bridge', snippet: '{start_of_bridge}\n\n{end_of_bridge}', line: true },
  { label: 'Grid', hint: 'A chord grid: a bar between | marks, a beat to a cell, a dot holds the chord', snippet: GRID, line: true },
];

/** Edits a song's ChordPro text beside a live preview. */
export function SongEditor({ title, text, onSave, onClose }: { title: string; text: string; onSave: (text: string) => void; onClose: () => void }) {
  const [content, setContent] = useState(text);
  const [pane, setPane] = useState<'edit' | 'preview'>('edit');
  const area = useRef<HTMLTextAreaElement>(null);
  const parsed = useMemo(() => parseChordPro(content), [content]);
  const empty = parsed.allChords.length === 0;

  const insert = (snippet: string, ownLine: boolean) => {
    const ta = area.current;
    const at = ta ? ta.selectionStart : content.length;
    let pos = at;
    let add = snippet;
    if (ownLine) {
      // a directive only counts as the whole line, so go after the current line
      const eol = content.indexOf('\n', at);
      pos = eol === -1 ? content.length : eol;
      add = (pos > 0 ? '\n' : '') + snippet + '\n';
    }
    setContent(content.slice(0, pos) + add + content.slice(pos));
    setTimeout(() => {
      ta?.focus();
      ta?.setSelectionRange(pos + add.length, pos + add.length);
    }, 0);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/85 flex items-center justify-center p-2 sm:p-4">
      <div role="dialog" aria-label="Edit song" className="bg-stage-card border border-stage-border rounded-2xl w-full max-w-6xl h-[92dvh] flex flex-col shadow-2xl overflow-hidden">
        <div className="p-3 border-b border-stage-border flex items-center gap-3 bg-stage-bg/60">
          <Edit3 className="w-4 h-4 text-stage-accent shrink-0" />
          <div className="min-w-0 flex-1">
            <h3 className="font-extrabold text-sm truncate">Edit: {title}</h3>
            <p className="text-[11px] text-stage-muted truncate">Chords in [brackets] over the words, or a grid between {'{start_of_grid}'} and {'{end_of_grid}'}</p>
          </div>
          <div className="flex bg-stage-cardHover rounded-lg p-0.5 border border-stage-border md:hidden">
            {(['edit', 'preview'] as const).map((p) => (
              <button key={p} onClick={() => setPane(p)} className={`px-2.5 py-1 rounded text-xs font-semibold ${pane === p ? 'bg-stage-accent text-slate-950' : 'text-stage-muted'}`}>
                {p === 'edit' ? 'Code' : 'Preview'}
              </button>
            ))}
          </div>
          <button onClick={onClose} aria-label="Close" className="p-1.5 rounded-lg hover:bg-stage-cardHover text-stage-muted">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-3 py-2 bg-stage-bg border-b border-stage-border/70 flex items-center gap-1.5 overflow-x-auto text-xs">
          <span className="text-[11px] font-mono text-stage-muted font-bold mr-1 shrink-0">Insert:</span>
          {TOOLS.map((t) => (
            <button key={t.label} onClick={() => insert(t.snippet, !!t.line)} title={t.hint} className="px-2 py-1 rounded bg-stage-cardHover border border-stage-border font-mono shrink-0 hover:bg-stage-border">
              {t.label}
            </button>
          ))}
          <button onClick={() => setContent(text)} title="Back to the text as it was" className="ml-auto px-2 py-1 rounded border border-stage-border font-mono shrink-0 flex items-center gap-1 text-stage-muted hover:text-stage-text">
            <RotateCcw className="w-3 h-3" /> Reset
          </button>
        </div>

        <div className="flex-1 min-h-0 grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-stage-border">
          <div className={`min-h-0 flex-col bg-stage-bg ${pane === 'preview' ? 'hidden md:flex' : 'flex'}`}>
            <div className="px-3 py-1.5 border-b border-stage-border/60 text-[11px] font-mono text-stage-muted flex justify-between">
              <span>ChordPro</span>
              <span>{parsed.allChords.length} different chords</span>
            </div>
            <textarea
              ref={area}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              spellCheck={false}
              aria-label="ChordPro text"
              className="flex-1 min-h-0 w-full p-4 bg-transparent font-mono text-xs sm:text-sm focus:outline-none resize-none leading-relaxed"
            />
          </div>
          <div className={`min-h-0 flex-col bg-stage-card overflow-hidden ${pane === 'edit' ? 'hidden md:flex' : 'flex'}`}>
            <div className="px-3 py-1.5 border-b border-stage-border/60 text-[11px] font-mono text-stage-accent font-bold flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5" /> Preview
            </div>
            <div className="flex-1 min-h-0 overflow-auto p-2">
              <ChordProViewer song={parsed} zoomLevel={0.9} columnsPreference={1} />
            </div>
          </div>
        </div>

        <div className="p-3 border-t border-stage-border bg-stage-bg/50 flex items-center gap-2">
          {empty && <span className="text-xs text-amber-400">No chords yet</span>}
          <div className="flex-1" />
          <button onClick={onClose} className="px-4 py-2 rounded-xl text-xs font-semibold text-stage-muted hover:text-stage-text">
            Cancel
          </button>
          <button onClick={() => onSave(content.trim() + '\n')} disabled={empty} className="px-5 py-2.5 rounded-xl bg-stage-accent text-slate-950 font-extrabold text-xs flex items-center gap-2 disabled:opacity-40">
            <Check className="w-4 h-4" /> Save song
          </button>
        </div>
      </div>
    </div>
  );
}

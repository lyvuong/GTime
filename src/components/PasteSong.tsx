import { useRef, useState } from 'react';
import { FilePlus2 } from 'lucide-react';
import { parseChordPro } from '../lib/chordParser';
import { db } from '../lib/db';
import type { SongPayload } from '../lib/libraryStore';

const EXAMPLE = `{title: Giã Từ Đêm Mưa}
{artist: Văn Phụng}
{key: Dm}
{time: 4/4}

{start_of_grid label="Verse 1"}
|| Dm . Dm7 . | Gm . Gm7 . | C . C7 . | F . . . |
|  A7 . . .   | Dm . C .   | Bb . A . | G A G A7 ||
{end_of_grid}

{start_of_grid label="Verse 2"}
|| Dm . Dm7 . | Gm . Gm7 . | C . C7 . | F . . . |
|  A7 . . .   | Dm . C .   | Bb . A . | Bb A7 Dm . ||
{end_of_grid}
`;

const slugify = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/gi, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'song';

/** Adds a song to the library from ChordPro text: pasted in, or read from a file. Grids ({start_of_grid}) are understood. */
export function PasteSong({ onAdd }: { onAdd: (song: SongPayload) => void }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const file = useRef<HTMLInputElement>(null);

  const save = async () => {
    const parsed = parseChordPro(text);
    if (parsed.allChords.length === 0) {
      setError('No chords found. Put chords in [square brackets] over the words, or write a grid between {start_of_grid} and {end_of_grid}.');
      return;
    }
    const title = parsed.metadata.title;
    const song: SongPayload = {
      sourceId: `local-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
      slug: slugify(title),
      title,
      artist: parsed.metadata.artist ?? '',
      chordpro: text.trim() + '\n',
      sourceUrl: '',
    };
    await db.songs.add({ ...song, savedAt: Date.now() });
    setText('');
    setError('');
    setOpen(false);
    onAdd(song);
  };

  return (
    <section aria-label="Add a song" className="mt-4 p-3 rounded-xl border border-stage-border bg-stage-card/60 text-xs">
      <button onClick={() => setOpen((o) => !o)} aria-expanded={open} className="w-full flex items-center gap-1.5 font-semibold uppercase tracking-wide text-stage-muted">
        <FilePlus2 className="w-3.5 h-3.5" /> Add a song from ChordPro
        <span className="ml-auto normal-case font-normal">{open ? 'Close' : 'Paste or choose a file'}</span>
      </button>
      {open && (
        <div className="pt-2 space-y-2">
          <p className="text-stage-muted">
            Paste a ChordPro song, with chords in [brackets] over the lyrics or as a chord grid. In a grid, each bar sits between | marks with one beat to a cell, and a
            dot holds the chord before it. Use <span className="font-mono">{'{start_of_grid label="Verse 1"}'}</span> to name a section.
          </p>
          <textarea
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              setError('');
            }}
            rows={10}
            spellCheck={false}
            placeholder={EXAMPLE}
            className="w-full px-2 py-1.5 rounded-lg bg-stage-bg border border-stage-border text-stage-text font-mono text-[11px] focus:outline-none focus:border-stage-accent"
          />
          {error && <p className="text-red-400">{error}</p>}
          <div className="flex flex-wrap gap-2">
            <button onClick={save} disabled={!text.trim()} className="px-3 py-1.5 rounded-lg bg-stage-accent text-slate-950 font-bold disabled:opacity-40">
              Add to library
            </button>
            <button onClick={() => setText(EXAMPLE)} className="px-3 py-1.5 rounded-lg border border-stage-border font-semibold hover:bg-stage-cardHover">
              Insert example
            </button>
            <button onClick={() => file.current?.click()} className="px-3 py-1.5 rounded-lg border border-stage-border font-semibold hover:bg-stage-cardHover">
              Choose a file
            </button>
            <input
              ref={file}
              type="file"
              accept=".cho,.crd,.chordpro,.pro,.txt,text/plain"
              className="hidden"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                e.target.value = '';
                if (f) setText(await f.text());
              }}
            />
          </div>
        </div>
      )}
    </section>
  );
}

import { useEffect, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { ArrowLeft, BookmarkCheck, BookmarkPlus, ExternalLink, Info, Library, Loader2, Mic, Minus, Plus, RefreshCw, Search, Trash2, X } from 'lucide-react';
import { AboutModal } from './components/AboutModal';
import { Tuner } from './components/Tuner';
import { ChordProViewer } from './components/ChordProViewer';
import { parseChordPro, transposeParsedSong } from './lib/chordParser';
import { keyPrefersFlats } from './lib/chordTransposer';
import { applyThemeToDOM, CHORD_COLORS } from './lib/themeManager';
import { db, type SavedSong } from './lib/db';
import { searchApi, songApi, type SearchResult } from './lib/api';
import { checkForUpdate } from './utils/updateCheck';

interface Viewing {
  sourceId: string;
  slug: string;
  title: string;
  artist: string;
  chordpro: string;
  sourceUrl: string;
}

type Tab = 'search' | 'library' | 'tuner';

export default function App() {
  const [tab, setTab] = useState<Tab>('search');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState('');
  const [opening, setOpening] = useState<string | null>(null);
  const [viewing, setViewing] = useState<Viewing | null>(null);
  const [semitones, setSemitones] = useState(0);
  const [isAboutOpen, setIsAboutOpen] = useState(false);
  const [newVersion, setNewVersion] = useState<string | null>(null);
  const [updateDismissed, setUpdateDismissed] = useState(false);

  // Look for a newer deployment on open and whenever the app comes back to the foreground
  useEffect(() => {
    const check = () => {
      if (!navigator.onLine) return;
      checkForUpdate()
        .then((r) => setNewVersion(r.hasUpdate ? (r.latestVersion ?? '') : null))
        .catch(() => {});
    };
    const onVisible = () => document.visibilityState === 'visible' && check();
    check();
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, []);

  const library = useLiveQuery(() => db.songs.orderBy('savedAt').reverse().toArray(), []);
  const savedIds = useMemo(() => new Set((library ?? []).map((s) => s.sourceId)), [library]);

  useEffect(() => {
    applyThemeToDOM('stage-dark', CHORD_COLORS[0].id);
  }, []);

  // Debounced search; a stale response is dropped via the abort signal
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults(null);
      setSearching(false);
      return;
    }
    const ctrl = new AbortController();
    setSearching(true);
    const timer = setTimeout(() => {
      searchApi(q, ctrl.signal)
        .then((r) => {
          setResults(r);
          setError('');
          setSearching(false);
        })
        .catch((e) => {
          if (e.name === 'AbortError') return;
          setError(e.message);
          setSearching(false);
        });
    }, 350);
    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [query]);

  const openResult = async (r: SearchResult) => {
    setOpening(r.id);
    setError('');
    try {
      const song = await songApi(r.id, r.slug);
      setSemitones(0);
      setViewing({ sourceId: song.id, slug: song.slug, title: song.title, artist: song.artist, chordpro: song.chordpro, sourceUrl: song.sourceUrl });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load song');
    } finally {
      setOpening(null);
    }
  };

  const openSaved = (s: SavedSong) => {
    setSemitones(0);
    setViewing({ sourceId: s.sourceId, slug: s.slug, title: s.title, artist: s.artist, chordpro: s.chordpro, sourceUrl: s.sourceUrl });
  };

  const saveViewing = async () => {
    if (!viewing) return;
    const existing = await db.songs.where('sourceId').equals(viewing.sourceId).first();
    await db.songs.put({ ...viewing, id: existing?.id, savedAt: Date.now() });
  };

  const removeSaved = async (id: number) => {
    if (confirm('Remove this song from your library?')) await db.songs.delete(id);
  };

  const parsed = useMemo(() => (viewing ? parseChordPro(viewing.chordpro) : null), [viewing]);
  const shown = useMemo(() => {
    if (!parsed) return null;
    if (semitones === 0) return parsed;
    const flats = parsed.metadata.key ? keyPrefersFlats(parsed.metadata.key) : false;
    return transposeParsedSong(parsed, semitones, flats);
  }, [parsed, semitones]);

  if (viewing && shown) {
    const saved = savedIds.has(viewing.sourceId);
    return (
      <div className="h-dvh flex flex-col bg-stage-bg text-stage-text">
        <div className="flex items-center gap-2 p-2 border-b border-stage-border bg-stage-card">
          <button onClick={() => setViewing(null)} className="p-2 rounded-lg hover:bg-stage-cardHover" aria-label="Back">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-1 font-mono text-sm">
            <button onClick={() => setSemitones((s) => s - 1)} className="p-2 rounded-lg hover:bg-stage-cardHover" aria-label="Transpose down">
              <Minus className="w-4 h-4" />
            </button>
            <span className="w-8 text-center">{semitones > 0 ? `+${semitones}` : semitones}</span>
            <button onClick={() => setSemitones((s) => s + 1)} className="p-2 rounded-lg hover:bg-stage-cardHover" aria-label="Transpose up">
              <Plus className="w-4 h-4" />
            </button>
          </div>
          <div className="flex-1" />
          <a
            href={viewing.sourceUrl}
            target="_blank"
            rel="noreferrer"
            className="px-2 py-1.5 rounded-lg hover:bg-stage-cardHover text-xs text-stage-muted flex items-center gap-1"
          >
            <ExternalLink className="w-3.5 h-3.5" /> hopamchuan.com
          </a>
          <button
            onClick={saveViewing}
            className="px-3 py-1.5 rounded-lg bg-stage-accent/15 border border-stage-accent/40 text-stage-accent text-sm font-semibold flex items-center gap-1.5"
          >
            {saved ? <BookmarkCheck className="w-4 h-4" /> : <BookmarkPlus className="w-4 h-4" />}
            {saved ? 'Saved' : 'Save'}
          </button>
        </div>
        <div className="flex-1 min-h-0">
          <ChordProViewer song={shown} zoomLevel={1} columnsPreference={1} />
        </div>
      </div>
    );
  }

  return (
    <div className="h-dvh flex flex-col bg-stage-bg text-stage-text">
      <header className="px-4 pt-4 pb-2 flex items-center justify-between">
        <h1 className="text-2xl font-extrabold tracking-tight">
          G<span className="text-stage-accent">Time</span>
        </h1>
        <button onClick={() => setIsAboutOpen(true)} className="p-2 rounded-lg text-stage-muted hover:text-stage-text hover:bg-stage-cardHover" aria-label="About GTime" title="About">
          <Info className="w-5 h-5" />
        </button>
      </header>

      <nav className="mx-4 mb-3 grid grid-cols-3 rounded-xl border border-stage-border overflow-hidden text-sm font-semibold" aria-label="Sections">
        {(
          [
            ['search', Search, 'Search'],
            ['library', Library, `Library${library?.length ? ` (${library.length})` : ''}`],
            ['tuner', Mic, 'Tuner'],
          ] as const
        ).map(([id, Icon, label]) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            aria-current={tab === id ? 'page' : undefined}
            className={`py-2 flex items-center justify-center gap-1.5 ${tab === id ? 'bg-stage-accent/20 text-stage-accent' : 'text-stage-muted'}`}
          >
            <Icon className="w-4 h-4" /> {label}
          </button>
        ))}
      </nav>

      {tab === 'search' && (
        <div className="px-4 pb-2">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-stage-muted" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Tìm bài hát… (song title or lyrics)"
              className="w-full pl-9 pr-9 py-2.5 rounded-xl bg-stage-card border border-stage-border focus:outline-none focus:border-stage-accent"
            />
            {searching && <Loader2 className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-stage-muted" />}
          </div>
        </div>
      )}

      {error && <p className="mx-4 mb-2 text-sm text-red-400">{error}</p>}

      <main className="flex-1 min-h-0 overflow-y-auto px-4 pb-6 space-y-2">
        {tab === 'search' && (
          <>
            {results === null && !searching && (
              <p className="text-stage-muted text-sm pt-6 text-center">Type part of a song name to find chords.</p>
            )}
            {results?.length === 0 && !searching && <p className="text-stage-muted text-sm pt-6 text-center">No songs found.</p>}
            {results?.map((r) => (
              <button
                key={r.id}
                onClick={() => openResult(r)}
                disabled={opening !== null}
                className="w-full text-left p-3 rounded-xl bg-stage-card hover:bg-stage-cardHover border border-stage-border disabled:opacity-60"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold">{r.title}</span>
                  {opening === r.id ? <Loader2 className="w-4 h-4 animate-spin" /> : savedIds.has(r.id) && <BookmarkCheck className="w-4 h-4 text-stage-accent" />}
                </div>
                {r.artists.length > 0 && <div className="text-xs text-stage-muted">{r.artists.join(', ')}</div>}
                {r.preview && <div className="text-xs text-stage-muted/80 mt-1 line-clamp-1">{r.preview}</div>}
              </button>
            ))}
          </>
        )}

        {tab === 'tuner' && <Tuner />}

        {tab === 'library' && (
          <>
            {library?.length === 0 && <p className="text-stage-muted text-sm pt-6 text-center">No saved songs yet. Open a song and tap Save.</p>}
            {library?.map((s) => (
              <div key={s.id} className="flex items-center gap-2 p-3 rounded-xl bg-stage-card border border-stage-border">
                <button onClick={() => openSaved(s)} className="flex-1 text-left">
                  <div className="font-semibold">{s.title}</div>
                  {s.artist && <div className="text-xs text-stage-muted">{s.artist}</div>}
                </button>
                <button onClick={() => removeSaved(s.id!)} className="p-2 text-stage-muted hover:text-red-400" aria-label="Remove">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </>
        )}
      </main>

      <AboutModal isOpen={isAboutOpen} onClose={() => setIsAboutOpen(false)} />

      {newVersion !== null && !updateDismissed && (
        <div
          role="status"
          className="fixed left-3 right-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-40 mx-auto max-w-md flex items-center gap-3 p-3 rounded-xl bg-stage-card border border-stage-accent/50 shadow-2xl"
        >
          <RefreshCw className="w-4 h-4 text-stage-accent flex-shrink-0" />
          <span className="flex-1 text-sm">New version available{newVersion ? ` (v${newVersion})` : ''}.</span>
          <button
            onClick={() => window.location.reload()}
            className="px-3 py-1.5 rounded-lg bg-stage-accent text-slate-950 text-sm font-bold"
          >
            Update
          </button>
          <button onClick={() => setUpdateDismissed(true)} className="p-1 text-stage-muted hover:text-stage-text" aria-label="Dismiss">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
}

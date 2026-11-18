import { useEffect, useMemo, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { ArrowLeft, BookmarkCheck, ExternalLink, Info, Library, Loader2, Mic, Minus, Plus, RefreshCw, Search, Trash2, TrendingUp, X } from 'lucide-react';
import { AboutModal } from './components/AboutModal';
import { Tuner } from './components/Tuner';
import { IntroCard } from './components/IntroCard';
import { suggestIntros } from './lib/intro';
import { ChordProViewer } from './components/ChordProViewer';
import { parseChordPro, transposeParsedSong } from './lib/chordParser';
import { keyPrefersFlats } from './lib/chordTransposer';
import { applyThemeToDOM, CHORD_COLORS } from './lib/themeManager';
import { db } from './lib/db';
import { searchApi, songApi, type SearchResult } from './lib/api';
import { recordPlay, recordSearches } from './lib/libraryStore';
import { sortLibrary, topSearched, type LibrarySort, type SongStats } from './lib/stats';
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
  const [sort, setSort] = useState<LibrarySort>('recent');
  const countedRef = useRef<SearchResult[] | null>(null); // the result set already tallied as "searched"

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
  const allStats = useLiveQuery(() => db.stats.toArray(), []);
  const statsById = useMemo(() => new Map((allStats ?? []).map((s) => [s.sourceId, s])), [allStats]);
  const sortedLibrary = useMemo(() => (library ? sortLibrary(library, statsById, sort) : []), [library, statsById, sort]);
  const frequent = useMemo(() => topSearched(allStats ?? [], 8), [allStats]);

  // A search counts once it has stayed on screen for a moment (or as soon as you open one of its songs)
  const tallyResults = (r: SearchResult[] | null) => {
    if (!r || r.length === 0 || countedRef.current === r) return;
    countedRef.current = r;
    recordSearches(r).catch(() => {});
  };
  useEffect(() => {
    if (!results || results.length === 0) return;
    const timer = setTimeout(() => tallyResults(results), 1500);
    return () => clearTimeout(timer);
  }, [results]);

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

  // Playing a song counts the play and keeps the song in the library
  const play = (song: Viewing) => {
    setSemitones(0);
    setViewing(song);
    recordPlay(song, true).catch(() => {});
  };

  // Fetches a song to play; offline, falls back to the copy already in the library
  const openSong = async (id: string, slug: string) => {
    setOpening(id);
    setError('');
    try {
      let song: Viewing;
      try {
        const s = await songApi(id, slug);
        song = { sourceId: s.id, slug: s.slug, title: s.title, artist: s.artist, chordpro: s.chordpro, sourceUrl: s.sourceUrl };
      } catch (e) {
        const local = await db.songs.where('sourceId').equals(id).first();
        if (!local) throw e;
        song = local;
      }
      play(song);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load song');
    } finally {
      setOpening(null);
    }
  };

  const openResult = (r: SearchResult) => {
    tallyResults(results);
    return openSong(r.id, r.slug);
  };

  const resetCounts = async () => {
    if (confirm('Reset all search and play counts? Your saved songs are kept.')) await db.stats.clear();
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

  const intros = useMemo(() => (shown ? suggestIntros(shown) : []), [shown]);

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
          {saved && (
            <span className="px-3 py-1.5 rounded-lg bg-stage-accent/15 border border-stage-accent/40 text-stage-accent text-sm font-semibold flex items-center gap-1.5">
              <BookmarkCheck className="w-4 h-4" /> In library
            </span>
          )}
        </div>
        <IntroCard key={viewing.sourceId} options={intros} time={shown.metadata.time} capo={shown.metadata.capo} keyHint={shown.metadata.key} />
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
              <>
                <p className="text-stage-muted text-sm pt-6 pb-2 text-center">Type part of a song name to find chords.</p>
                {frequent.length > 0 && (
                  <section aria-label="Frequently searched">
                    <h2 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-stage-muted pb-1">
                      <TrendingUp className="w-3.5 h-3.5" /> Frequently searched
                    </h2>
                    <div className="space-y-2">
                      {frequent.map((s: SongStats) => (
                        <button
                          key={s.sourceId}
                          onClick={() => openSong(s.sourceId, s.slug)}
                          disabled={opening !== null}
                          className="w-full text-left p-3 rounded-xl bg-stage-card hover:bg-stage-cardHover border border-stage-border disabled:opacity-60"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-semibold">{s.title}</span>
                            {opening === s.sourceId ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <span className="text-xs text-stage-muted whitespace-nowrap">
                                searched {s.searchCount}×{s.playCount > 0 ? ` · played ${s.playCount}×` : ''}
                              </span>
                            )}
                          </div>
                          {s.artist && <div className="text-xs text-stage-muted">{s.artist}</div>}
                        </button>
                      ))}
                    </div>
                  </section>
                )}
              </>
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
            {library?.length === 0 && <p className="text-stage-muted text-sm pt-6 text-center">No songs yet. Any song you open is saved here automatically.</p>}
            {!!library?.length && (
              <div className="flex items-center gap-1.5 pb-1 text-xs">
                {(
                  [
                    ['recent', 'Recent'],
                    ['plays', 'Most played'],
                    ['az', 'A–Z'],
                  ] as const
                ).map(([id, label]) => (
                  <button
                    key={id}
                    onClick={() => setSort(id)}
                    aria-pressed={sort === id}
                    className={`px-3 py-1 rounded-full border font-semibold ${sort === id ? 'bg-stage-accent/20 border-stage-accent text-stage-accent' : 'border-stage-border text-stage-muted'}`}
                  >
                    {label}
                  </button>
                ))}
                <div className="flex-1" />
                {allStats && allStats.length > 0 && (
                  <button onClick={resetCounts} className="px-2 py-1 text-stage-muted hover:text-red-400">
                    Reset counts
                  </button>
                )}
              </div>
            )}
            {sortedLibrary.map((s) => (
              <div key={s.id} className="flex items-center gap-2 p-3 rounded-xl bg-stage-card border border-stage-border">
                <button
                  onClick={() => play({ sourceId: s.sourceId, slug: s.slug, title: s.title, artist: s.artist, chordpro: s.chordpro, sourceUrl: s.sourceUrl })}
                  className="flex-1 text-left"
                >
                  <div className="font-semibold">{s.title}</div>
                  {s.artist && <div className="text-xs text-stage-muted">{s.artist}</div>}
                </button>
                {(statsById.get(s.sourceId)?.playCount ?? 0) > 0 && (
                  <span className="text-xs text-stage-muted whitespace-nowrap">played {statsById.get(s.sourceId)!.playCount}×</span>
                )}
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

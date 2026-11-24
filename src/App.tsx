import { useEffect, useMemo, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { ArrowLeft, BookmarkCheck, ChevronLeft, ChevronRight, ExternalLink, Info, Library, Loader2, Mic, Minus, Pencil, Play, Plus, RefreshCw, Search, Trash2, TrendingUp, X } from 'lucide-react';
import { AboutModal } from './components/AboutModal';
import { LibraryBackup } from './components/LibraryBackup';
import { PasteSong } from './components/PasteSong';
import { SongEditor } from './components/SongEditor';
import { Tuner } from './components/Tuner';
import { LooperBar } from './components/LooperBar';
import { IntroCard } from './components/IntroCard';
import { PlayAlongBar } from './components/PlayAlongBar';
import { RhythmBar } from './components/RhythmBar';
import { useRhythm } from './lib/useRhythm';
import type { LineRef, SongTiming, TokenRef } from './lib/songTiming';
import { suggestIntros } from './lib/intro';
import { ChordProViewer, type LengthEdit } from './components/ChordProViewer';
import { GridChart } from './components/GridChart';
import { parseChordPro, transposeChordProText, transposeParsedSong } from './lib/chordParser';
import { keyPrefersFlats, transposeChord } from './lib/chordTransposer';
import { ThemeToggle } from './components/ThemeToggle';
import { useTheme } from './lib/useTheme';
import { db } from './lib/db';
import { artistApi, artistsApi, relatedApi, searchApi, songApi, type Artist, type Related, type SearchResult } from './lib/api';
import { suggestNext, type Suggestion } from './lib/suggest';
import { browserStore, loadShown, markShown } from './lib/shownToday';
import { recordPlay, recordSearches } from './lib/libraryStore';
import { sortLibrary, topSearched, type LibrarySort, type SongStats } from './lib/stats';
import { checkForUpdate } from './utils/updateCheck';
import { DISPLAY_VERSION } from './utils/version';

interface Viewing {
  sourceId: string;
  slug: string;
  title: string;
  artist: string;
  chordpro: string;
  sourceUrl: string;
  edited?: boolean;
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
  const [artists, setArtists] = useState<Artist[]>([]);
  const [artistView, setArtistView] = useState<{ artist: Pick<Artist, 'id' | 'slug' | 'name'>; songs: SearchResult[]; hasMore: boolean; loading: boolean } | null>(null);
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

  const theme = useTheme();

  // Debounced search; a stale response is dropped via the abort signal
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults(null);
      setArtists([]);
      setSearching(false);
      return;
    }
    const ctrl = new AbortController();
    setSearching(true);
    const timer = setTimeout(() => {
      // Matching artists are a bonus; if this lookup fails the song results still show
      artistsApi(q, ctrl.signal)
        .then(setArtists)
        .catch(() => {});
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
    markShown(browserStore(), [song.sourceId]);
    recordPlay(song, true).catch(() => {});
  };

  // Fetches a song to play; offline, falls back to the copy already in the library
  const openSong = async (id: string, slug: string) => {
    setOpening(id);
    setError('');
    try {
      let song: Viewing;
      const mine = await db.songs.where('sourceId').equals(id).first();
      try {
        if (mine?.edited) throw new Error('edited'); // your own version wins over a fresh copy
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

  // Shows an artist's songs, most viewed first; "Show more" appends the next page
  const openArtist = async (a: Pick<Artist, 'id' | 'slug' | 'name'>, more = false) => {
    const base = more && artistView ? artistView.songs : [];
    setArtistView({ artist: a, songs: base, hasMore: false, loading: true });
    setError('');
    try {
      const page = await artistApi(a.id, a.slug, base.length);
      const seen = new Set(base.map((s) => s.id));
      setArtistView({ artist: a, songs: [...base, ...page.results.filter((s) => !seen.has(s.id))], hasMore: page.hasMore, loading: false });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load songs');
      setArtistView(more ? { artist: a, songs: base, hasMore: true, loading: false } : null);
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

  const [editing, setEditing] = useState(false);

  // Keeps a changed song in the library (adding it if it was not there). Hand-set chord lengths only survive a change of key.
  const commit = async (next: Viewing, keepLengths: boolean) => {
    const existing = await db.songs.where('sourceId').equals(next.sourceId).first();
    await db.songs.put({ ...next, edited: true, id: existing?.id, savedAt: existing?.savedAt ?? Date.now(), lengths: keepLengths ? existing?.lengths : undefined });
    setViewing({ ...next, edited: true });
    setSemitones(0);
  };
  const saveEdit = async (text: string) => {
    if (!viewing) return;
    const meta = parseChordPro(text).metadata;
    await commit({ ...viewing, chordpro: text, title: meta.title && meta.title !== 'Untitled' ? meta.title : viewing.title, artist: meta.artist ?? viewing.artist }, false);
    setEditing(false);
  };

  const parsed = useMemo(() => (viewing ? parseChordPro(viewing.chordpro) : null), [viewing]);
  const shown = useMemo(() => {
    if (!parsed) return null;
    if (semitones === 0) return parsed;
    const flats = parsed.metadata.key ? keyPrefersFlats(parsed.metadata.key) : false;
    return transposeParsedSong(parsed, semitones, flats);
  }, [parsed, semitones]);

  const intros = useMemo(() => (shown ? suggestIntros(shown) : []), [shown]);

  const rhythm = useRhythm(shown?.metadata.time);
  const [active, setActive] = useState<TokenRef | null>(null);
  const [follow, setFollow] = useState(true);
  const [introId, setIntroId] = useState<string | null>(null);
  const intro = intros.find((i) => i.id === introId) ?? intros[0];
  const [lengthEdit, setLengthEdit] = useState<LengthEdit | undefined>();
  const [startLine, setStartLine] = useState<LineRef | null>(null);
  const [startAtBar, setStartAtBar] = useState<number | null>(null);
  const [timing, setTiming] = useState<SongTiming | null>(null);
  const [position, setPosition] = useState<number | null>(null);
  // The floating Play along / Record panel on the right edge; remembered between visits
  const [playOpen, setPlayOpenState] = useState<boolean>(() => {
    try {
      return localStorage.getItem('gtime_play_panel') === 'shown';
    } catch {
      return false;
    }
  });
  const setPlayOpen = (open: boolean) => {
    setPlayOpenState(open);
    try {
      localStorage.setItem('gtime_play_panel', open ? 'shown' : 'hidden');
    } catch {
      /* storage unavailable */
    }
  };
  useEffect(() => {
    setActive(null);
    setStartLine(null);
    setStartAtBar(null);
    setPosition(null);
    setIntroId(null);
  }, [viewing?.sourceId]);

  // After a song: what to play next, from the genre's popular songs, tuned to what is in your library
  const [related, setRelated] = useState<Related | null>(null);
  useEffect(() => {
    setRelated(null);
    if (!viewing || !viewing.sourceId || !viewing.slug) return;
    const ctrl = new AbortController();
    relatedApi(viewing.sourceId, viewing.slug, ctrl.signal)
      .then(setRelated)
      .catch(() => {}); // offline or the source is down: just no suggestions
    return () => ctrl.abort();
  }, [viewing?.sourceId, viewing?.slug]);
  // Worked out once when the candidates arrive (not on every library change), so the Next row stays put
  // while you play; whatever it offers counts as shown today and is not offered again
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const latest = useRef({ library, allStats, viewing });
  latest.current = { library, allStats, viewing };
  useEffect(() => {
    const { library: lib, allStats: stats, viewing: cur } = latest.current;
    if (!related || !cur) {
      setSuggestions([]);
      return;
    }
    const plays = new Map((stats ?? []).map((s) => [s.sourceId, s.playCount]));
    const next = suggestNext(related.candidates, related.genres[0]?.name ?? '', cur, lib ?? [], plays, loadShown(browserStore()));
    setSuggestions(next);
    markShown(browserStore(), next.map((s) => s.song.id));
  }, [related]);
  const [view, setViewState] = useState<'lyrics' | 'grid'>(() => {
    try {
      return localStorage.getItem('gtime_view') === 'grid' ? 'grid' : 'lyrics';
    } catch {
      return 'lyrics';
    }
  });
  const setView = (v: 'lyrics' | 'grid') => {
    setViewState(v);
    try {
      localStorage.setItem('gtime_view', v);
    } catch {
      /* storage unavailable */
    }
  };
  if (viewing && shown) {
    const saved = savedIds.has(viewing.sourceId);
    const gridOnly = shown.sections.length > 0 && shown.sections.every((s) => s.grid); // a song written as grids has no lyrics to show
    const mode = gridOnly ? 'grid' : view;
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
            {parsed?.metadata.key ? (
              <select
                aria-label="Key"
                value={semitones}
                onChange={(e) => setSemitones(Number(e.target.value))}
                className="px-1.5 py-1.5 rounded-lg bg-stage-bg border border-stage-border text-stage-text font-bold"
              >
                {Array.from({ length: 12 }, (_, i) => i - 5).map((s) => (
                  <option key={s} value={s}>
                    {transposeChord(parsed.metadata.key!, s, keyPrefersFlats(parsed.metadata.key!))}
                    {s === 0 ? ' (original)' : ''}
                  </option>
                ))}
              </select>
            ) : (
              <span className="w-8 text-center">{semitones > 0 ? `+${semitones}` : semitones}</span>
            )}
            <button onClick={() => setSemitones((s) => s + 1)} className="p-2 rounded-lg hover:bg-stage-cardHover" aria-label="Transpose up">
              <Plus className="w-4 h-4" />
            </button>
          </div>
          {semitones !== 0 && (
            <button
              onClick={() => {
                const flats = parsed?.metadata.key ? keyPrefersFlats(parsed.metadata.key) : false;
                commit({ ...viewing, chordpro: transposeChordProText(viewing.chordpro, semitones, flats) }, true);
              }}
              title="Write the song in this key, so it opens in it"
              className="px-2 py-1.5 rounded-lg border border-stage-border text-xs font-semibold hover:bg-stage-cardHover"
            >
              Save in {shown.metadata.key ?? 'this key'}
            </button>
          )}
          <div className="flex-1" />
          <button onClick={() => setEditing(true)} className="px-2 py-1.5 rounded-lg hover:bg-stage-cardHover text-xs font-semibold flex items-center gap-1">
            <Pencil className="w-3.5 h-3.5" /> Edit
          </button>
          <ThemeToggle mode={theme.mode} onNext={theme.next} />
          {viewing.sourceUrl.startsWith('http') && (
            <a
              href={viewing.sourceUrl}
              target="_blank"
              rel="noreferrer"
              className="px-2 py-1.5 rounded-lg hover:bg-stage-cardHover text-xs text-stage-muted flex items-center gap-1"
            >
              <ExternalLink className="w-3.5 h-3.5" /> hopamchuan.com
            </a>
          )}
          {saved && (
            <span className="px-3 py-1.5 rounded-lg bg-stage-accent/15 border border-stage-accent/40 text-stage-accent text-sm font-semibold flex items-center gap-1.5">
              <BookmarkCheck className="w-4 h-4" /> In library
            </span>
          )}
        </div>
        {editing && <SongEditor title={viewing.title} text={viewing.chordpro} onSave={saveEdit} onClose={() => setEditing(false)} />}
        {!gridOnly && (
        <div className="flex items-center gap-1 px-3 pt-2 text-xs" role="tablist" aria-label="Song view">
          {(
            [
              ['lyrics', 'Lyrics'],
              ['grid', 'Grid chart'],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              role="tab"
              aria-selected={view === id}
              onClick={() => setView(id)}
              className={`px-3 py-1 rounded-full border font-semibold ${view === id ? 'bg-stage-accent/20 border-stage-accent text-stage-accent' : 'border-stage-border text-stage-muted'}`}
            >
              {label}
            </button>
          ))}
        </div>
        )}
        <div className="flex-1 min-h-0">
          {mode === 'grid' && timing ? (
            <GridChart
              song={shown}
              timing={timing}
              position={position}
              follow={follow}
              startBar={startAtBar}
              onPickBar={(bar) => {
                setStartLine(null);
                setStartAtBar((cur) => (cur === bar ? null : bar));
              }}
              lengthEdit={lengthEdit}
            />
          ) : (
          <ChordProViewer
            song={shown}
            zoomLevel={1}
            columnsPreference="auto"
            activeToken={active}
            startLine={startLine}
            follow={follow}
            lengthEdit={lengthEdit}
            onLineTap={(s, l) => {
              setStartAtBar(null);
              setStartLine((cur) => (cur && cur.s === s && cur.l === l ? null : { s, l }));
            }}
          />
          )}
        </div>
        {suggestions.length > 0 && (
          <section aria-label="Next song" className="flex items-center gap-2 px-3 py-1.5 border-t border-stage-border bg-stage-card">
            <span className="shrink-0 text-xs font-semibold uppercase tracking-wide text-stage-muted">Next</span>
            <div className="flex gap-1.5 overflow-x-auto">
              {suggestions.map(({ song, reason }) => (
                <button
                  key={song.id}
                  onClick={() => openSong(song.id, song.slug)}
                  disabled={opening !== null}
                  title={reason}
                  className="shrink-0 max-w-[14rem] text-left px-3 py-1 rounded-lg border border-stage-border hover:bg-stage-cardHover disabled:opacity-60"
                >
                  <div className="text-sm font-semibold truncate">{opening === song.id ? 'Opening…' : song.title}</div>
                  <div className="text-[11px] text-stage-muted truncate">{song.artists.join(', ') || reason}</div>
                </button>
              ))}
            </div>
          </section>
        )}
        {/* Play along and Record float on the right edge, so the song gets the full height. Hidden with CSS, not
            unmounted, so playback and a recording carry on while it is tucked away. */}
        <aside
          aria-label="Play along and record"
          className={`fixed z-30 right-0 top-14 bottom-0 w-[25rem] max-w-[88vw] flex flex-col border-l-2 border-stage-border bg-stage-card shadow-2xl transition-transform duration-200 ${playOpen ? "translate-x-0" : "translate-x-full"}`}
        >
          <button
            onClick={() => setPlayOpen(!playOpen)}
            aria-expanded={playOpen}
            aria-label={playOpen ? "Hide play along and record" : "Show play along and record"}
            title={playOpen ? "Hide play along and record" : "Show play along and record"}
            className="absolute right-full top-1/2 -translate-y-1/2 flex flex-col items-center gap-1 px-1.5 py-3 rounded-l-xl border-2 border-r-0 border-stage-border bg-stage-card text-stage-accent shadow-lg"
          >
            {playOpen ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
            <Play className="w-4 h-4" />
            <Mic className="w-4 h-4" />
          </button>
          <div className="flex-1 min-h-0 overflow-y-auto" inert={!playOpen}>
            <RhythmBar rhythm={rhythm} demoChords={intros[0]?.chords ?? []} capo={shown.metadata.capo} keyHint={shown.metadata.key} />
            {/* Play along: transport and settings, then the intro ideas */}
            <div className="border-b-2 border-stage-border bg-stage-card/95">
            <PlayAlongBar
              key={`play-${viewing.sourceId}`}
              intro={intro}
              songId={String(viewing.sourceId)}
              song={shown}
              rhythm={rhythm}
              capo={shown.metadata.capo}
              keyHint={shown.metadata.key}
              startLine={startLine}
              startAtBar={startAtBar}
              onClearStart={() => {
                setStartLine(null);
                setStartAtBar(null);
              }}
              follow={follow}
              onFollowChange={setFollow}
              onActive={setActive}
              onLengthEdit={setLengthEdit}
              onTiming={setTiming}
              onPosition={setPosition}
            />
            <IntroCard key={`intro-${viewing.sourceId}`} options={intros} current={intro} onPick={setIntroId} capo={shown.metadata.capo} keyHint={shown.metadata.key} rhythm={rhythm} />
            </div>
            <LooperBar key={`loop-${viewing.sourceId}`} />
          </div>
        </aside>
      </div>
    );
  }

  return (
    <div className="h-dvh flex flex-col bg-stage-bg text-stage-text">
      <header className="px-4 pt-4 pb-2 flex items-center justify-between">
        <div className="flex items-baseline gap-2">
          <h1 className="text-2xl font-extrabold tracking-tight">
            G<span className="text-stage-accent">Time</span>
          </h1>
          <span className="font-mono text-[11px] text-stage-muted" title="App version (git commit count) and build">
            {DISPLAY_VERSION}
          </span>
        </div>
        <ThemeToggle mode={theme.mode} onNext={theme.next} />
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
              onChange={(e) => {
                setQuery(e.target.value);
                setArtistView(null);
              }}
              placeholder="Tìm bài hát hoặc nghệ sĩ… (song, lyrics or artist)"
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
            {artistView && (
              <>
                <div className="flex items-center gap-2 pt-1">
                  <button onClick={() => setArtistView(null)} className="p-2 rounded-lg hover:bg-stage-cardHover" aria-label="Back to results">
                    <ArrowLeft className="w-5 h-5" />
                  </button>
                  <div>
                    <h2 className="font-bold leading-tight">{artistView.artist.name}</h2>
                    <p className="text-xs text-stage-muted">Most popular songs first</p>
                  </div>
                </div>
                {artistView.songs.map((r) => (
                  <button
                    key={r.id}
                    onClick={() => openSong(r.id, r.slug)}
                    disabled={opening !== null}
                    className="w-full text-left p-3 rounded-xl bg-stage-card hover:bg-stage-cardHover border border-stage-border disabled:opacity-60"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold">{r.title}</span>
                      {opening === r.id ? <Loader2 className="w-4 h-4 animate-spin" /> : savedIds.has(r.id) && <BookmarkCheck className="w-4 h-4 text-stage-accent" />}
                    </div>
                    {r.artists.length > 0 && <div className="text-xs text-stage-muted">{r.artists.join(', ')}</div>}
                  </button>
                ))}
                {artistView.loading && <Loader2 className="w-5 h-5 animate-spin text-stage-muted mx-auto my-4" />}
                {artistView.hasMore && !artistView.loading && (
                  <button onClick={() => openArtist(artistView.artist, true)} className="w-full py-2 rounded-xl border border-stage-border text-sm font-semibold text-stage-muted hover:bg-stage-cardHover">
                    Show more songs
                  </button>
                )}
                {!artistView.loading && artistView.songs.length === 0 && <p className="text-stage-muted text-sm pt-6 text-center">No songs found for this artist.</p>}
              </>
            )}
            {!artistView && artists.length > 0 && results !== null && (
              <section aria-label="Artists">
                <h2 className="text-xs font-semibold uppercase tracking-wide text-stage-muted pb-1">Artists · tap for popular songs</h2>
                <div className="flex flex-wrap gap-1.5 pb-1">
                  {artists.map((a) => (
                    <button
                      key={a.id}
                      onClick={() => openArtist(a)}
                      className="px-3 py-1.5 rounded-full border border-stage-border bg-stage-card hover:bg-stage-cardHover text-sm"
                    >
                      <span className="font-semibold">{a.name}</span>
                      {a.songCount && <span className="text-xs text-stage-muted"> · {a.songCount}</span>}
                    </button>
                  ))}
                </div>
              </section>
            )}
            {!artistView && results?.length === 0 && !searching && <p className="text-stage-muted text-sm pt-6 text-center">No songs found.</p>}
            {!artistView && results?.map((r) => (
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
            <PasteSong onAdd={(song) => play(song)} />
            <LibraryBackup />
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

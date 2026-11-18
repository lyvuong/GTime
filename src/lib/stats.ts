// How often each song is searched for and played. Pure functions over plain objects so the
// counting and ranking rules can be unit-tested without a database.

export interface SongRef {
  sourceId: string;
  slug: string;
  title: string;
  artist: string;
}

export interface SongStats extends SongRef {
  searchCount: number; // times it showed up in the results of a search you settled on
  playCount: number; // times you opened it to play
  lastSearchedAt?: number;
  lastPlayedAt?: number;
}

const blank = (ref: SongRef): SongStats => ({ ...ref, searchCount: 0, playCount: 0 });

/** The song appeared in the results of a search. Title and artist are refreshed from the latest copy. */
export function tallySearch(existing: SongStats | undefined, ref: SongRef, now: number): SongStats {
  const base = existing ?? blank(ref);
  return { ...base, ...ref, searchCount: base.searchCount + 1, lastSearchedAt: now };
}

/** The song was opened to play. */
export function tallyPlay(existing: SongStats | undefined, ref: SongRef, now: number): SongStats {
  const base = existing ?? blank(ref);
  return { ...base, ...ref, playCount: base.playCount + 1, lastPlayedAt: now };
}

export type LibrarySort = 'recent' | 'plays' | 'az';

interface Sortable {
  sourceId: string;
  title: string;
  savedAt: number;
}

/** Orders library songs. Songs without any stats simply count as never played. */
export function sortLibrary<T extends Sortable>(songs: T[], stats: Map<string, SongStats>, mode: LibrarySort): T[] {
  const recency = (s: T) => Math.max(s.savedAt, stats.get(s.sourceId)?.lastPlayedAt ?? 0);
  const plays = (s: T) => stats.get(s.sourceId)?.playCount ?? 0;
  const copy = [...songs];
  if (mode === 'az') return copy.sort((a, b) => a.title.localeCompare(b.title, 'vi'));
  if (mode === 'plays') return copy.sort((a, b) => plays(b) - plays(a) || recency(b) - recency(a));
  return copy.sort((a, b) => recency(b) - recency(a));
}

/** The songs searched for most, most-searched first. Ties go to the more recent search. */
export function topSearched(all: SongStats[], limit: number): SongStats[] {
  return all
    .filter((s) => s.searchCount > 0)
    .sort(
      (a, b) =>
        b.searchCount - a.searchCount ||
        (b.lastSearchedAt ?? 0) - (a.lastSearchedAt ?? 0) ||
        b.playCount - a.playCount,
    )
    .slice(0, limit);
}

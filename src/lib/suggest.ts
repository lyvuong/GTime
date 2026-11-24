// Picks what to play after the song you are on. Candidates arrive from the source already in
// popularity order within the song's genre; this drops what you have, then lifts songs by
// artists you keep in your library (more so the ones you play). Plain functions, no database.
import type { SearchResult } from './api';

export interface Suggestion {
  song: SearchResult;
  reason: string;
}

interface LibrarySong {
  sourceId: string;
  title: string;
  artist: string;
}

/** Lower-case, accent-free, letters and digits only, so "Diễm Xưa" and "diem xua!" compare equal. */
export const normalize = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/gi, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');

export function suggestNext(
  candidates: SearchResult[],
  genre: string,
  current: { sourceId: string; title: string },
  library: LibrarySong[],
  playCounts: Map<string, number>,
  shownToday: Set<string> = new Set(),
  limit = 3,
): Suggestion[] {
  const owned = new Set(library.map((s) => s.sourceId));
  const titles = new Set([normalize(current.title), ...library.map((s) => normalize(s.title))]);

  // How much you lean on each artist: every library song counts once, plus once per play
  const affinity = new Map<string, number>();
  for (const s of library) {
    const key = normalize(s.artist);
    if (key) affinity.set(key, (affinity.get(key) ?? 0) + 1 + (playCounts.get(s.sourceId) ?? 0));
  }

  const seenTitles = new Set<string>();
  const scored: (Suggestion & { score: number })[] = [];
  candidates.forEach((song, i) => {
    const title = normalize(song.title);
    // Skip songs you have (or this very song), and covers or mashups sharing a title with one
    if (song.id === current.sourceId || owned.has(song.id) || shownToday.has(song.id) || titles.has(title) || seenTitles.has(title)) return;
    seenTitles.add(title);
    let best = 0;
    let bestArtist = '';
    for (const a of song.artists) {
      const w = affinity.get(normalize(a)) ?? 0;
      if (w > best) [best, bestArtist] = [w, a];
    }
    const popularity = 1 - i / Math.max(candidates.length, 1);
    scored.push({
      song,
      score: popularity + 0.6 * Math.min(1, best / 3),
      reason: best > 0 ? `More ${bestArtist}, from your library` : genre ? `Popular in ${genre}` : 'Popular',
    });
  });
  return scored.sort((a, b) => b.score - a.score).slice(0, limit).map(({ song, reason }) => ({ song, reason }));
}

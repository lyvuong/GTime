// Database side of the library: saving a played song and keeping the search and play tallies.
import { db, type SavedSong } from './db';
import { tallyPlay, tallySearch, type SongRef } from './stats';
import type { SearchResult } from './api';

export type SongPayload = Omit<SavedSong, 'id' | 'savedAt' | 'lengths'>;

const refOf = (s: SongPayload): SongRef => ({ sourceId: s.sourceId, slug: s.slug, title: s.title, artist: s.artist });

/** Counts every song in a settled search's results as "searched". */
export async function recordSearches(results: SearchResult[]): Promise<void> {
  if (results.length === 0) return;
  const now = Date.now();
  await db.transaction('rw', db.stats, async () => {
    for (const r of results) {
      const ref: SongRef = { sourceId: r.id, slug: r.slug, title: r.title, artist: r.artists.join(', ') };
      await db.stats.put(tallySearch(await db.stats.get(r.id), ref, now));
    }
  });
}

/**
 * Counts a play. When `save` is set, the song is also added to the library (or its saved copy is
 * refreshed), so playing a song is all it takes to keep it.
 */
export async function recordPlay(song: SongPayload, save: boolean): Promise<void> {
  const now = Date.now();
  await db.transaction('rw', db.songs, db.stats, async () => {
    await db.stats.put(tallyPlay(await db.stats.get(song.sourceId), refOf(song), now));
    if (!save) return;
    const existing = await db.songs.where('sourceId').equals(song.sourceId).first();
    // Keep the original save date and row, so "recent" reflects plays and not re-fetches
    // ...and the chord lengths set by hand
    await db.songs.put({ ...song, id: existing?.id, savedAt: existing?.savedAt ?? now, lengths: existing?.lengths });
  });
}

/** The chord lengths saved with a song (empty if none, or if it is not in the library). */
export async function loadLengths(sourceId: string): Promise<Map<string, number>> {
  const song = await db.songs.where('sourceId').equals(sourceId).first();
  return new Map(Object.entries(song?.lengths ?? {}));
}

/** Saves the chord lengths with the song in the library. */
export async function saveLengths(sourceId: string, lengths: Map<string, number>): Promise<void> {
  const value = lengths.size ? Object.fromEntries(lengths) : undefined;
  await db.songs.where('sourceId').equals(sourceId).modify({ lengths: value });
}

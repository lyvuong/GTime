import Dexie, { type Table } from 'dexie';
import type { SongStats } from './stats';

export interface SavedSong {
  id?: number;
  sourceId: string; // HopAmChuan song id; unique so saving twice updates instead of duplicating
  slug: string;
  title: string;
  artist: string;
  chordpro: string;
  sourceUrl: string;
  savedAt: number;
}

class GTimeDatabase extends Dexie {
  songs!: Table<SavedSong, number>;
  stats!: Table<SongStats, string>;

  constructor() {
    super('GTimeDB');
    this.version(1).stores({ songs: '++id, &sourceId, title, savedAt' });
    // v2: per-song search and play tallies, kept even if the song is later removed from the library
    this.version(2).stores({
      songs: '++id, &sourceId, title, savedAt',
      stats: 'sourceId, searchCount, playCount, lastPlayedAt',
    });
  }
}

export const db = new GTimeDatabase();

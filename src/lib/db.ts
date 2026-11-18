import Dexie, { type Table } from 'dexie';

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

  constructor() {
    super('GTimeDB');
    this.version(1).stores({ songs: '++id, &sourceId, title, savedAt' });
  }
}

export const db = new GTimeDatabase();

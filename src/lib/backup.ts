// Export and import of the library: the saved songs (with their chord lengths), the search and play
// tallies, and the app's settings. Pure functions over plain objects so the rules can be unit-tested.
import type { SavedSong } from './db.ts';
import type { SongStats } from './stats.ts';

export const BACKUP_FORMAT = 'gtime-backup';
export const SETTINGS_PREFIX = 'gtime_';
const SKIP_SETTINGS = new Set(['gtime_tab_open']); // which tab was open is not a setting worth carrying over

export interface Backup {
  format: typeof BACKUP_FORMAT;
  version: 1;
  exportedAt: string;
  songs: Omit<SavedSong, 'id'>[];
  stats: SongStats[];
  settings: Record<string, string>;
}

export function buildBackup(songs: SavedSong[], stats: SongStats[], settings: Record<string, string>, now = new Date()): Backup {
  return {
    format: BACKUP_FORMAT,
    version: 1,
    exportedAt: now.toISOString(),
    songs: songs.map(({ id: _id, ...rest }) => rest), // ids belong to this device's database
    stats,
    settings: pickSettings(settings),
  };
}

/** Only the app's own settings, as strings. */
export function pickSettings(all: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(all)) {
    if (k.startsWith(SETTINGS_PREFIX) && !SKIP_SETTINGS.has(k) && typeof v === 'string') out[k] = v;
  }
  return out;
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Reads a backup file's text. Throws with a plain message if it is not a GTime backup; skips bad entries. */
export function parseBackup(text: string): Backup {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error('That file is not valid JSON.');
  }
  if (!isObject(raw) || raw.format !== BACKUP_FORMAT || !Array.isArray(raw.songs)) throw new Error('That file is not a GTime backup.');
  const songs = raw.songs.filter(
    (s): s is Omit<SavedSong, 'id'> =>
      isObject(s) && typeof s.sourceId === 'string' && typeof s.title === 'string' && typeof s.chordpro === 'string' && typeof s.slug === 'string',
  ).map((s) => ({ ...s, artist: typeof s.artist === 'string' ? s.artist : '', sourceUrl: typeof s.sourceUrl === 'string' ? s.sourceUrl : '', savedAt: typeof s.savedAt === 'number' ? s.savedAt : Date.now() }));
  const stats = (Array.isArray(raw.stats) ? raw.stats : []).filter(
    (s): s is SongStats => isObject(s) && typeof s.sourceId === 'string' && typeof s.searchCount === 'number' && typeof s.playCount === 'number',
  );
  return {
    format: BACKUP_FORMAT,
    version: 1,
    exportedAt: typeof raw.exportedAt === 'string' ? raw.exportedAt : '',
    songs,
    stats,
    settings: isObject(raw.settings) ? pickSettings(raw.settings) : {},
  };
}

/** Keeps the larger tally and the later dates when the same song is in both. */
export function mergeStats(mine: SongStats | undefined, theirs: SongStats): SongStats {
  if (!mine) return theirs;
  const later = (a?: number, b?: number) => (a === undefined ? b : b === undefined ? a : Math.max(a, b));
  return {
    ...theirs,
    ...mine,
    searchCount: Math.max(mine.searchCount, theirs.searchCount),
    playCount: Math.max(mine.playCount, theirs.playCount),
    lastSearchedAt: later(mine.lastSearchedAt, theirs.lastSearchedAt),
    lastPlayedAt: later(mine.lastPlayedAt, theirs.lastPlayedAt),
  };
}

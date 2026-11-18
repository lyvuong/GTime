// Reads and writes the library for backup: Dexie tables and localStorage settings.
import { db } from './db';
import { buildBackup, mergeStats, parseBackup, pickSettings, type Backup } from './backup';

function readSettings(): Record<string, string> {
  const all: Record<string, string> = {};
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)!;
      const v = localStorage.getItem(k);
      if (v !== null) all[k] = v;
    }
  } catch {
    /* storage unavailable: back up without settings */
  }
  return pickSettings(all);
}

export async function exportBackup(): Promise<{ text: string; blob: Blob; filename: string; songs: number }> {
  const [songs, stats] = await Promise.all([db.songs.toArray(), db.stats.toArray()]);
  const backup = buildBackup(songs, stats, readSettings());
  const text = JSON.stringify(backup, null, 2);
  return {
    text,
    blob: new Blob([text], { type: 'application/json' }),
    filename: `GTime_Backup_${backup.exportedAt.slice(0, 10)}.json`,
    songs: songs.length,
  };
}

export interface ImportResult {
  added: number;
  updated: number;
  settings: number;
}

/** Adds the backup's songs to the library (a song already there is replaced by the backup's copy) and keeps the larger tallies. */
export async function importBackup(text: string): Promise<ImportResult> {
  const backup: Backup = parseBackup(text);
  const result: ImportResult = { added: 0, updated: 0, settings: 0 };
  await db.transaction('rw', db.songs, db.stats, async () => {
    const existing = new Map((await db.songs.toArray()).map((s) => [s.sourceId, s]));
    for (const song of backup.songs) {
      const mine = existing.get(song.sourceId);
      if (mine) {
        await db.songs.update(mine.id!, song);
        result.updated++;
      } else {
        await db.songs.add(song);
        result.added++;
      }
    }
    const mineStats = new Map((await db.stats.toArray()).map((s) => [s.sourceId, s]));
    for (const s of backup.stats) await db.stats.put(mergeStats(mineStats.get(s.sourceId), s));
  });
  try {
    for (const [k, v] of Object.entries(backup.settings)) {
      localStorage.setItem(k, v);
      result.settings++;
    }
  } catch {
    /* storage unavailable: songs are restored, settings are not */
  }
  return result;
}

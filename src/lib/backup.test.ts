import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildBackup, mergeStats, parseBackup, pickSettings } from './backup.ts';

const song = { id: 7, sourceId: '1', slug: 's', title: 'T', artist: 'A', chordpro: '[C]x', sourceUrl: 'u', savedAt: 5, lengths: { '0-0-1': 2 } };
const stat = { sourceId: '1', slug: 's', title: 'T', artist: 'A', searchCount: 3, playCount: 2, lastPlayedAt: 9 };

test('a backup round-trips songs (without ids, with chord lengths), tallies and settings', () => {
  const text = JSON.stringify(buildBackup([song], [stat], { gtime_rhythm: 'tango', other: 'x', gtime_tab_open: '1' }));
  const back = parseBackup(text);
  assert.equal(back.songs.length, 1);
  assert.equal('id' in back.songs[0], false);
  assert.deepEqual(back.songs[0].lengths, { '0-0-1': 2 });
  assert.deepEqual(back.stats, [stat]);
  assert.deepEqual(back.settings, { gtime_rhythm: 'tango' });
});

test('files that are not GTime backups are refused with a plain message', () => {
  assert.throws(() => parseBackup('nope'), /not valid JSON/);
  assert.throws(() => parseBackup('{"songs":[]}'), /not a GTime backup/);
  assert.throws(() => parseBackup('[]'), /not a GTime backup/);
});

test('broken entries are skipped and missing fields filled in', () => {
  const good = { sourceId: '1', slug: 's', title: 'T', chordpro: 'c' };
  const text = JSON.stringify({ format: 'gtime-backup', version: 1, songs: [good, { title: 'no id' }, 5], stats: [{ sourceId: 'x' }] });
  const back = parseBackup(text);
  assert.equal(back.songs.length, 1);
  assert.equal(back.songs[0].artist, '');
  assert.equal(back.stats.length, 0);
});

test('merging tallies keeps the larger counts and later dates', () => {
  const merged = mergeStats({ ...stat, searchCount: 5, playCount: 1, lastPlayedAt: 4 }, stat);
  assert.equal(merged.searchCount, 5);
  assert.equal(merged.playCount, 2);
  assert.equal(merged.lastPlayedAt, 9);
  assert.equal(mergeStats(undefined, stat), stat);
});

test("only the app's own string settings are picked", () => {
  assert.deepEqual(pickSettings({ gtime_bass: 'electric', gtime_tab_open: 'x', foo: 'y', gtime_n: 3 }), { gtime_bass: 'electric' });
});

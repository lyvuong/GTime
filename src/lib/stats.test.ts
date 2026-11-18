import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sortLibrary, tallyPlay, tallySearch, topSearched, type SongStats } from './stats.ts';

const ref = (n: number) => ({ sourceId: String(n), slug: `s-${n}`, title: `Song ${n}`, artist: 'A' });

test('tallies start at zero and count searches and plays separately', () => {
  let s = tallySearch(undefined, ref(1), 100);
  assert.equal(s.searchCount, 1);
  assert.equal(s.playCount, 0);
  s = tallySearch(s, ref(1), 200);
  s = tallyPlay(s, ref(1), 300);
  assert.deepEqual([s.searchCount, s.playCount, s.lastSearchedAt, s.lastPlayedAt], [2, 1, 200, 300]);
});

test('tallies refresh the title from the latest copy', () => {
  const s = tallyPlay(tallySearch(undefined, ref(1), 1), { ...ref(1), title: 'Renamed' }, 2);
  assert.equal(s.title, 'Renamed');
});

test('topSearched ranks by search count, then recency, and skips never-searched songs', () => {
  const mk = (n: number, searchCount: number, lastSearchedAt: number): SongStats => ({ ...ref(n), searchCount, playCount: 0, lastSearchedAt });
  const all = [mk(1, 2, 10), mk(2, 5, 5), mk(3, 2, 20), mk(4, 0, 99)];
  assert.deepEqual(topSearched(all, 10).map((s) => s.sourceId), ['2', '3', '1']);
  assert.equal(topSearched(all, 2).length, 2);
});

test('sortLibrary: recent uses last play, plays uses count, az uses Vietnamese collation', () => {
  const songs = [
    { sourceId: 'a', title: 'Em', savedAt: 100 },
    { sourceId: 'b', title: 'Anh', savedAt: 200 },
    { sourceId: 'c', title: 'Bình', savedAt: 50 },
  ];
  const stats = new Map<string, SongStats>([
    ['c', { ...ref(3), sourceId: 'c', searchCount: 0, playCount: 9, lastPlayedAt: 500 }],
    ['a', { ...ref(1), sourceId: 'a', searchCount: 0, playCount: 2, lastPlayedAt: 150 }],
  ]);
  assert.deepEqual(sortLibrary(songs, stats, 'recent').map((s) => s.sourceId), ['c', 'b', 'a']);
  assert.deepEqual(sortLibrary(songs, stats, 'plays').map((s) => s.sourceId), ['c', 'a', 'b']);
  assert.deepEqual(sortLibrary(songs, stats, 'az').map((s) => s.sourceId), ['b', 'c', 'a']);
  assert.equal(songs[0].sourceId, 'a', 'input is not mutated');
});

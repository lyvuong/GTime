import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalize, suggestNext } from './suggest.ts';

const song = (id: string, title: string, artists: string[] = []) => ({ id, slug: id, title, artists, preview: '' });
const cur = { sourceId: '1', title: 'Diễm Xưa' };

test('normalize ignores accents, case and punctuation', () => {
  assert.equal(normalize('Diễm Xưa!'), 'diemxua');
  assert.equal(normalize('Đêm'), 'dem');
});

test('keeps the source popularity order when there is nothing in the library', () => {
  const out = suggestNext([song('2', 'A'), song('3', 'B'), song('4', 'C'), song('5', 'D')], 'Nhạc Trữ Tình', cur, [], new Map());
  assert.deepEqual(out.map((s) => s.song.id), ['2', '3', '4']);
  assert.equal(out[0].reason, 'Popular in Nhạc Trữ Tình');
});

test('leaves out the current song, songs in the library and repeated titles', () => {
  const lib = [{ sourceId: '3', title: 'Cát Bụi', artist: 'X' }];
  const out = suggestNext(
    [song('1', 'Diễm Xưa'), song('2', 'Hạ Trắng'), song('3', 'Cát Bụi'), song('9', 'cát bụi'), song('4', 'Hạ Trắng (cover)'), song('5', 'Hạ trắng')],
    '',
    cur,
    lib,
    new Map(),
  );
  assert.deepEqual(out.map((s) => s.song.id), ['2', '4']);
});

test('lifts songs by artists in your library, more for ones you play', () => {
  const lib = [{ sourceId: '100', title: 'Other', artist: 'Khánh Ly' }];
  const cands = [song('2', 'A', ['Quang Dũng']), song('4', 'C', ['Khánh Ly']), song('3', 'B', ['Hồng Nhung'])];
  const out = suggestNext(cands, 'Nhạc Trữ Tình', cur, lib, new Map([['100', 5]]));
  assert.deepEqual(out.map((s) => s.song.id), ['4', '2', '3']); // second place overtakes first
  // ...but without a library artist the popularity order stands
  assert.deepEqual(suggestNext(cands, '', cur, [], new Map()).map((s) => s.song.id), ['2', '4', '3']);
  assert.equal(out[0].reason, 'More Khánh Ly, from your library');
});

test('skips songs already shown today', () => {
  const out = suggestNext([song('2', 'A'), song('3', 'B'), song('4', 'C'), song('5', 'D')], '', cur, [], new Map(), new Set(['2', '4']));
  assert.deepEqual(out.map((s) => s.song.id), ['3', '5']);
});

test('returns nothing when every candidate is already known', () => {
  assert.deepEqual(suggestNext([song('1', 'Diễm Xưa')], '', cur, [], new Map()), []);
});

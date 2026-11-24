import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseArtistPage, parseArtistResults, parseSearchResults, parseSong } from './hopamchuan.ts';

const chord = (c: string) => `<span class="hopamchuan_chord_inline"><i>[</i><span class="hopamchuan_chord">${c}</span><i>]</i></span>`;
const lyric = (t: string) => `<span class="hopamchuan_lyric">${t}</span>`;

test('parseSearchResults extracts id, slug, title, artists and plain preview', () => {
  const html = `<div class="song-list"><div class="song-item">
    <a href="https://hopamchuan.com/song/23374/nang-tho/?s=1" class="song-title"> Nàng Thơ </a>
    <a href="/artist/1/x" class="author-item"> Thùy Chi </a>
    <div class="song-preview-lyric">Ngả [G]nghiêng cho đời</div></div>
    <div class="song-item"><a href="/song/23374/nang-tho/x?s=1" class="song-title">dup</a></div></div>`;
  const r = parseSearchResults(html);
  assert.equal(r.length, 1);
  assert.deepEqual(r[0], { id: '23374', slug: 'nang-tho', title: 'Nàng Thơ', artists: ['Thùy Chi'], preview: 'Ngả nghiêng cho đời' });
});

test('parseArtistResults extracts id, slug, name and song count', () => {
  const html = `<div class="artist-list"><a class="artist-item" href="https://hopamchuan.com/artist/161/trinh-cong-son">
    <div class="artist-thumb"></div> Trịnh Công Sơn <span class="artist-songs"> 365 bài hát </span></a></div>`;
  assert.deepEqual(parseArtistResults(html), [{ id: '161', slug: 'trinh-cong-son', name: 'Trịnh Công Sơn', songCount: '365 bài hát' }]);
});

test('parseArtistPage reads the name, songs and whether there is a next page', () => {
  const page = (next: string) => `<div id="artist-info"><h2> Trịnh Công Sơn </h2></div>
    <div class="song-item"><a href="/song/301/diem-xua/" class="song-title">Diễm Xưa</a></div>
    <div class="pagination"><strong>1</strong>${next}</div>`;
  const a = parseArtistPage(page('<a href="?offset=10" rel="next">&gt;</a>'));
  assert.equal(a.name, 'Trịnh Công Sơn');
  assert.equal(a.results[0].title, 'Diễm Xưa');
  assert.equal(a.hasMore, true);
  assert.equal(parseArtistPage(page('')).hasMore, false);
});

test('parseSong converts inline chord spans to ChordPro with capo and intro', () => {
  const html = `<div id="song-info" data-key="G"><h1 id="song-title"><span>Nàng Thơ</span></h1><a class="author-item">Thùy Chi</a></div>
  <div id="song-lyric"><div class="song-lyric-note">
    <div class="chord_lyric_line text_only">Capo 4</div>
    <div class="chord_lyric_line">${chord('G')}${lyric(' ')}${chord('C')}</div></div>
    <div class="chord_lyric_line">${lyric('Ngả ')}${chord('G')}${lyric('nghiêng ')}</div>
    <div class="chord_lyric_line empty_line">&nbsp;</div>
    <div class="chord_lyric_line text_only">Điệp khúc</div>
    <div class="chord_lyric_line">${chord('Am7')}${lyric('Về')}</div></div>`;
  const s = parseSong(html, '23374', 'nang-tho');
  assert.equal(s.title, 'Nàng Thơ');
  assert.equal(s.artist, 'Thùy Chi');
  assert.equal(s.key, 'G');
  assert.equal(s.capo, 4);
  assert.match(s.chordpro, /\{capo: 4\}/);
  assert.match(s.chordpro, /\{comment: Intro\}\n\[G\] \[C\]/);
  assert.match(s.chordpro, /Ngả \[G\]nghiêng/);
  assert.match(s.chordpro, /\{comment: Điệp khúc\}\n\[Am7\]Về/);
  assert.match(s.chordpro, /\{comment: Source: https:\/\/hopamchuan\.com\/song\/23374\/nang-tho\/\}/);
});

test('parseSong throws when lyrics are missing', () => {
  assert.throws(() => parseSong('<html></html>', '1', 'x'), /not found/);
});

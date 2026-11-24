// Fetches and parses hopamchuan.com pages. Runs in a Cloudflare Worker and in the Vite dev
// server, so it only uses web-standard APIs (fetch) plus node-html-parser.
import { parse, type HTMLElement } from 'node-html-parser';

export const SOURCE_BASE = 'https://hopamchuan.com';

export interface SearchResult {
  id: string;
  slug: string;
  title: string;
  artists: string[];
  preview: string;
}

export interface SongData {
  id: string;
  slug: string;
  title: string;
  artist: string;
  key: string;
  capo: number;
  chordpro: string;
  sourceUrl: string;
}

const SONG_HREF = /\/song\/(\d+)\/([a-z0-9-]+)/i;
const clean = (s: string) => s.replace(/\s+/g, ' ').trim();

async function fetchHtml(url: string): Promise<string> {
  const init = { headers: { 'User-Agent': 'GTime/0.1 (personal chord library)', 'Accept-Language': 'vi,en;q=0.8' } };
  let res: Response;
  try {
    res = await fetch(url, init);
  } catch {
    // One retry for transient connection resets
    res = await fetch(url, init);
  }
  if (!res.ok) throw new Error(`Source returned ${res.status}`);
  return res.text();
}

export function parseSearchResults(html: string): SearchResult[] {
  const root = parse(html);
  const out: SearchResult[] = [];
  const seen = new Set<string>();
  for (const item of root.querySelectorAll('.song-item')) {
    const link = item.querySelector('a.song-title');
    const m = link?.getAttribute('href')?.match(SONG_HREF);
    if (!link || !m || seen.has(m[1])) continue;
    seen.add(m[1]);
    out.push({
      id: m[1],
      slug: m[2].toLowerCase(),
      title: clean(link.text),
      artists: item.querySelectorAll('.author-item').map((a) => clean(a.text)).filter(Boolean),
      // The preview carries inline [chords]; show plain lyrics only
      preview: clean((item.querySelector('.song-preview-lyric')?.text ?? '').replace(/\[[^\]]*\]/g, '')),
    });
  }
  return out;
}

function lineToChordPro(line: HTMLElement): string {
  const cls = line.classNames;
  if (cls.includes('empty_line')) return '';
  if (cls.includes('text_only')) return clean(line.text);
  let out = '';
  for (const node of line.childNodes) {
    const el = node as HTMLElement;
    const c = el.classNames ?? '';
    if (c.includes('hopamchuan_chord_inline')) {
      const chord = clean(el.querySelector('.hopamchuan_chord')?.text ?? '');
      if (chord) out += `[${chord}]`;
    } else if (c.includes('hopamchuan_lyric')) {
      out += el.text;
    }
  }
  return out.replace(/\s+$/, '');
}

export function parseSong(html: string, id: string, slug: string): SongData {
  const root = parse(html);
  const lyric = root.querySelector('#song-lyric');
  if (!lyric) throw new Error('Song lyrics not found on source page');

  const title = clean(root.querySelector('#song-title span')?.text ?? '') || slug;
  const artist = clean(root.querySelector('.author-item')?.text ?? '');
  const key = root.querySelector('#song-info')?.getAttribute('data-key') ?? '';

  let capo = 0;
  const intro: string[] = [];
  const noteLines = lyric.querySelectorAll('.song-lyric-note .chord_lyric_line');
  for (const l of noteLines) {
    const text = lineToChordPro(l);
    const capoMatch = l.classNames.includes('text_only') ? text.match(/capo\s*(\d+)/i) : null;
    if (capoMatch) capo = Number(capoMatch[1]);
    else if (text) intro.push(text);
  }

  const body: string[] = [];
  for (const l of lyric.querySelectorAll('.chord_lyric_line')) {
    if (noteLines.includes(l)) continue;
    const text = lineToChordPro(l);
    body.push(l.classNames.includes('text_only') && text ? `{comment: ${text}}` : text);
  }

  const sourceUrl = `${SOURCE_BASE}/song/${id}/${slug}/`;
  const head = [`{title: ${title}}`];
  if (artist) head.push(`{artist: ${artist}}`);
  if (key) head.push(`{key: ${key}}`);
  if (capo) head.push(`{capo: ${capo}}`);
  const parts = [head.join('\n')];
  if (intro.length) parts.push(`{comment: Intro}\n${intro.join('\n')}`);
  parts.push(body.join('\n').replace(/\n{3,}/g, '\n\n').trim());
  parts.push(`{comment: Source: ${sourceUrl}}`);

  return { id, slug, title, artist, key, capo, chordpro: parts.join('\n\n') + '\n', sourceUrl };
}

export async function searchSongs(query: string): Promise<SearchResult[]> {
  const q = query.trim().slice(0, 100);
  if (q.length < 2) return [];
  return parseSearchResults(await fetchHtml(`${SOURCE_BASE}/search?q=${encodeURIComponent(q)}`));
}

export interface Artist {
  id: string;
  slug: string;
  name: string;
  songCount: string; // e.g. "365 bài hát", as the source words it
}

const ARTIST_HREF = /\/artist\/(\d+)\/([a-z0-9-]+)/i;

export function parseArtistResults(html: string): Artist[] {
  const out: Artist[] = [];
  const seen = new Set<string>();
  for (const item of parse(html).querySelectorAll('a.artist-item')) {
    const m = item.getAttribute('href')?.match(ARTIST_HREF);
    if (!m || seen.has(m[1])) continue;
    seen.add(m[1]);
    const songCount = clean(item.querySelector('.artist-songs')?.text ?? '');
    const name = clean(item.text.replace(songCount, ''));
    if (name) out.push({ id: m[1], slug: m[2].toLowerCase(), name, songCount });
  }
  return out;
}

export interface ArtistSongs {
  name: string;
  results: SearchResult[];
  hasMore: boolean;
}

// An artist page lists their songs, most viewed first, ten to a page
export function parseArtistPage(html: string): ArtistSongs {
  const root = parse(html);
  return {
    name: clean(root.querySelector('#artist-info h2')?.text ?? ''),
    results: parseSearchResults(html),
    hasMore: !!root.querySelector('.pagination a[rel="next"]'),
  };
}

export async function searchArtists(query: string): Promise<Artist[]> {
  const q = query.trim().slice(0, 100);
  if (q.length < 2) return [];
  return parseArtistResults(await fetchHtml(`${SOURCE_BASE}/search?q=${encodeURIComponent(q)}&mode=artist`)).slice(0, 5);
}

export async function getArtistSongs(id: string, slug: string, offset = 0): Promise<ArtistSongs> {
  if (!/^\d{1,9}$/.test(id) || !/^[a-z0-9-]{1,120}$/i.test(slug)) throw new Error('Invalid artist reference');
  const off = Math.min(Math.max(Math.floor(offset) || 0, 0), 5000);
  return parseArtistPage(await fetchHtml(`${SOURCE_BASE}/artist/${id}/${slug}${off ? `?offset=${off}` : ''}`));
}

export interface Genre {
  id: string;
  slug: string;
  name: string;
}

const GENRE_HREF = /\/genre\/v\/(\d+)\/([a-z0-9_-]+)/i;

// A song page lists its genres in the "Thể loại" row of the details table
export function parseGenres(html: string): Genre[] {
  const th = parse(html)
    .querySelectorAll('th')
    .find((t) => clean(t.text).replace(/:$/, '') === 'Thể loại');
  const out: Genre[] = [];
  for (const a of th?.nextElementSibling?.querySelectorAll('a') ?? []) {
    const m = a.getAttribute('href')?.match(GENRE_HREF);
    const name = clean(a.text);
    if (m && name && !out.some((g) => g.id === m[1])) out.push({ id: m[1], slug: m[2], name });
  }
  return out;
}

export interface Related {
  genres: Genre[];
  candidates: SearchResult[]; // most popular first, the song's main genre ahead of its others
}

// Songs to suggest after this one: the most popular songs in its genre(s). A genre page lists
// songs most viewed first, ten to a page, in the same markup as search results.
export async function getRelated(id: string, slug: string): Promise<Related> {
  if (!/^\d{1,9}$/.test(id) || !/^[a-z0-9-]{1,120}$/i.test(slug)) throw new Error('Invalid song reference');
  const genres = parseGenres(await fetchHtml(`${SOURCE_BASE}/song/${id}/${slug}/`)).slice(0, 2);
  const pages = genres.flatMap((g, i) => (i === 0 ? [0, 10] : [0]).map((off) => ({ g, off })));
  const htmls = await Promise.all(
    pages.map(({ g, off }) => fetchHtml(`${SOURCE_BASE}/genre/v/${g.id}/${g.slug}${off ? `?offset=${off}` : ''}`).catch(() => '')),
  );
  const seen = new Set([id]);
  const candidates: SearchResult[] = [];
  for (const r of htmls.flatMap(parseSearchResults)) {
    if (seen.has(r.id)) continue;
    seen.add(r.id);
    candidates.push(r);
  }
  return { genres, candidates };
}

export async function getSong(id: string, slug: string): Promise<SongData> {
  // Only ever fetch a song page on the known host; reject anything shaped differently
  if (!/^\d{1,9}$/.test(id) || !/^[a-z0-9-]{1,120}$/i.test(slug)) throw new Error('Invalid song reference');
  return parseSong(await fetchHtml(`${SOURCE_BASE}/song/${id}/${slug}/`), id, slug);
}

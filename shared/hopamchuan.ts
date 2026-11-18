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

export async function getSong(id: string, slug: string): Promise<SongData> {
  // Only ever fetch a song page on the known host; reject anything shaped differently
  if (!/^\d{1,9}$/.test(id) || !/^[a-z0-9-]{1,120}$/i.test(slug)) throw new Error('Invalid song reference');
  return parseSong(await fetchHtml(`${SOURCE_BASE}/song/${id}/${slug}/`), id, slug);
}

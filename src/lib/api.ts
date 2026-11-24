import type { Artist, ArtistSongs, Related, SearchResult, SongData } from '../../shared/hopamchuan.ts';

export type { Artist, ArtistSongs, Related, SearchResult, SongData };

async function getJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(url, { signal });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `Request failed (${res.status})`);
  return body as T;
}

export const searchApi = (q: string, signal?: AbortSignal) =>
  getJson<{ results: SearchResult[] }>(`/api/search?q=${encodeURIComponent(q)}`, signal).then((r) => r.results);

export const artistsApi = (q: string, signal?: AbortSignal) =>
  getJson<{ artists: Artist[] }>(`/api/artists?q=${encodeURIComponent(q)}`, signal).then((r) => r.artists);

export const artistApi = (id: string, slug: string, offset = 0) =>
  getJson<ArtistSongs>(`/api/artist?id=${encodeURIComponent(id)}&slug=${encodeURIComponent(slug)}&offset=${offset}`);

export const relatedApi = (id: string, slug: string, signal?: AbortSignal) =>
  getJson<Related>(`/api/related?id=${encodeURIComponent(id)}&slug=${encodeURIComponent(slug)}`, signal);

export const songApi = (id: string, slug: string) =>
  getJson<SongData>(`/api/song?id=${encodeURIComponent(id)}&slug=${encodeURIComponent(slug)}`);

import type { SearchResult, SongData } from '../../shared/hopamchuan.ts';

export type { SearchResult, SongData };

async function getJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(url, { signal });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `Request failed (${res.status})`);
  return body as T;
}

export const searchApi = (q: string, signal?: AbortSignal) =>
  getJson<{ results: SearchResult[] }>(`/api/search?q=${encodeURIComponent(q)}`, signal).then((r) => r.results);

export const songApi = (id: string, slug: string) =>
  getJson<SongData>(`/api/song?id=${encodeURIComponent(id)}&slug=${encodeURIComponent(slug)}`);

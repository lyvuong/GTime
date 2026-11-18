// Request handler shared by the Cloudflare Worker and the Vite dev server.
import { getSong, searchSongs } from './hopamchuan.ts';

const json = (data: unknown, status = 200, cache = 'no-store') =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': cache },
  });

// Returns null for paths that aren't API routes so the caller can fall through to static assets
export async function handleApi(url: URL): Promise<Response | null> {
  try {
    if (url.pathname === '/api/search') {
      return json({ results: await searchSongs(url.searchParams.get('q') ?? '') });
    }
    if (url.pathname === '/api/song') {
      const song = await getSong(url.searchParams.get('id') ?? '', url.searchParams.get('slug') ?? '');
      return json(song);
    }
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : 'Request failed' }, 502);
  }
  return null;
}

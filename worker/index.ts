import { handleApi } from '../shared/api.ts';

interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
  GOOGLE_CLIENT_ID?: string; // set in Cloudflare (a secret or variable); not a secret itself, but kept out of the repo
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === '/api/config') {
      return Response.json({ googleClientId: (env.GOOGLE_CLIENT_ID ?? '').trim() }, { headers: { 'Cache-Control': 'no-store' } });
    }
    const api = await handleApi(url);
    return api ?? env.ASSETS.fetch(request);
  },
};

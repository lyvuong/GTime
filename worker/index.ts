import { handleApi } from '../shared/api.ts';

interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const api = await handleApi(new URL(request.url));
    return api ?? env.ASSETS.fetch(request);
  },
};

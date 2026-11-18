import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { handleApi } from './shared/api.ts';

// Serves /api/* from the same code the Cloudflare Worker runs, so `npm run dev` needs no wrangler
const devApi = (): Plugin => ({
  name: 'gtime-dev-api',
  apply: 'serve',
  configureServer(server) {
    server.middlewares.use(async (req, res, next) => {
      if (!req.url?.startsWith('/api/')) return next();
      const response = await handleApi(new URL(req.url, 'http://localhost'));
      if (!response) return next();
      res.statusCode = response.status;
      response.headers.forEach((v, k) => res.setHeader(k, v));
      res.end(await response.text());
    });
  },
});

export default defineConfig({
  plugins: [react(), devApi()],
});

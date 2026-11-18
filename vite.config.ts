import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { execSync } from 'node:child_process';
import packageJson from './package.json' with { type: 'json' };
import { handleApi } from './shared/api.ts';

// Version is "<major>.<minor>.<commit count>": package.json holds the base, git supplies the patch
const git = (args: string): string => {
  try {
    return execSync(`git ${args}`, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch {
    return '';
  }
};
const [major = '0', minor = '0'] = packageJson.version.split('.');
const appVersion = `${major}.${minor}.${git('rev-list --count HEAD') || '0'}`;

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
  define: {
    __APP_VERSION__: JSON.stringify(appVersion),
    __BUILD_DATE__: JSON.stringify(new Date().toISOString().split('T')[0]),
    __BUILD_HASH__: JSON.stringify(git('rev-parse --short HEAD')),
  },
});

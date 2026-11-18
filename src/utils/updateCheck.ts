import { APP_VERSION, BUILD_HASH } from './version';

export interface UpdateCheckResult {
  hasUpdate: boolean;
  latestVersion?: string;
}

// Reads the version manifest written at build time (see vite.config.ts). Cache-busted so it
// always reaches the network. In `npm run dev` there is no manifest, so this throws and the
// caller ignores it.
export async function checkForUpdate(): Promise<UpdateCheckResult> {
  const res = await fetch(`/version.json?_=${Date.now()}`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Version check failed (${res.status})`);
  const data = await res.json();
  const latestVersion: string | undefined = data.version;
  const latestBuildHash: string | undefined = data.buildHash;

  // The git commit is the precise signal; fall back to the version number without a hash
  if (BUILD_HASH && latestBuildHash) {
    return { hasUpdate: latestBuildHash !== BUILD_HASH, latestVersion };
  }
  return { hasUpdate: !!latestVersion && latestVersion !== APP_VERSION, latestVersion };
}

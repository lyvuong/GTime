// Backs the library up to the user's own Google Drive. Sign-in uses Google Identity Services with the narrow
// drive.file scope: the app can only see files it created itself, never the rest of the Drive.
// The OAuth Client ID is the app's, baked in at build time (VITE_GOOGLE_CLIENT_ID), with a pasted-in fallback.
export const DRIVE_FILE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
export const BACKUP_FILE_NAME = 'GTime-library.json';
const CLIENT_ID_KEY = 'gtime_google_client_id';

export function resolveClientId(): string {
  let saved = '';
  try {
    saved = localStorage.getItem(CLIENT_ID_KEY) ?? '';
  } catch {
    /* storage unavailable */
  }
  return (import.meta.env.VITE_GOOGLE_CLIENT_ID || saved).trim();
}

/** The Client ID set in Cloudflare (served by the Worker at /api/config), or the build-time or pasted-in one. */
let fromServer = '';
export async function loadClientId(): Promise<string> {
  if (!fromServer) {
    try {
      const r = await fetch('/api/config', { cache: 'no-store' });
      const c = r.ok ? await r.json() : null;
      if (typeof c?.googleClientId === 'string') fromServer = c.googleClientId.trim(); // an empty answer is not kept, so it is asked again
    } catch {
      /* offline or no Worker (local dev): fall back below */
    }
  }
  return fromServer || resolveClientId();
}

export const hasBuiltInClientId = (): boolean => Boolean(import.meta.env.VITE_GOOGLE_CLIENT_ID?.trim());

export function saveClientId(id: string): void {
  try {
    localStorage.setItem(CLIENT_ID_KEY, id.trim());
  } catch {
    /* storage unavailable */
  }
}

function loadGoogleScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    if ((window as any).google?.accounts?.oauth2) return resolve();
    const existing = document.querySelector('script[src="https://accounts.google.com/gsi/client"]');
    if (existing) {
      existing.addEventListener('load', () => resolve());
      existing.addEventListener('error', () => reject(new Error('Could not load Google sign-in.')));
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Could not load Google sign-in. Check your connection.'));
    document.body.appendChild(script);
  });
}

/** Asks the user to sign in to Google and returns a short-lived access token for their Drive. */
export async function requestAccessToken(clientId: string): Promise<string> {
  await loadGoogleScript();
  return new Promise((resolve, reject) => {
    const google = (window as any).google;
    if (!google?.accounts?.oauth2) return reject(new Error('Google sign-in did not load.'));
    const client = google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: DRIVE_FILE_SCOPE,
      callback: (r: any) => (r.error ? reject(new Error(r.error_description || r.error)) : resolve(r.access_token)),
      error_callback: (err: any) => reject(new Error(err?.message || `Google sign-in failed (${err?.type || 'unknown'})`)),
    });
    client.requestAccessToken({ prompt: '' });
  });
}

async function check(res: Response, what: string): Promise<Response> {
  if (!res.ok) throw new Error(`${what} failed (${res.status}). ${(await res.text()).slice(0, 200)}`);
  return res;
}

/** The backup file this app made earlier, newest first. Null if there is none. */
export async function findBackupFile(token: string): Promise<{ id: string; modifiedTime?: string } | null> {
  const q = encodeURIComponent(`name = '${BACKUP_FILE_NAME}' and trashed = false`);
  const res = await check(
    await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}&orderBy=modifiedTime desc&fields=files(id,modifiedTime)&pageSize=1`, {
      headers: { Authorization: `Bearer ${token}` },
    }),
    'Looking for the backup',
  );
  return (await res.json()).files?.[0] ?? null;
}

/** Saves the backup to Drive, replacing the earlier copy if there is one. */
export async function uploadBackup(token: string, text: string): Promise<void> {
  const existing = await findBackupFile(token);
  const boundary = `gtime-${Date.now().toString(36)}`;
  const metadata = existing ? { name: BACKUP_FILE_NAME } : { name: BACKUP_FILE_NAME, mimeType: 'application/json' };
  const body =
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n` +
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${text}\r\n` +
    `--${boundary}--`;
  const base = 'https://www.googleapis.com/upload/drive/v3/files';
  await check(
    await fetch(existing ? `${base}/${existing.id}?uploadType=multipart` : `${base}?uploadType=multipart`, {
      method: existing ? 'PATCH' : 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': `multipart/related; boundary=${boundary}` },
      body,
    }),
    'Saving the backup',
  );
}

/** The text of the backup in Drive, or null if none was saved yet. */
export async function downloadBackup(token: string): Promise<{ text: string; modifiedTime?: string } | null> {
  const file = await findBackupFile(token);
  if (!file) return null;
  const res = await check(await fetch(`https://www.googleapis.com/drive/v3/files/${file.id}?alt=media`, { headers: { Authorization: `Bearer ${token}` } }), 'Reading the backup');
  return { text: await res.text(), modifiedTime: file.modifiedTime };
}

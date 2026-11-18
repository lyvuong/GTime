import { useEffect, useRef, useState } from 'react';
import { CloudDownload, CloudUpload, Download, Loader2, Upload } from 'lucide-react';
import { exportBackup, importBackup, type ImportResult } from '../lib/backupStore';
import { downloadBackup, loadClientId, requestAccessToken, resolveClientId, saveClientId, uploadBackup } from '../lib/googleDrive';

const button = 'flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border border-stage-border font-semibold hover:bg-stage-cardHover disabled:opacity-50';

const describe = (r: ImportResult) =>
  `Imported ${r.added} new and ${r.updated} updated song${r.added + r.updated === 1 ? '' : 's'}${r.settings ? ', and your settings' : ''}.`;

/** Library backup to the user's own Google Drive (or to a file): songs, chord lengths, play counts and settings. */
export function LibraryBackup() {
  const input = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [clientId, setClientId] = useState(resolveClientId);
  const [fixed, setFixed] = useState(false); // the Client ID comes with the app, so there is nothing to paste
  useEffect(() => {
    loadClientId().then((id) => {
      if (id) {
        setClientId(id);
        setFixed(true);
      }
    });
  }, []);

  const run = async (work: () => Promise<string>) => {
    setBusy(true);
    setMessage(null);
    try {
      setMessage(await work());
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  };

  // Settings are read when the app starts, so reload once they have been restored
  const finish = (r: ImportResult) => {
    if (r.settings) setTimeout(() => window.location.reload(), 1500);
    return describe(r);
  };

  const toDrive = () =>
    run(async () => {
      const id = clientId || (await loadClientId());
      if (!id) throw new Error('Paste a Google OAuth Client ID first.');
      const token = await requestAccessToken(id);
      const { text, songs } = await exportBackup();
      await uploadBackup(token, text);
      return `Saved ${songs} song${songs === 1 ? '' : 's'} to your Google Drive as GTime-library.json.`;
    });

  const fromDrive = () =>
    run(async () => {
      const id = clientId || (await loadClientId());
      if (!id) throw new Error('Paste a Google OAuth Client ID first.');
      const token = await requestAccessToken(id);
      const found = await downloadBackup(token);
      if (!found) return 'No GTime backup found in your Google Drive yet. Use "Save to Drive" on the device that has your songs.';
      return finish(await importBackup(found.text));
    });

  const toFile = () =>
    run(async () => {
      const { blob, filename, songs } = await exportBackup();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
      return `Saved ${songs} song${songs === 1 ? '' : 's'} to ${filename}.`;
    });

  const fromFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // so the same file can be chosen again
    if (file) run(async () => finish(await importBackup(await file.text())));
  };

  return (
    <section aria-label="Library backup" className="mt-4 p-3 rounded-xl border border-stage-border bg-stage-card/60 text-xs">
      <h2 className="font-semibold uppercase tracking-wide text-stage-muted pb-2">Library backup</h2>
      <p className="text-stage-muted pb-2">
        Your songs, chord lengths, play counts and settings live only on this device. Save them to your own Google Drive to keep a copy or move them to
        another device. GTime can only see the one file it saves, never the rest of your Drive. Restoring adds to your library and replaces a song you
        already have.
      </p>
      {!fixed && (
        <label className="block pb-2 text-stage-muted">
          Google OAuth Client ID
          <input
            value={clientId}
            onChange={(e) => {
              setClientId(e.target.value);
              saveClientId(e.target.value);
            }}
            placeholder="1234567890-abc.apps.googleusercontent.com"
            className="mt-1 w-full px-2 py-1.5 rounded-lg bg-stage-bg border border-stage-border text-stage-text focus:outline-none focus:border-stage-accent"
          />
        </label>
      )}
      <div className="flex gap-2">
        <button onClick={toDrive} disabled={busy} className={button}>
          {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CloudUpload className="w-3.5 h-3.5" />} Save to Drive
        </button>
        <button onClick={fromDrive} disabled={busy} className={button}>
          <CloudDownload className="w-3.5 h-3.5" /> Restore from Drive
        </button>
      </div>
      <div className="flex gap-2 pt-2">
        <button onClick={toFile} disabled={busy} className={`${button} text-stage-muted`}>
          <Download className="w-3.5 h-3.5" /> Export to file
        </button>
        <button onClick={() => input.current?.click()} disabled={busy} className={`${button} text-stage-muted`}>
          <Upload className="w-3.5 h-3.5" /> Import from file
        </button>
        <input ref={input} type="file" accept=".json,application/json" onChange={fromFile} className="hidden" />
      </div>
      {message && (
        <p role="status" className="pt-2 text-stage-accent">
          {message}
        </p>
      )}
    </section>
  );
}

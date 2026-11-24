// Remembers which songs were shown today (opened, or offered as "Next") so a suggestion is not
// repeated within the same day. Kept in localStorage under one key per local date; old days are dropped.

const PREFIX = 'gtime_shown_';

export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
  key(index: number): string | null;
  readonly length: number;
}

/** The browser's localStorage, or an empty stand-in where reading it throws (blocked site data). */
export function browserStore(): KeyValueStore {
  try {
    return localStorage;
  } catch {
    return { getItem: () => null, setItem: () => {}, removeItem: () => {}, key: () => null, length: 0 };
  }
}

const dayKey = (now: Date) =>
  `${PREFIX}${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

export function loadShown(store: KeyValueStore, now = new Date()): Set<string> {
  try {
    const parsed = JSON.parse(store.getItem(dayKey(now)) ?? '[]');
    return new Set(Array.isArray(parsed) ? parsed.map(String) : []);
  } catch {
    return new Set();
  }
}

export function markShown(store: KeyValueStore, ids: string[], now = new Date()): void {
  try {
    const today = dayKey(now);
    const all = loadShown(store, now);
    for (const id of ids) all.add(id);
    store.setItem(today, JSON.stringify([...all].slice(-2000)));
    // Forget earlier days
    for (let i = store.length - 1; i >= 0; i--) {
      const k = store.key(i);
      if (k && k.startsWith(PREFIX) && k !== today) store.removeItem(k);
    }
  } catch {
    /* storage unavailable: suggestions simply may repeat */
  }
}

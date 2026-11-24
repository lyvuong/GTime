import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadShown, markShown, type KeyValueStore } from './shownToday.ts';

function fakeStore(): KeyValueStore {
  const m = new Map<string, string>();
  return {
    getItem: (k) => m.get(k) ?? null,
    setItem: (k, v) => void m.set(k, v),
    removeItem: (k) => void m.delete(k),
    key: (i) => [...m.keys()][i] ?? null,
    get length() {
      return m.size;
    },
  };
}

test('songs marked shown are remembered for the rest of the day', () => {
  const s = fakeStore();
  markShown(s, ['1', '2'], new Date(2026, 10, 24, 9));
  markShown(s, ['2', '3'], new Date(2026, 10, 24, 22));
  assert.deepEqual([...loadShown(s, new Date(2026, 10, 24, 23))].sort(), ['1', '2', '3']);
});

test('a new day starts empty and drops the old day', () => {
  const s = fakeStore();
  markShown(s, ['1'], new Date(2026, 10, 24));
  assert.equal(loadShown(s, new Date(2026, 10, 25)).size, 0);
  markShown(s, ['9'], new Date(2026, 10, 25));
  assert.equal(s.length, 1);
});

test('corrupt stored data is treated as nothing shown', () => {
  const s = fakeStore();
  s.setItem('gtime_shown_2026-11-24', '{not json');
  assert.equal(loadShown(s, new Date(2026, 10, 24)).size, 0);
});

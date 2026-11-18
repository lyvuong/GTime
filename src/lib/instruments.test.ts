import { test } from 'node:test';
import assert from 'node:assert/strict';
import { INSTRUMENTS, noteSeconds, renderNote } from './instruments.ts';
import { detectPitch } from './pitch.ts';

const RATE = 44100;

test('every voice renders a finite, audible note that ends on silence', () => {
  for (const { id } of INSTRUMENTS) {
    const seconds = noteSeconds(id, 90, 4, 8);
    const w = renderNote(id, 220, RATE, seconds);
    assert.ok(w.length > 1000, id);
    assert.ok(w.every(Number.isFinite), id);
    assert.ok(Math.max(...w.map(Math.abs)) > 0.3, `${id} is audible`);
    assert.ok(Math.abs(w[w.length - 1]) < 1e-3, `${id} ends quietly`);
  }
});

test('the other voices sound the pitch that was asked for', () => {
  for (const id of ['strings', 'brass', 'synth', 'piano'] as const) {
    for (const freq of [110, 196, 330]) {
      const w = renderNote(id, freq, RATE, 1.2);
      const got = detectPitch(w.slice(Math.floor(RATE * 0.25), Math.floor(RATE * 0.25) + 8192), RATE, freq * (id === 'synth' ? 0.4 : 0.7), freq * 1.4);
      assert.ok(got !== null && (Math.abs(1200 * Math.log2(got / freq)) < 30 || (id === 'synth' && Math.abs(1200 * Math.log2(got / (freq / 2))) < 30)), `${id} ${freq} Hz heard as ${got}`);
    }
  }
});

test('strings are held for the bar, brass and synth are short', () => {
  const bar = (60 / 90) * 4;
  assert.ok(noteSeconds('strings', 90, 4, 8) >= bar);
  assert.ok(noteSeconds('brass', 90, 4, 8) < noteSeconds('strings', 90, 4, 8) / 2);
  assert.ok(noteSeconds('synth', 90, 4, 8) < bar);
});

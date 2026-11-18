import { test } from 'node:test';
import assert from 'node:assert/strict';
import { snapTempo, stepTempo, TEMPOS } from './tempo.ts';
import { PATTERNS } from './patterns.ts';

test('tempo settings are ascending and cover every style\'s starting tempo', () => {
  assert.ok(TEMPOS.every((t, i) => i === 0 || t > TEMPOS[i - 1]));
  for (const p of PATTERNS) assert.ok(Math.abs(snapTempo(p.bpm) - p.bpm) <= 2, `${p.id} at ${p.bpm} bpm`);
});

test('snapTempo picks the nearest setting and clamps to the range', () => {
  assert.equal(snapTempo(72), 72);
  assert.equal(snapTempo(70), 69);
  assert.equal(snapTempo(110), 108);
  assert.equal(snapTempo(10), 40);
  assert.equal(snapTempo(500), 160);
});

test('stepTempo moves one setting at a time and stops at the ends', () => {
  assert.equal(stepTempo(60, 1), 63);
  assert.equal(stepTempo(63, -1), 60);
  assert.equal(stepTempo(70, 1), 72, 'an in-between tempo first snaps, then steps');
  assert.equal(stepTempo(40, -1), 40);
  assert.equal(stepTempo(160, 1), 160);
});

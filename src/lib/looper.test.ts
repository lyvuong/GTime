import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyFades, layerOffset, nextBoundary } from './looper.ts';

test('nextBoundary lands on the next pass of the loop', () => {
  assert.equal(nextBoundary(10, 10.5, 2), 12);
  assert.equal(nextBoundary(10, 12.5, 2), 14);
});

test('nextBoundary skips a pass that is too close to arm in time', () => {
  assert.ok(Math.abs(nextBoundary(10, 11.99, 2) - 14) < 1e-9);
  assert.equal(nextBoundary(10, 9, 2), 10); // before the loop starts: its first pass
});

test('layerOffset wraps into the loop', () => {
  assert.ok(Math.abs(layerOffset(10, 13.5, 2) - 1.5) < 1e-9);
  assert.equal(layerOffset(10, 12, 2), 0);
  assert.ok(Math.abs(layerOffset(10, 9.5, 2) - 1.5) < 1e-9);
});

test('applyFades silences the ends and leaves the middle', () => {
  const data = new Float32Array(1000).fill(1);
  applyFades(data, 1000, 0.1);
  assert.equal(data[0], 0);
  assert.equal(data[999], 0);
  assert.equal(data[500], 1);
  assert.ok(data[50] > 0 && data[50] < 1);
});

test('applyFades copes with a take shorter than the fade', () => {
  const data = new Float32Array(4).fill(1);
  assert.doesNotThrow(() => applyFades(data, 48000));
});

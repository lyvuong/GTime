import test from 'node:test';
import assert from 'node:assert/strict';
import { stripSourceLine } from './sourceLine.ts';

test('removes the trailing Source comment', () => {
  const text = '{title: A}\n\n[G]Hello\n\n{comment: Source: https://hopamchuan.com/song/1/a/}\n';
  assert.equal(stripSourceLine(text), '{title: A}\n\n[G]Hello\n');
});

test('leaves songs without a Source line unchanged', () => {
  const text = '{title: A}\n\n[G]Hello\n';
  assert.equal(stripSourceLine(text), text);
});

test('keeps other comments, even ones that mention a source', () => {
  const text = '{title: A}\n{comment: Intro}\n[G]Hello\n{comment: Source of the song is old}\n';
  assert.equal(stripSourceLine(text), text);
});

test('handles Windows line endings', () => {
  const text = '{title: A}\r\n\r\n[G]Hello\r\n\r\n{comment: Source: https://x.test/}\r\n';
  assert.equal(stripSourceLine(text), '{title: A}\r\n\r\n[G]Hello\n');
});

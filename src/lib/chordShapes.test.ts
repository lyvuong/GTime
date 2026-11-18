import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chordShape, normalizeQuality, OPEN_STRINGS } from './chordShapes.ts';

test('open and barre shapes come out as a guitarist would play them', () => {
  assert.deepEqual(chordShape('C'), [-1, 3, 2, 0, 1, 0]);
  assert.deepEqual(chordShape('Am'), [-1, 0, 2, 2, 1, 0]);
  assert.deepEqual(chordShape('Em7'), [0, 2, 0, 0, 0, 0]);
  assert.deepEqual(chordShape('F'), [1, 3, 3, 2, 1, 1]);
  assert.deepEqual(chordShape('F#m'), [2, 4, 4, 2, 2, 2]);
  assert.deepEqual(chordShape('Bm'), [-1, 2, 4, 4, 3, 2]);
  assert.deepEqual(chordShape('Bb'), [-1, 1, 3, 3, 3, 1]);
  assert.deepEqual(chordShape('G/B'), chordShape('G'), 'the bass note is ignored');
});

test('quality spellings map onto known shapes', () => {
  for (const [q, want] of [['', ''], ['m', 'm'], ['min', 'm'], ['m6', 'm'], ['m7', 'm7'], ['m9', 'm7'], ['maj7', 'maj7'], ['M7', 'maj7'], ['7', '7'], ['9', '7'], ['sus4', 'sus4'], ['sus', 'sus4'], ['sus2', 'sus2'], ['dim7', 'dim'], ['6', '6'], ['add9', 'add9'], ['5', ''], ['aug', '']] as const) {
    assert.equal(normalizeQuality(q), want, q);
  }
});

// Every shape must sound the right notes: the lowest string is the root and nothing else sneaks in
const ALLOWED: Record<string, number[]> = {
  '': [0, 4, 7], m: [0, 3, 7], '7': [0, 4, 7, 10], m7: [0, 3, 7, 10], maj7: [0, 4, 7, 11],
  sus4: [0, 5, 7], sus2: [0, 2, 7], dim: [0, 3, 6, 9], '6': [0, 4, 7, 9], add9: [0, 2, 4, 7],
};
test('every chord in every key sounds only its own notes, with the root lowest', () => {
  const roots = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
  for (const [ri, root] of roots.entries()) {
    for (const [q, allowed] of Object.entries(ALLOWED)) {
      const name = `${root}${q}`;
      const shape = chordShape(name);
      assert.ok(shape, `no shape for ${name}`);
      const notes = shape.map((f, s) => (f < 0 ? null : OPEN_STRINGS[s] + f)).filter((n): n is number => n !== null);
      assert.ok(notes.length >= 4, `${name} plays only ${notes.length} strings`);
      assert.equal(((notes[0] - ri) % 12 + 12) % 12, 0, `${name}: lowest note is not the root`);
      for (const n of notes) {
        const pc = (((n - ri) % 12) + 12) % 12;
        assert.ok(allowed.includes(pc), `${name}: ${pc} semitones above the root does not belong`);
      }
    }
  }
});

test('things that are not chords have no shape', () => {
  assert.equal(chordShape('N.C.'), null);
  assert.equal(chordShape(''), null);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chordShape, OPEN_STRINGS } from './chordShapes.ts';
import { fillNotes, guessKey, type FillContext, type FillStyle } from './fills.ts';

const ctx = (chord: string, next: string | null, bar = 0, slots = 2, key = guessKey([chord, next ?? chord])): FillContext => ({
  chord, next, shape: chordShape(chord)!, nextShape: next ? chordShape(next) : null, key, slots, bar,
});
const pitches = (notes: { string: number; fret: number }[]) => notes.map((n) => OPEN_STRINGS[n.string] + n.fret);

test('guessKey finds the key from the chords, and the home chord settles major against relative minor', () => {
  assert.deepEqual(guessKey(['C', 'Am', 'F', 'G']), { root: 0, minor: false });
  assert.deepEqual(guessKey(['Am', 'F', 'C', 'G']), { root: 9, minor: true });
  assert.deepEqual(guessKey(['Bm', 'F#m', 'G', 'F#m', 'Bm', 'Em', 'A', 'D']), { root: 11, minor: true });
  assert.deepEqual(guessKey(['G', 'C', 'D', 'Em']), { root: 7, minor: false });
  assert.deepEqual(guessKey([]), { root: 0, minor: false });
});

test('a key written on the sheet breaks a tie', () => {
  assert.equal(guessKey(['C', 'Am'], 'Am').minor, true);
  assert.equal(guessKey(['C', 'Am'], 'C').minor, false);
});

test('bass run walks through the key from one bass note to the next', () => {
  const key = { root: 0, minor: false };
  assert.deepEqual(pitches(fillNotes('bass-run', ctx('G', 'C', 0, 2, key))), [45, 47], 'G up to C: A, B');
  assert.deepEqual(pitches(fillNotes('bass-run', ctx('C', 'G', 0, 2, key))), [47, 45], 'C down to G: B, A');
  assert.deepEqual(pitches(fillNotes('bass-run', ctx('C', 'Am', 0, 2, key))), [47], 'only one note lies between C and A');
  // triplet bars have three slots, so a longer walk can use all of them
  assert.equal(fillNotes('bass-run', ctx('C', 'G', 0, 3, key)).length, 2);
  assert.equal(fillNotes('bass-run', ctx('C', 'C', 0, 2, key)).length, 0, 'the same bass note needs no run');
  assert.equal(fillNotes('bass-run', ctx('C', null)).length, 0);
});

test('approach note is one half step away from the next bass note, on the side you come from', () => {
  assert.deepEqual(pitches(fillNotes('approach', ctx('G', 'C'))), [47], 'from below when going up');
  assert.deepEqual(pitches(fillNotes('approach', ctx('C', 'G'))), [44], 'from above when going down');
  assert.deepEqual(fillNotes('approach', ctx('C', 'C')), []);
});

test('chord hammer moves the chord\'s third and returns to it', () => {
  assert.deepEqual(fillNotes('hammer', ctx('D', 'G')), [{ string: 5, fret: 3 }, { string: 5, fret: 2 }], 'F# to G on the high string (sus4)');
  assert.deepEqual(fillNotes('hammer', ctx('Am', 'G')), [{ string: 4, fret: 0 }, { string: 4, fret: 1 }], 'C to B on the B string (sus2)');
  assert.deepEqual(fillNotes('hammer', ctx('Dsus4', 'G')), [], 'a sus chord has no third to move');
  assert.equal(fillNotes('hammer', ctx('D', null)).length, 2, 'it does not need a next chord');
});

test('melodic lick stays in the pentatonic scale, moves one way, and alternates direction by bar', () => {
  const key = { root: 0, minor: false };
  const pent = [0, 2, 4, 7, 9];
  for (const bar of [0, 1]) {
    const notes = pitches(fillNotes('lick', ctx('G', 'Am', bar, 2, key)));
    assert.equal(notes.length, 2);
    for (const n of notes) assert.ok(pent.includes(((n % 12) + 12) % 12), `${n} is not in C major pentatonic`);
    assert.ok(bar % 2 === 0 ? notes[0] > notes[1] : notes[0] < notes[1], `bar ${bar} direction`);
  }
  assert.equal(fillNotes('lick', ctx('G', 'Am', 0, 3, key)).length, 3);
  assert.deepEqual(fillNotes('lick', ctx('G', null)), []);
});

test('every style gives playable notes for every pair of chords in every key', () => {
  const styles: FillStyle[] = ['bass-run', 'approach', 'hammer', 'lick'];
  const diatonic = ['', 'm', 'm', '', '', 'm', 'dim'];
  const offsets = [0, 2, 4, 5, 7, 9, 11];
  const names = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
  for (let k = 0; k < 12; k++) {
    const chords = offsets.map((o, i) => `${names[(k + o) % 12]}${diatonic[i]}`);
    const key = { root: k, minor: false };
    for (const a of chords) {
      for (const b of chords) {
        for (const style of styles) {
          for (const bar of [0, 1]) {
            for (const slots of [2, 3]) {
              const notes = fillNotes(style, ctx(a, b, bar, slots, key));
              assert.ok(notes.length <= 3, `${style} ${a}>${b}`);
              for (const n of notes) {
                assert.ok(n.string >= 0 && n.string <= 5 && n.fret >= 0 && n.fret <= 15, `${style} ${a}>${b}: string ${n.string} fret ${n.fret}`);
              }
            }
          }
        }
      }
    }
  }
});

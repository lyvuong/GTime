// Fingerpicked versions of the rhythms: the same feel, the same slots and the same accents, but the thumb plays the
// bass (the root, then the fifth) and the fingers pluck the chord, so there is no strumming at all. They sit on the
// same grid as the strum, so the drums, bass and fills lock in unchanged.
//   B = thumb on the root   F = thumb on the fifth   P = pinch (bass and top string together)
//   Q = pluck (the top three strings together)       A / M1 / M2 / T = single strings, as in the picked patterns
import type { Pattern, Token } from './patterns.ts';

const PICKED: Record<string, (Token | null)[]> = {
  bolero: ['B', null, 'Q', 'M2', 'F', null, 'Q', 'M2'],
  rumba: ['P', null, 'Q', 'T', 'F', null, 'Q', 'T'],
  'bossa-nova': ['B', 'Q', null, 'Q', 'F', null, null, 'Q'],
  ballad: ['B', 'M2', 'M1', 'M2', 'F', 'M2', 'M1', 'M2'],
  'cha-cha': ['B', null, 'Q', null, 'Q', null, 'Q', 'T'],
  tango: ['B', null, 'Q', null, 'F', null, 'Q', null],
  'tango-sync': ['B', null, null, 'Q', null, null, 'Q', null],
  'pop-strum': ['B', null, 'Q', 'T', null, 'M2', 'F', 'T'],
  'steady-strum': ['B', 'T', 'M1', 'T', 'F', 'T', 'M1', 'T'],
  'down-strum': ['B', null, 'Q', null, 'F', null, 'Q', null],
  'slow-rock': ['B', 'M1', 'M2', 'T', 'M2', 'M1', 'F', 'M1', 'M2', 'T', 'M2', 'M1'],
  blues: ['B', null, 'Q', 'F', null, 'Q', 'B', null, 'Q', 'F', null, 'Q'],
  valse: ['B', null, 'Q', null, 'Q', null],
  boston: ['B', null, 'Q', 'T', 'Q', 'T'],
};

/** Whether a rhythm has a fingerpicked version. */
export const hasPicked = (pattern: Pattern) => pattern.kind === 'strum' && pattern.id in PICKED;

/** The rhythm played by fingers instead of a strum (the same pattern when it has no picked version). */
export function pickedVersion(pattern: Pattern): Pattern {
  const steps = PICKED[pattern.id];
  return steps && pattern.kind === 'strum' ? { ...pattern, steps, picked: true } : pattern;
}

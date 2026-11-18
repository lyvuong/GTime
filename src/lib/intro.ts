// Suggests ways to start a song, working only from its chord progression (no audio, no AI).
// It runs on the song as shown, so suggestions follow transposition.
import type { ParsedSong } from './chordParser.ts';
import { transposeNote } from './chordTransposer.ts';

export interface IntroOption {
  id: 'original' | 'loop' | 'turnaround' | 'hook';
  label: string;
  note: string;
  chords: string[];
  repeat: number; // how many times to play `chords`
}

interface Block {
  chords: string[];
  fromIntroNote: boolean;
}

const ROOT = /^([A-G][#b]?)/;
const rootOf = (chord: string) => chord.match(ROOT)?.[1] ?? '';
const isMinor = (chord: string) => /^[A-G][#b]?m(?!aj)/i.test(chord);
const SEMI: Record<string, number> = { C: 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4, F: 5, 'F#': 6, Gb: 6, G: 7, 'G#': 8, Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11 };
const semi = (chord: string) => SEMI[rootOf(chord)];

/** Splits the song into blocks of chords: one per blank-line-separated group, with a source "Intro" note kept apart. */
function toBlocks(song: ParsedSong): Block[] {
  const blocks: Block[] = [];
  let cur: Block | null = null;
  const close = () => {
    if (cur && cur.chords.length) blocks.push(cur);
    cur = null;
  };
  for (const section of song.sections) {
    close();
    for (const line of section.lines) {
      if (line.type === 'comment') {
        if (/^intro\b/i.test(line.commentText ?? '')) {
          close();
          cur = { chords: [], fromIntroNote: true };
        }
      } else if (line.type === 'empty') {
        close();
      } else if (line.tokens) {
        for (const t of line.tokens) {
          const c = t.chord ?? t.originalChord;
          if (!c) continue;
          cur ??= { chords: [], fromIntroNote: false };
          if (cur.chords[cur.chords.length - 1] !== c) cur.chords.push(c);
        }
      }
    }
  }
  close();
  return blocks;
}

/** The shortest chord cycle (2 to 8 chords) that most of the sequence follows, if any. */
export function findLoop(full: string[]): string[] | null {
  // Only the opening stretch counts: the later lines of a block often leave the loop
  const seq = full.slice(0, 16);
  for (let p = 2; p <= Math.min(8, Math.floor(seq.length / 2)); p++) {
    let hits = 0;
    for (let i = p; i < seq.length; i++) if (seq[i] === seq[i - p]) hits++;
    if (hits / (seq.length - p) >= 0.8) return seq.slice(0, p);
  }
  return null;
}

/** The note the song resolves to: the listed key (unless a capo makes it differ from the shapes), else the last chord. */
function tonicOf(song: ParsedSong, last: string): { root: string; minor: boolean } {
  const key = song.metadata.key;
  if (key && !song.metadata.capo && ROOT.test(key)) return { root: rootOf(key), minor: isMinor(key) };
  return { root: rootOf(last), minor: isMinor(last) };
}

const sameChords = (a: string[], b: string[]) => a.length === b.length && a.every((c, i) => c === b[i]);

export function suggestIntros(song: ParsedSong): IntroOption[] {
  const blocks = toBlocks(song);
  const options: IntroOption[] = [];

  const original = blocks.find((b) => b.fromIntroNote);
  if (original) {
    options.push({ id: 'original', label: 'From the source', note: 'The intro written on the original chord sheet.', chords: original.chords, repeat: 1 });
  }

  const body = blocks.filter((b) => !b.fromIntroNote);
  const verseIndex = body.findIndex((b) => b.chords.length >= 3);
  if (verseIndex < 0) return options;
  const verse = body[verseIndex].chords;

  const loop = findLoop(verse) ?? verse.slice(0, Math.min(4, verse.length));
  const clearLoop = findLoop(verse) !== null;
  options.push({
    id: 'loop',
    label: 'Verse loop',
    note: clearLoop ? 'The verse progression, played twice before you start singing.' : 'No clear repeating pattern, so this is how the song opens. Play it once.',
    chords: loop,
    repeat: clearLoop ? 2 : 1,
  });

  // Loop, then the dominant chord (V) so the intro leans into the first chord of the verse
  const all = body.flatMap((b) => b.chords);
  const tonic = tonicOf(song, all[all.length - 1]);
  const tonicSemi = SEMI[tonic.root];
  if (tonicSemi !== undefined && semi(loop[0]) === tonicSemi) {
    const flats = tonic.root.includes('b') || ['F'].includes(tonic.root);
    const v = transposeNote(tonic.root, 7, flats);
    if (semi(loop[loop.length - 1]) !== SEMI[v]) {
      options.push({
        id: 'turnaround',
        label: 'Turnaround',
        note: `The loop, ending on ${v} (the V chord) so it pulls back to ${tonic.root}${tonic.minor ? 'm' : ''} where the verse starts.`,
        chords: [...loop, v],
        repeat: 1,
      });
    }
  }

  // The tail of the first different-sounding section (usually the chorus) makes a catchy hook
  const other = body.slice(verseIndex + 1).find((b) => b.chords.length >= 3 && !sameChords(b.chords, verse));
  if (other) {
    const hook = other.chords.slice(-Math.min(4, other.chords.length));
    if (!sameChords(hook, loop)) {
      options.push({ id: 'hook', label: 'Chorus hook', note: 'The closing chords of the chorus, a familiar way to open.', chords: hook, repeat: 1 });
    }
  }
  return options;
}

import { useMemo, useState } from 'react';
import type { FillStyle, FillWhere } from './fills';
import { patternsFor, type Pattern } from './patterns';
import { snapTempo } from './tempo';

// The rhythm, fill and tempo you have chosen. The intro and the play-along track share one of these,
// so "the selected rhythm" means the same thing in both. The rhythm and fill are remembered on this device.

const KEYS = { pattern: 'gtime_rhythm', fill: 'gtime_fill', where: 'gtime_fill_where' };
const FILL_STYLES: FillStyle[] = ['none', 'bass-run', 'approach', 'hammer', 'lick'];

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null; // storage unavailable
  }
}
function write(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* storage unavailable */
  }
}

export interface Rhythm {
  patterns: Pattern[]; // every pattern, those that fit the song's time signature first
  pattern: Pattern;
  bpm: number;
  setPattern: (id: string) => void; // also returns the tempo to the style's own
  setBpm: (bpm: number) => void;
  fillStyle: FillStyle;
  setFillStyle: (style: FillStyle) => void;
  fillWhere: FillWhere;
  setFillWhere: (where: FillWhere) => void;
}

export function useRhythm(time?: string): Rhythm {
  const [patternId, setPatternId] = useState<string | null>(() => read(KEYS.pattern));
  const [bpmOverride, setBpmOverride] = useState<number | null>(null); // null = the style's own tempo
  const [fillStyle, setFillStyleState] = useState<FillStyle>(() => {
    const saved = read(KEYS.fill) as FillStyle | null;
    return saved && FILL_STYLES.includes(saved) ? saved : 'none';
  });
  const [fillWhere, setFillWhereState] = useState<FillWhere>(() => (read(KEYS.where) === 'every' ? 'every' : 'end'));

  const patterns = useMemo(() => patternsFor(time), [time]);
  const pattern = patterns.find((p) => p.id === patternId) ?? patterns[0];

  return {
    patterns,
    pattern,
    bpm: snapTempo(bpmOverride ?? pattern.bpm),
    setPattern: (id) => {
      setPatternId(id);
      setBpmOverride(null);
      write(KEYS.pattern, id);
    },
    setBpm: (bpm) => setBpmOverride(bpm),
    fillStyle,
    setFillStyle: (style) => {
      setFillStyleState(style);
      write(KEYS.fill, style);
    },
    fillWhere,
    setFillWhere: (where) => {
      setFillWhereState(where);
      write(KEYS.where, where);
    },
  };
}

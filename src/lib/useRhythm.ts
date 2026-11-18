import { useMemo, useState } from 'react';
import { DRUM_LEVELS, type DrumLevel } from './drums';
import { INSTRUMENTS, type Instrument } from './instruments';
import type { FillStyle, FillWhere } from './fills';
import type { SongFillWhere } from './songPhrase';
import { patternsFor, type Pattern } from './patterns';
import { snapTempo } from './tempo';

// The rhythm and tempo you have chosen apply to the whole song, intro included. Fills are chosen separately:
// the intro's fill is a short flourish, the song's fill is longer and goes where the singer rests.
// Everything is remembered on this device.

const KEYS = { pattern: 'gtime_rhythm', fill: 'gtime_fill', where: 'gtime_fill_where', songFill: 'gtime_song_fill', songWhere: 'gtime_song_fill_where', drums: 'gtime_drums', instrument: 'gtime_instrument', drumsBack: 'gtime_drums_last' };
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
  fillStyle: FillStyle; // the intro's fill
  setFillStyle: (style: FillStyle) => void;
  fillWhere: FillWhere;
  setFillWhere: (where: FillWhere) => void;
  instrument: Instrument; // the sound the notes are played with
  setInstrument: (instrument: Instrument) => void;
  drums: DrumLevel; // a drum part under the intro and the song
  setDrums: (level: DrumLevel) => void;
  toggleDrums: () => void; // off, or back to the level used last
  songFill: FillStyle; // the song's fill
  setSongFill: (style: FillStyle) => void;
  songFillWhere: SongFillWhere;
  setSongFillWhere: (where: SongFillWhere) => void;
}

export function useRhythm(time?: string): Rhythm {
  const [patternId, setPatternId] = useState<string | null>(() => read(KEYS.pattern));
  const [bpmOverride, setBpmOverride] = useState<number | null>(null); // null = the style's own tempo
  const [fillStyle, setFillStyleState] = useState<FillStyle>(() => {
    const saved = read(KEYS.fill) as FillStyle | null;
    return saved && FILL_STYLES.includes(saved) ? saved : 'none';
  });
  const [fillWhere, setFillWhereState] = useState<FillWhere>(() => (read(KEYS.where) === 'every' ? 'every' : 'end'));

  const [songFill, setSongFillState] = useState<FillStyle>(() => {
    const saved = read(KEYS.songFill) as FillStyle | null;
    return saved && FILL_STYLES.includes(saved) ? saved : 'bass-run';
  });
  const [songFillWhere, setSongFillWhereState] = useState<SongFillWhere>(() => {
    const saved = read(KEYS.songWhere);
    return saved === 'end' || saved === 'every' ? saved : 'line';
  });

  const [instrument, setInstrumentState] = useState<Instrument>(() => {
    const saved = read(KEYS.instrument);
    return INSTRUMENTS.some((i) => i.id === saved) ? (saved as Instrument) : 'guitar';
  });
  const [drums, setDrumsState] = useState<DrumLevel>(() => {
    const saved = read(KEYS.drums) as DrumLevel | null;
    return saved && DRUM_LEVELS.includes(saved) ? saved : 'off';
  });

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
    instrument,
    setInstrument: (id) => {
      setInstrumentState(id);
      write(KEYS.instrument, id);
    },
    drums,
    setDrums: (level) => {
      setDrumsState(level);
      write(KEYS.drums, level);
      if (level !== 'off') write(KEYS.drumsBack, level);
    },
    toggleDrums: () => {
      const back = read(KEYS.drumsBack) === 'full' ? 'full' : 'light';
      const next: DrumLevel = drums === 'off' ? back : 'off';
      setDrumsState(next);
      write(KEYS.drums, next);
    },
    songFill,
    setSongFill: (style) => {
      setSongFillState(style);
      write(KEYS.songFill, style);
    },
    songFillWhere,
    setSongFillWhere: (where) => {
      setSongFillWhereState(where);
      write(KEYS.songWhere, where);
    },
  };
}

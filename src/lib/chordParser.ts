import { transposeChord } from './chordTransposer.ts';

export interface ChordToken {
  type: 'chord_lyric';
  chord?: string; // Transposed or original chord
  originalChord?: string;
  lyric: string; // The lyric text aligned directly below this chord
}

export interface SongLine {
  type: 'lyric_line' | 'comment' | 'empty' | 'section_header';
  tokens?: ChordToken[];
  commentText?: string;
  headerText?: string;
  hasChords?: boolean;
}

// A chord grid ({start_of_grid}): rows of bars, each bar a row of beats. A beat is a chord, or a hold that
// carries the chord before it on.
export interface GridBeat {
  chords: string[]; // more than one when beats are joined with "~", which share the beat
  originalChords: string[];
  hold: boolean;
}
export interface GridMeasure {
  beats: GridBeat[];
}
export interface SongGrid {
  rows: GridMeasure[][];
}

export interface SongSection {
  type: 'verse' | 'chorus' | 'bridge' | 'intro' | 'outro' | 'solo' | 'general';
  title?: string;
  lines: SongLine[];
  grid?: SongGrid; // set for a grid section, which has no lyric lines
}

export interface SongMetadata {
  title: string;
  subtitle?: string;
  artist?: string;
  key?: string;
  capo?: number;
  tempo?: string;
  time?: string;
  style?: string;
  tags?: string[];
  originalKey?: string;
  duration?: string;
  ccli?: string;
}

export interface ParsedSong {
  metadata: SongMetadata;
  sections: SongSection[];
  rawText: string;
  allChords: string[];
}

const BARLINE = /(\|\|:?|\|:|:\|:?|\|\.|\|\d+|\|)/;
const IS_BARLINE = /^(\|\|:?|\|:|:\|:?|\|\.|\|\d+|\|)$/;

/**
 * Reads the lines of a grid: bars between barlines, a beat to each word. "." (or "/") holds the chord before,
 * "A~B" puts two chords in one beat, "%" repeats the bar before and "%%" the bar two back. A part between
 * "|:" and ":|" is written out twice, so playing and drawing need no special case for repeats.
 */
export function parseGrid(lines: string[]): { grid: SongGrid; chords: string[] } {
  const rows: GridMeasure[][] = [];
  const all: GridMeasure[] = []; // every bar so far, for repeats
  const chords = new Set<string>();
  let repeatFrom = 0;

  for (const raw of lines) {
    const line = raw.trim();
    if (!line.includes('|')) continue;
    const row: GridMeasure[] = [];
    const add = (m: GridMeasure) => {
      row.push(m);
      all.push(m);
    };
    for (const part of line.split(BARLINE)) {
      const text = part.trim();
      if (!text) continue;
      if (IS_BARLINE.test(text)) {
        if (text.startsWith(':')) for (const m of all.slice(repeatFrom)) add(m); // the repeat: play the part again
        if (text.endsWith(':')) repeatFrom = all.length; // "|:" or ":|:" opens the next repeat
        continue;
      }
      const words = text.split(/\s+/);
      if (words.length === 1 && (words[0] === '%' || words[0] === '%%')) {
        const back = all[all.length - words[0].length];
        if (back) add(back);
        continue;
      }
      add({
        beats: words.map((w) => {
          if (w === '.' || w === '/' || w === '_') return { chords: [], originalChords: [], hold: true };
          const each = w.split('~').filter(Boolean);
          each.forEach((c) => chords.add(c));
          return { chords: each, originalChords: each, hold: false };
        }),
      });
    }
    if (row.length) rows.push(row);
  }
  return { grid: { rows }, chords: [...chords] };
}

/** A grid's label tells what kind of section it is: "Verse 1", "Điệp khúc", "Bridge", "Outro / Gian Tấu". */
function sectionTypeOf(label: string): SongSection['type'] {
  const l = label.toLowerCase();
  if (/chorus|điệp|diep/.test(l)) return 'chorus';
  if (/bridge/.test(l)) return 'bridge';
  if (/intro|dạo đầu/.test(l)) return 'intro';
  if (/outro|gian tấu|giang tau/.test(l)) return 'outro';
  if (/solo/.test(l)) return 'solo';
  if (/verse|bài|khổ/.test(l)) return 'verse';
  return 'general';
}

// Parses raw ChordPro text into a structured AST
export function parseChordPro(text: string): ParsedSong {
  const lines = text.split(/\r?\n/);
  
  const metadata: SongMetadata = {
    title: 'Untitled Song',
  };

  const sections: SongSection[] = [];
  let currentSection: SongSection = {
    type: 'general',
    lines: [],
  };

  const allChordsSet = new Set<string>();

  // A grid section: its lines are collected until {end_of_grid}, then read as bars
  let gridLines: string[] | null = null;
  let gridLabel = 'Grid';
  const finishGrid = () => {
    if (gridLines === null) return;
    const { grid, chords } = parseGrid(gridLines);
    chords.forEach((c) => allChordsSet.add(c));
    sections.push({ type: sectionTypeOf(gridLabel), title: gridLabel, lines: [], grid });
    currentSection = { type: 'general', lines: [] };
    gridLines = null;
  };

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    const trimmed = rawLine.trim();

    if (gridLines !== null) {
      if (/^\{\s*(end_of_grid|eog)\s*\}$/i.test(trimmed)) finishGrid();
      else if (trimmed !== '') gridLines.push(rawLine);
      continue;
    }
    const gridStart = trimmed.match(/^\{\s*(?:start_of_grid|sog)\b\s*:?\s*(.*?)\s*\}$/i);
    if (gridStart) {
      if (currentSection.lines.length > 0) sections.push(currentSection);
      const attrs = gridStart[1];
      const label = attrs.match(/label\s*[=:]\s*"([^"]*)"/i) ?? attrs.match(/label\s*[=:]\s*'([^']*)'/i) ?? attrs.match(/label\s*=\s*(\S+)/i) ?? attrs.match(/label\s*:\s*(.+)$/i);
      gridLabel = label ? label[1] : attrs && !attrs.includes('=') ? attrs : 'Grid';
      gridLines = [];
      continue;
    }

    // Check for ChordPro Directives: {directive: value} or {directive}
    if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
      const inside = trimmed.slice(1, -1).trim();
      const colonIdx = inside.indexOf(':');
      let directive = (colonIdx === -1 ? inside : inside.slice(0, colonIdx)).trim().toLowerCase();
      let value = colonIdx === -1 ? '' : inside.slice(colonIdx + 1).trim();
      // A section can be named with a label: {start_of_verse label="Verse 1"} or {start_of_verse label: Verse 1}
      const labelled = inside.match(/^(start_of_verse|start_of_chorus|start_of_bridge|sov|soc|sob)\s+label\s*[:=]\s*(?:"([^"]*)"|'([^']*)'|(.*))$/i);
      if (labelled) {
        directive = labelled[1].toLowerCase();
        value = (labelled[2] ?? labelled[3] ?? labelled[4] ?? '').trim();
      }

      // Normalize short directive names
      if (directive === 't') directive = 'title';
      if (directive === 'st' || directive === 'su') directive = 'subtitle';
      if (directive === 'a') directive = 'artist';
      if (directive === 'k') directive = 'key';
      if (directive === 'c') directive = 'comment';
      if (directive === 'soc' || directive === 'start_of_chorus') directive = 'start_of_chorus';
      if (directive === 'eoc' || directive === 'end_of_chorus') directive = 'end_of_chorus';
      if (directive === 'sov' || directive === 'start_of_verse') directive = 'start_of_verse';
      if (directive === 'eov' || directive === 'end_of_verse') directive = 'end_of_verse';
      if (directive === 'sob' || directive === 'start_of_bridge') directive = 'start_of_bridge';
      if (directive === 'eob' || directive === 'end_of_bridge') directive = 'end_of_bridge';

      switch (directive) {
        case 'title':
          metadata.title = value || metadata.title;
          break;
        case 'subtitle':
        case 'artist':
          metadata.artist = value || metadata.artist;
          metadata.subtitle = value || metadata.subtitle;
          break;
        case 'key':
          metadata.key = value;
          metadata.originalKey = value;
          break;
        case 'capo':
          metadata.capo = parseInt(value, 10) || 0;
          break;
        case 'tempo':
        case 'bpm':
          metadata.tempo = value;
          break;
        case 'style':
          metadata.style = value;
          break;
        case 'time':
          metadata.time = value;
          break;
        case 'start_of_chorus':
          if (currentSection.lines.length > 0) {
            sections.push(currentSection);
          }
          currentSection = {
            type: 'chorus',
            title: value || 'Chorus',
            lines: [],
          };
          break;
        case 'end_of_chorus':
          sections.push(currentSection);
          currentSection = { type: 'general', lines: [] };
          break;
        case 'start_of_verse':
          if (currentSection.lines.length > 0) {
            sections.push(currentSection);
          }
          currentSection = {
            type: 'verse',
            title: value || 'Verse',
            lines: [],
          };
          break;
        case 'end_of_verse':
          sections.push(currentSection);
          currentSection = { type: 'general', lines: [] };
          break;
        case 'start_of_bridge':
          if (currentSection.lines.length > 0) {
            sections.push(currentSection);
          }
          currentSection = {
            type: 'bridge',
            title: value || 'Bridge',
            lines: [],
          };
          break;
        case 'end_of_bridge':
          sections.push(currentSection);
          currentSection = { type: 'general', lines: [] };
          break;
        case 'comment':
        case 'c':
        case 'ci':
        case 'cb':
          currentSection.lines.push({
            type: 'comment',
            commentText: value,
          });
          break;
        default:
          if (directive.includes('verse') || directive.includes('chorus') || directive.includes('intro') || directive.includes('bridge') || directive.includes('outro')) {
            if (currentSection.lines.length > 0) {
              sections.push(currentSection);
            }
            currentSection = {
              type: directive.includes('chorus') ? 'chorus' : directive.includes('bridge') ? 'bridge' : 'general',
              title: value || directive.toUpperCase(),
              lines: [],
            };
          }
          break;
      }
      continue;
    }

    // Check for Section headers formatted as text
    const sectionMatch = trimmed.match(/^\[?(Verse\s*\d*|Chorus\s*\d*|Bridge\s*\d*|Intro|Outro|Solo|Pre-Chorus|Tag|Interlude)\]?:?$/i);
    if (sectionMatch) {
      if (currentSection.lines.length > 0) {
        sections.push(currentSection);
      }
      const title = sectionMatch[1];
      const type = title.toLowerCase().includes('chorus') ? 'chorus' : title.toLowerCase().includes('bridge') ? 'bridge' : 'verse';
      currentSection = {
        type,
        title,
        lines: [],
      };
      continue;
    }

    // Handle empty lines
    if (trimmed === '') {
      if (currentSection.lines.length > 0 && currentSection.lines[currentSection.lines.length - 1].type !== 'empty') {
        currentSection.lines.push({ type: 'empty' });
      }
      continue;
    }

    // Parse standard lyric & chord line
    const parsedLine = parseLineTokens(rawLine);
    if (parsedLine.tokens) {
      for (const tok of parsedLine.tokens) {
        if (tok.chord) allChordsSet.add(tok.chord);
      }
    }
    currentSection.lines.push(parsedLine);
  }

  finishGrid(); // a grid left open at the end of the text still counts
  if (currentSection.lines.length > 0) {
    sections.push(currentSection);
  }

  // Auto-detect key if not specified in metadata
  if (!metadata.key && allChordsSet.size > 0) {
    const firstChord = Array.from(allChordsSet)[0];
    const m = firstChord.match(/^([A-G][#b]?)(m)?/i);
    if (m) {
      metadata.key = `${m[1].toUpperCase()}${m[2] ? 'm' : ''}`;
      metadata.originalKey = metadata.key;
    }
  }

  if (!metadata.title || metadata.title === 'Untitled Song') {
    if (sections.length > 0 && sections[0].lines.length > 0) {
      const firstLine = sections[0].lines[0];
      if (firstLine.tokens && firstLine.tokens.length > 0) {
        const textSum = firstLine.tokens.map(t => t.lyric).join('').trim();
        if (textSum) metadata.title = textSum;
      }
    }
  }

  return {
    metadata,
    sections,
    rawText: text,
    allChords: Array.from(allChordsSet),
  };
}

function parseLineTokens(line: string): SongLine {
  const tokens: ChordToken[] = [];
  let hasChords = false;

  const chordRegex = /\[([^\]]+)\]/g;
  let match: RegExpExecArray | null;

  let lastMatchEnd = 0;
  let currentChord: string | undefined = undefined;

  while ((match = chordRegex.exec(line)) !== null) {
    hasChords = true;
    const matchStart = match.index;
    const chordContent = match[1].trim();

    const precedingLyric = line.slice(lastMatchEnd, matchStart);
    if (precedingLyric.length > 0 || currentChord !== undefined) {
      tokens.push({
        type: 'chord_lyric',
        chord: currentChord,
        originalChord: currentChord,
        lyric: precedingLyric,
      });
    }

    currentChord = chordContent;
    lastMatchEnd = chordRegex.lastIndex;
  }

  const remainingLyric = line.slice(lastMatchEnd);
  if (remainingLyric.length > 0 || currentChord !== undefined) {
    tokens.push({
      type: 'chord_lyric',
      chord: currentChord,
      originalChord: currentChord,
      lyric: remainingLyric,
    });
  }

  if (tokens.length === 0) {
    tokens.push({
      type: 'chord_lyric',
      lyric: line,
    });
  }

  return {
    type: 'lyric_line',
    tokens,
    hasChords,
  };
}

export function transposeParsedSong(song: ParsedSong, semitones: number, preferFlats?: boolean): ParsedSong {
  const newKey = song.metadata.key ? transposeChord(song.metadata.key, semitones, preferFlats) : undefined;

  const newSections: SongSection[] = song.sections.map(section => ({
    ...section,
    grid: section.grid && {
      rows: section.grid.rows.map((row) =>
        row.map((bar) => ({
          beats: bar.beats.map((beat) => ({ ...beat, chords: beat.originalChords.map((c) => transposeChord(c, semitones, preferFlats)) })),
        })),
      ),
    },
    lines: section.lines.map(line => {
      if (line.type !== 'lyric_line' || !line.tokens) return line;

      const newTokens: ChordToken[] = line.tokens.map(token => ({
        ...token,
        chord: token.originalChord ? transposeChord(token.originalChord, semitones, preferFlats) : undefined,
      }));

      return {
        ...line,
        tokens: newTokens,
      };
    }),
  }));

  const allChords = song.allChords.map(c => transposeChord(c, semitones, preferFlats));

  return {
    ...song,
    metadata: {
      ...song.metadata,
      key: newKey,
    },
    sections: newSections,
    allChords,
  };
}

const CHORDISH = /^[A-G][#b]?[^\s|~]*$/;

/**
 * Rewrites ChordPro text in another key: every [chord], every chord in a grid, and {key: …}.
 * The text keeps its layout, so a song can be saved in the new key and still read the same.
 */
export function transposeChordProText(text: string, semitones: number, preferFlats = false): string {
  if (semitones % 12 === 0) return text;
  const move = (c: string) => transposeChord(c, semitones, preferFlats);
  let inGrid = false;
  return text
    .split('\n')
    .map((line) => {
      const t = line.trim();
      if (/^\{\s*(start_of_grid|sog)\b/i.test(t)) inGrid = true;
      else if (/^\{\s*(end_of_grid|eog)\s*\}/i.test(t)) inGrid = false;
      else if (inGrid) return line.replace(/[^\s|:]+/g, (w) => w.split('~').map((c) => (CHORDISH.test(c) ? move(c) : c)).join('~'));
      const key = line.match(/^(\s*\{\s*key\s*:\s*)([A-G][#b]?m?)(\s*\}\s*)$/i);
      if (key) return key[1] + move(key[2]) + key[3];
      return line.replace(/\[([^\]]+)\]/g, (m, c: string) => (CHORDISH.test(c.trim()) ? `[${move(c.trim())}]` : m));
    })
    .join('\n');
}

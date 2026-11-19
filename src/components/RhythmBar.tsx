import { useEffect, useRef, useState } from 'react';
import { CircleHelp, Minus, Plus } from 'lucide-react';
import { addBass, loopSegments } from '../lib/bass';
import { BASS_VOICES, type BassVoice } from '../lib/bassKit';
import { addDrums, DRUM_LEVELS } from '../lib/drums';
import { INSTRUMENTS, type Instrument } from '../lib/instruments';
import { buildPhrase, type Pattern } from '../lib/patterns';
import { playPhrase } from '../lib/synth';
import { snapTempo, stepTempo } from '../lib/tempo';
import type { Rhythm } from '../lib/useRhythm';
import { RhythmGuide } from './RhythmGuide';

// Rhythm and speed belong to the whole song, intro included, so they live in one place above the sheet
export function RhythmBar({ rhythm, demoChords, capo, keyHint }: { rhythm: Rhythm; demoChords: string[]; capo?: number; keyHint?: string }) {
  const { patterns, pattern, bpm } = rhythm;
  const [guideOpen, setGuideOpen] = useState(false);
  const [listening, setListening] = useState<string | null>(null); // what the guide is playing
  const stopRef = useRef<(() => void) | null>(null);

  const stop = () => stopRef.current?.();
  useEffect(() => stop, []);

  // The guide's demos play a few bars on the song's own chords
  const listen = (key: string, p: Pattern, tempo: number, fill?: { style: Rhythm['songFill'] }) => {
    stop();
    const chords = demoChords.length ? demoChords : ['C', 'Am', 'F', 'G'];
    const built = addDrums(buildPhrase(chords, p, 2, capo ?? 0, fill ? { style: fill.style, where: 'every', long: true, keyHint } : undefined), p, rhythm.drums);
    const phrase = addBass(built, p, loopSegments(chords, 2, built.stepsPerBar), rhythm.bass !== 'off');
    setListening(key);
    stopRef.current = playPhrase(phrase, {
      bpm: tempo,
      instrument: rhythm.instrument,
      bassVoice: rhythm.bass === 'off' ? undefined : rhythm.bass,
      onEnd: () => {
        stopRef.current = null;
        setListening(null);
      },
    });
  };

  const groups = [
    ['Picking', patterns.filter((p) => p.kind === 'pick')],
    ['Strums and rhythms', patterns.filter((p) => p.kind === 'strum')],
  ] as const;

  return (
    <div className="bg-stage-card/95 px-3 pt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1" aria-label="Rhythm and speed">
      <select
        value={pattern.id}
        onChange={(e) => rhythm.setPattern(e.target.value)} // each style starts at its own tempo
        aria-label="Rhythm"
        className="min-w-0 flex-1 basis-40 max-w-[15rem] px-2 py-1 rounded-lg bg-stage-bg border border-stage-border text-xs font-semibold focus:outline-none focus:border-stage-accent"
      >
        {groups.map(([heading, group]) => (
          <optgroup key={heading} label={heading}>
            {group.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
                {p.meter ? ` (${p.meter})` : ''}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
      {rhythm.canPick && (
        <div role="group" aria-label="Strum or fingerpicked" className="flex rounded-lg border border-stage-border overflow-hidden text-xs font-semibold">
          {([false, true] as const).map((p) => (
            <button
              key={String(p)}
              onClick={() => rhythm.setPicked(p)}
              aria-pressed={rhythm.picked === p}
              title={p ? 'Fingerpicked: the thumb plays the bass and the fingers pluck the chord, with no strumming' : 'Strummed'}
              className={`px-2 py-1 ${rhythm.picked === p ? 'bg-stage-accent/20 text-stage-accent' : 'text-stage-muted'}`}
            >
              {p ? 'Picked' : 'Strum'}
            </button>
          ))}
        </div>
      )}
      <button
        onClick={() => setGuideOpen(true)}
        className="p-1 rounded-full text-stage-muted hover:text-sky-300"
        aria-label="Rhythm guide: how each rhythm sounds"
        title="Rhythm guide"
      >
        <CircleHelp className="w-4 h-4" />
      </button>
      <select
        value={rhythm.instrument}
        onChange={(e) => rhythm.setInstrument(e.target.value as Instrument)}
        aria-label="Sound"
        title="The sound the notes are played with"
        className="px-2 py-1 rounded-lg bg-stage-bg border border-stage-border text-xs font-semibold focus:outline-none focus:border-stage-accent"
      >
        {INSTRUMENTS.map((i) => (
          <option key={i.id} value={i.id}>
            {i.name}
          </option>
        ))}
      </select>
      <select
        value={rhythm.bass}
        onChange={(e) => rhythm.setBass(e.target.value as BassVoice | 'off')}
        aria-label="Bass"
        title="A bass part under the guitar"
        className="px-2 py-1 rounded-lg bg-stage-bg border border-stage-border text-xs font-semibold focus:outline-none focus:border-stage-accent"
      >
        <option value="off">Bass: off</option>
        {BASS_VOICES.map((v) => (
          <option key={v.id} value={v.id}>
            Bass: {v.name.replace(' bass', '')}
          </option>
        ))}
      </select>
      <select
        value={rhythm.drums}
        onChange={(e) => rhythm.setDrums(e.target.value as (typeof DRUM_LEVELS)[number])}
        aria-label="Drums"
        className="px-2 py-1 rounded-lg bg-stage-bg border border-stage-border text-xs font-semibold focus:outline-none focus:border-stage-accent"
      >
        {DRUM_LEVELS.map((l) => (
          <option key={l} value={l}>
            {l === 'off' ? 'Drums: off' : l === 'light' ? 'Drums: light' : 'Drums: full'}
          </option>
        ))}
      </select>
      <div className="flex items-center gap-0.5 text-[11px] text-stage-muted">
        <button onClick={() => rhythm.setBpm(stepTempo(bpm, -1))} className="p-1 rounded-full hover:text-stage-text" aria-label="Slower">
          <Minus className="w-3.5 h-3.5" />
        </button>
        <span className="min-w-[3.6rem] text-center font-mono text-stage-text" aria-label="Tempo" title="Beats per minute">
          {bpm} bpm
        </span>
        <button onClick={() => rhythm.setBpm(stepTempo(bpm, 1))} className="p-1 rounded-full hover:text-stage-text" aria-label="Faster">
          <Plus className="w-3.5 h-3.5" />
        </button>
      </div>

      <RhythmGuide
        isOpen={guideOpen}
        onClose={() => {
          stop();
          setGuideOpen(false);
        }}
        patterns={patterns}
        selectedId={pattern.id}
        listeningId={listening}
        onSelect={rhythm.setPattern}
        onListen={(p) => listen(p.id, p, snapTempo(p.bpm))}
        selectedFill={rhythm.songFill}
        onSelectFill={rhythm.setSongFill}
        onListenFill={(style) => listen(`fill:${style}`, pattern, bpm, { style })}
        onStopListening={stop}
      />
    </div>
  );
}

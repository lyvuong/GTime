import { useEffect } from 'react';
import { X } from 'lucide-react';

const STEPS: [string, string][] = [
  ['Play along', "Plays the whole song as a backing track: the rhythm you chose, at your tempo, in the song's key (with its capo and any transposing). Sing over it, or play lead. A count-in bar comes first, and the song ends on one held chord."],
  ['Rhythm and speed', 'Choose the rhythm and speed in the bar above the song. They apply to the intro and to the song. The ? next to the rhythm lets you hear each one.'],
  ['Follow the sheet', 'The chord that is sounding is highlighted and the sheet scrolls to keep its line in view. Turn "Follow along" off if you would rather scroll yourself.'],
  ['Grid chart', 'Switch the song from "Lyrics" to "Grid chart" for a chart of bars, four to a row (eight on a wide screen), with the chord in each box and a few lyric words beneath it. The notation is the usual lead-sheet kind. A bar with two chords is split in two. After a chord, a slash (C / / /) means the same chord on every beat of the bar. A slash with a dot either side repeats the bar before, and a double slash across a barline repeats the two bars before. A part that repeats exactly (a four-bar loop played three times, say) is shown once between repeat signs (thick and thin barlines with two dots) with a count like ×3, and while it plays the chart tells you which pass you are on. Untick "Fold repeats" to see every bar. While the song plays, the sounding bar lights up and the chart scrolls with it. Tap a bar to start from it. In "Set chord lengths", tap a chord on the grid to change how long it lasts.'],
  ['Start anywhere', 'Tap a line of lyrics to mark where to start (a blue bar appears beside it). Tap it again to clear. While the song plays, tapping a line jumps there.'],
  ['Chord lengths', 'The app guesses how long each chord lasts from the words under it, about five words to a bar. When it sounds wrong, open the settings (the arrow), tap "Set chord lengths", then tap a chord to cycle ¼ bar, ½ bar, ¾ bar, 1 bar, 1½ bars, 2 bars, then back to automatic. Short chords share a bar. Your changes are saved with the song in your library.'],
  ['Fills', "A fill is a short run of notes that joins one chord to the next. Song fills are longer than the intro's: by default they go at the end of each sung line, where the singer rests. You can move them to the end of each paragraph or to every chord change, or turn them off."],
  ['Loop this paragraph', 'Repeats the paragraph that is playing (a verse or the chorus) until you switch it off. Use it to practise a part that is hard to play or sing.'],
  ['Include the intro', 'Choose an intro in "Intro ideas", then switch on "Intro" next to the Play along button so the song starts with it (the same switch is in the settings). The count-in comes first, then the intro, then the song.'],
  ['Drums', 'Add a drum part under the guitar with the "Drums" button next to Intro (or pick the amount in the rhythm bar). Light is a soft kick and rim click. Full adds the snare and hi-hat, and rolls through a fill into a crash. Each rhythm has its own groove: bolero, bossa nova, waltz, shuffle and so on. The drum volume is in the settings. The sounds are synthesized, so they are simple.'],
  ['Bass', 'Switch on "Bass" next to Drums (the voice is in the rhythm bar: electric, upright or synth). The bass plays the root and fifth of each chord in the pattern of the rhythm you chose, walks into the next chord where the guitar has a fill, and rings the last chord at the end. Its volume is in the settings. On small speakers the lowest notes are faint; headphones show them best.'],
  ['Sound', 'The "Sound" menu in the rhythm bar changes what plays the notes: guitar, strings, brass, synth or piano. The rhythm and chords stay the same. Strings hold each note for the whole bar, so they work best with the arpeggios and slower rhythms. Brass plays short stabs, which suit the strums.'],
  ['Pause, resume, tempo', 'Pause keeps your place. Changing the rhythm, tempo, fills, transposing or chord lengths while playing carries on from the same bar. Click adds a metronome click on every beat.'],
];

export function PlayAlongHelp({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 p-3" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="How Play along works"
        className="w-full max-w-lg max-h-[85dvh] overflow-y-auto rounded-2xl bg-stage-card border border-stage-border p-4 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center mb-2">
          <h2 className="text-lg font-extrabold">How Play along works</h2>
          <button onClick={onClose} className="ml-auto p-1.5 rounded-lg hover:bg-stage-cardHover" aria-label="Close">
            <X className="w-5 h-5" />
          </button>
        </div>
        <dl className="space-y-2.5 text-sm">
          {STEPS.map(([title, text]) => (
            <div key={title}>
              <dt className="font-bold text-stage-accent">{title}</dt>
              <dd className="text-stage-muted">{text}</dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  );
}

# GTime

**Guitar Time**: find a Vietnamese song, see its chords, and play it in minutes.

GTime is a lightweight Progressive Web App for guitarists. Search for a song by title or lyric, tap a result, and read a clean chord sheet you can transpose to your voice. Then play along with a synthesized backing band (guitar, bass and drums), practise with a built-in tuner, and keep the songs you love in a personal library that you can back up to your own Google Drive.

Live app: **https://gtime.lyvuong.workers.dev**

It is a companion to the Nhạc StageChord app and shares its ChordPro engine, themes and transposition logic.

---

## Contents

- [What it can do](#what-it-can-do)
- [How to use it](#how-to-use-it)
- [Rhythms](#rhythms)
- [Where your data lives](#where-your-data-lives)
- [Running it yourself](#running-it-yourself)
- [Google Drive backup setup](#google-drive-backup-setup)
- [Project layout](#project-layout)
- [Tests](#tests)
- [Deploying](#deploying)
- [Song source and credits](#song-source-and-credits)

---

## What it can do

### Find and read songs
- **Vietnamese song search.** Type part of a title or lyric, with or without accents. Matching songs from [HopAmChuan](https://hopamchuan.com) appear as you type.
- **Clean chord sheets.** A song is converted to ChordPro and drawn with each chord right above the word it falls on, plus the key, capo and intro.
- **Real-time transposition.** Shift the key up or down by semitones. Sharps and flats follow the song's key (F major gets B♭, not A♯).
- **Light and dark themes.** Dark by default, with a light mode and an automatic mode that follows your device.

### Practise and play along
- **Intro ideas.** For any song, GTime works out ways to start it from the song's own chords: the verse loop, a turnaround, or a chorus hook. It follows your transposition and capo. Pick a picking pattern or rhythm to see it as guitar tab, then press Play to hear it.
- **Play along.** Plays the whole song as a backing track in the rhythm and tempo you chose, in the song's key. A count-in bar comes first, the chord that is sounding is highlighted, and the sheet scrolls to keep your line in view. The song ends on one held chord.
- **Start anywhere, loop a paragraph.** Tap a line of lyrics to start from there. Loop a verse or chorus to drill a hard part.
- **Grid chart.** Switch a song from the lyrics to a chart of bars, four to a row (eight on wide screens), with the chord in each box and a few lyric words beneath it. It uses lead-sheet notation: slashes after a chord (`C / / /`) mean the same chord on every beat; a slash with two dots is the simile mark for "same as the bar before", and a double slash across a barline means "same as the two bars before"; a part that repeats exactly is shown once between repeat signs (thick and thin barlines with two dots) with a count (`×3`), and while it plays the chart says which pass you are on. A bar with two chords is split in two. Untick **Fold repeats** to see every bar. During play-along the sounding bar lights up and the chart follows it. Tap a bar to start from it.
- **Per-chord lengths.** GTime guesses how long each chord lasts from the words under it. When it sounds wrong, set each chord to ¼, ½, ¾, 1, 1½ or 2 bars. Your lengths are saved with the song.
- **Fills.** Short runs of notes that join one chord to the next: bass run, approach note, chord hammer-on, or a melodic lick. The intro and the song have separate fill settings.
- **A backing band, all synthesized.** There are no audio files. Everything is built from scratch in your browser.
  - **Drums:** Off, Light (kick and rim click) or Full (kick, snare, hi-hat, a roll through fills and a crash). Each rhythm has its own groove, and no two hits are exactly the same.
  - **Bass:** electric, upright or synth. It plays the roots and fifths in the pattern of the rhythm, walks into the next chord at fills, and rings the last chord at the end.
  - **Sound:** guitar, strings, brass, synth or piano play the chords.
  - **Metronome click** on every beat, if you want one.
- **19 rhythms**, from slow arpeggios to ballroom tango. See [Rhythms](#rhythms). The **?** next to the rhythm lets you listen to each one.

### Tune up
- **Guitar tuner.** Pluck a string and the tuner shows the note and how many cents sharp or flat it is. It supports Standard, Drop D, Half step down, Full step down, DADGAD and Open G. Any string can play a reference note, so you can tune by ear. The microphone is used only while the tuner is on.

### Keep your songs
- **Personal library.** Every song you open is saved automatically. Songs open instantly and work without a connection.
- **Play and search counts.** GTime tallies how often you search for and play each song, so favourites rise to the top. Sort by Recent, Most played or A–Z.
- **Frequently searched.** Your most-searched songs are shown on the search page for one-tap access.
- **Backup and restore.** Save the whole library to your own Google Drive, or to a file, and restore it on this or another device.
- **Update banner.** When a new version is deployed, a banner offers to reload.

---

## How to use it

### 1. Find a song
1. Open the **Search** tab and type part of a title or lyric. Accents are optional.
2. Tap a result. GTime fetches that one song and shows its chord sheet. It is saved to your library automatically.

### 2. Make it fit your voice
- Use the transpose buttons to move the key up or down. The chord names update everywhere, including the intro and the backing track.
- If you play with a capo, set it, and the chords shown are the shapes you play.

### 3. Pick a rhythm
Use the **Rhythm & speed** bar above the song:
- **Rhythm** chooses the strumming or picking pattern (press **?** to hear each one).
- **Sound** chooses the instrument: guitar, strings, brass, synth or piano.
- **Bass** and **Drums** add a bass line and a drum part.
- The **tempo** slider sets the speed.

These settings apply to both the intro and the backing track, and they are remembered on your device.

### 4. Try an intro
Open **Intro ideas** under the song. Choose one of the suggested intros, pick a fill if you like, and press **Play intro**. The tab shows what to play.

### 5. Switch to the grid chart
Above the song, tap **Grid chart** instead of **Lyrics**. Tap any bar to start playing from it. While the song plays, the current bar is outlined and the current chord is filled in. Repeated parts are shown once with a count such as ×3; untick **Fold repeats** to see every bar. Your choice is remembered.

### 6. Play along
Under the song is the **Play along** bar:

| Control | What it does |
| --- | --- |
| **Play / Pause / Stop** | Starts the backing track after a count-in. Pause keeps your place. |
| **Bass on/off** | Adds or removes the bass line. |
| **Drums on/off** | Adds or removes the drums. |
| **Intro on/off** | Starts the song with the intro you chose. |
| **?** | Opens a help page for Play along. |
| **Arrow (settings)** | More options, listed below. |

Settings (the arrow):
- **Song fill** and **Fill goes:** the style of fill, and where it goes (end of each line, end of each paragraph, or every chord change).
- **Bars per chord**, **count-in**, **click**, **follow along**, **loop this paragraph**, **play intro first**.
- **Set chord lengths:** turn it on, then tap a chord to cycle through ¼, ½, ¾, 1, 1½ and 2 bars.
- **Bass volume**, **Drum volume** and **Volume.**

Tips:
- Tap a lyric line to mark where to start (a blue bar appears). While playing, tapping a line jumps there.
- Changing the rhythm, tempo, fills, key or chord lengths while playing carries on from the same bar.
- Bass notes are low. On a phone speaker they are faint, and headphones show them best. The bass voices add upper harmonics so you can still hear the line on small speakers.

### 7. Tune your guitar
Open the **Tuner** tab, choose a tuning, allow the microphone, and pluck a string. Tap a string to hear its reference note instead.

### 8. Your library
Open the **Library** tab to see your saved songs. Tap one to open it. Use the bin icon to remove it, or **Reset counts** to clear the play and search tallies.

### 9. Back up your library
At the bottom of the **Library** tab, the **Library backup** section saves your songs, chord lengths, play counts and settings:
- **Save to Drive** signs you in to Google and writes one file, `GTime-library.json`, to your own Drive. A later save replaces it.
- **Restore from Drive** reads that file back. Songs are added to your library, and a song you already have is replaced by the backup's copy. Play counts keep the larger number. Settings are restored and the page reloads once.
- **Export to file / Import from file** do the same with a file on your device, with no Google account needed.

GTime can see only the one file it saves, never the rest of your Drive.

---

## Rhythms

| Rhythm | Feel |
| --- | --- |
| Arpeggio | Gentle picked chord, root first |
| Alternating bass | Bass note alternates between two strings |
| Slow arpeggio | Wide, slow picking |
| Slow Rock arpeggio | Triplet feel, slow |
| Waltz arpeggio | Three beats to a bar, picked |
| Pop strum | Down-down-up pattern |
| Steady strum | Even, driving strum |
| Down strum | Simple downstrokes |
| Ballad | Soft, sparse |
| Bolero | The classic Vietnamese bolero |
| Slow Rock | Triplet backbeat |
| Bossa Nova | Syncopated, Brazilian |
| Rumba | Latin, with a displaced accent |
| Cha Cha | Latin, with quick off-beats |
| Tango (ballroom) | Marcato, a hit on every beat. With full drums, a rapid snare roll on the "and" of 4 |
| Tango (syncopated) | The Argentine grouping of three, three, two |
| Blues shuffle | Swung triplets |
| Valse | Waltz, three in a bar |
| Boston | Slow waltz |

Each rhythm has its own drum groove and bass pattern.

---

## Where your data lives

- **Songs, chord lengths and play counts** are in your browser's IndexedDB (database `GTimeDB`) on this device. They are not uploaded anywhere.
- **Settings** (rhythm, tempo, sound, drums, bass, theme) are in the browser's localStorage.
- **Nothing leaves your device** unless you choose Save to Drive or Export to file. There are no accounts and no tracking.
- A song is fetched from HopAmChuan only when you open it, through a small Worker that GTime runs.
- The tuner listens through your microphone only while it is on. Sound is analysed on your device and is never recorded or sent anywhere.

Clearing site data in your browser removes the local library, so make a backup first.

---

## Running it yourself

You need Node.js 22.6 or newer (the tests run TypeScript directly).

```bash
git clone https://github.com/lyvuong/GTime.git
cd GTime
npm install
npm run dev
```

Open the address that Vite prints. The development server also serves the `/api/*` routes, using the same code as the Cloudflare Worker, so you do not need Wrangler to develop.

| Command | What it does |
| --- | --- |
| `npm run dev` | Starts the development server |
| `npm run build` | Type-checks and builds the app into `dist/` |
| `npm run preview` | Serves the built app locally |
| `npm test` | Runs the unit tests |
| `npm run deploy` | Builds, then deploys to Cloudflare with Wrangler |

### Tech
React 19, Vite, TypeScript, Tailwind CSS 3, Dexie (IndexedDB), lucide-react icons, and a Cloudflare Worker with static assets. All audio uses the Web Audio API.

---

## Google Drive backup setup

Backup to Google Drive needs an OAuth Client ID. It is not a secret, but it is kept out of the repo.

1. In [Google Cloud Console](https://console.cloud.google.com/apis/credentials), create an **OAuth client ID** of type **Web application**. Enable the **Google Drive API** for the project.
2. Under **Authorized JavaScript origins**, add your deployed address (for example `https://gtime.lyvuong.workers.dev`) and `http://localhost:5173` (or whichever port you develop on).
3. The only permission GTime asks for is `drive.file`, which lets it see just the files it creates. If the consent screen is in testing mode, add your Google account as a test user.
4. Give the Client ID to the app in one of these ways:
   - **Deployed:** set it as a Cloudflare secret. The Worker serves it at `/api/config`, so no rebuild is needed.
     ```bash
     npx wrangler secret put GOOGLE_CLIENT_ID
     ```
     Run this inside the GTime folder so it reaches the right Worker.
   - **Local development:** create `.env.local` containing `VITE_GOOGLE_CLIENT_ID=your-client-id`, then restart the dev server.
   - **Neither set:** the Library backup section shows a field where you can paste it. It is saved on that device.

---

## Project layout

```
GTime/
├── src/
│   ├── App.tsx               The app shell: search, library and tuner tabs
│   ├── components/           Chord sheet, Play along bar, rhythm bar, intro card,
│   │                         grid chart, tuner, About and help dialogs, library backup
│   ├── lib/
│   │   ├── chordParser.ts    ChordPro parsing and chord transposing
│   │   ├── songTiming.ts     Works out how long each chord lasts
│   │   ├── gridChart.ts      Lays the bars out in rows for the grid chart
│   │   ├── patterns.ts       The rhythms and how they become notes
│   │   ├── fills.ts          Fill styles
│   │   ├── drums.ts          Drum grooves   (drumKit.ts makes the sounds)
│   │   ├── bass.ts           Bass lines     (bassKit.ts makes the sounds)
│   │   ├── instruments.ts    Guitar, strings, brass, synth and piano voices
│   │   ├── synth.ts          Plays a short phrase and the shared limiter
│   │   ├── playAlong.ts      The play-along scheduler
│   │   ├── pitch.ts          Pitch detection for the tuner
│   │   ├── backup.ts         Backup file format (backupStore.ts, googleDrive.ts)
│   │   └── db.ts             The IndexedDB database
│   └── utils/                Version info and update check
├── shared/                   Song search and fetch code, shared by the Worker and dev server
├── worker/index.ts           The Cloudflare Worker (/api/* and /api/config)
├── public/                   Icons and the web app manifest
└── wrangler.toml             Cloudflare configuration
```

---

## Tests

```bash
npm test
```

The tests use Node's built-in test runner and cover the song parser, chord timing, rhythms, fills, drums, bass, instrument voices, the tuner's pitch detection, library tallies and the backup format.

---

## Deploying

GTime runs on Cloudflare Workers, with the built app served as static assets and the Worker handling `/api/*`.

```bash
npx wrangler login      # once
npm run deploy
```

The app version shown in About comes from the git commit count, so it goes up with every commit.

---

## Song source and credits

Chords and lyrics come from [hopamchuan.com](https://hopamchuan.com), where its community contributes them. GTime is an independent project and is not affiliated with or endorsed by HopAmChuan. A song is fetched only when you open it, and every song keeps a link back to its original page. Lyrics and arrangements belong to their respective authors and contributors, so please support the artists and the source site.

Built by Ly Vuong.

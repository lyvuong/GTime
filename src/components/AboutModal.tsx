import React, { useEffect } from 'react';
import {
  X,
  Guitar,
  Search,
  Sliders,
  ShieldCheck,
  Library,
  Heart,
  ExternalLink,
  Code2,
  CheckCircle2,
  Tag,
  Calendar,
  Server,
  GitBranch,
  Music,
  Mic,
  Info,
  Globe,
} from 'lucide-react';
import { APP_VERSION, BUILD_DATE, BUILD_HASH, DISPLAY_VERSION } from '../utils/version';

interface AboutModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const FEATURES = [
  {
    icon: Search,
    tint: 'bg-cyan-500/10 text-cyan-400',
    title: 'Vietnamese Song Search',
    body: 'Type part of a title or lyric, with or without accents. Matching songs from HopAmChuan appear as you type.',
  },
  {
    icon: Music,
    tint: 'bg-purple-500/10 text-purple-400',
    title: 'Clean Chord Sheets',
    body: 'Songs are converted to ChordPro and drawn with chords right above the words, plus key, capo and intro.',
  },
  {
    icon: Sliders,
    tint: 'bg-amber-500/10 text-amber-400',
    title: 'Real-Time Transposition',
    body: 'Shift the key up or down by semitones, with sharp and flat spelling that follows the song’s key.',
  },
  {
    icon: Library,
    tint: 'bg-emerald-500/10 text-emerald-400',
    title: 'Personal Library',
    body: 'Every song you open is saved automatically. They live on your device, open instantly, and work without a connection. GTime also tallies how often you search for and play each song, so your favourites rise to the top. Counts stay on your device.',
  },
  {
    icon: Mic,
    tint: 'bg-rose-500/10 text-rose-400',
    title: 'Guitar Tuner',
    body: 'Tune by ear or by eye. Pluck a string and the tuner shows the note and how many cents sharp or flat it is. It supports Standard, Drop D, Half step down, Full step down, DADGAD and Open G, and any string can play a reference note.',
  },
];

export const AboutModal: React.FC<AboutModalProps> = ({ isOpen, onClose }) => {
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-3 sm:p-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-[max(0.75rem,env(safe-area-inset-bottom))] overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="bg-stage-card border border-stage-border rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col my-auto max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="relative px-4 sm:px-6 py-5 bg-gradient-to-br from-cyan-500/20 via-stage-card to-stage-card border-b border-stage-border flex-shrink-0">
          <button
            onClick={onClose}
            className="absolute top-3 right-3 p-1.5 rounded-full bg-black/40 hover:bg-black/60 text-white/80 hover:text-white border border-white/10 transition cursor-pointer"
            title="Close"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-3.5">
            <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-gradient-to-tr from-cyan-500 via-blue-500 to-indigo-500 flex items-center justify-center shadow-xl ring-2 ring-cyan-500/50">
              <Guitar className="w-8 h-8 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl sm:text-2xl font-black text-stage-text tracking-tight">
                  G<span className="text-stage-accent">Time</span>
                </h2>
                <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded-md bg-cyan-500/20 text-cyan-500 dark:text-cyan-300 border border-cyan-500/40 font-extrabold">
                  {DISPLAY_VERSION}
                </span>
              </div>
              <p className="text-xs text-stage-muted font-medium">
                <em>Guitar Time</em>: find a Vietnamese song, play it in minutes
              </p>
            </div>
          </div>
        </div>

        {/* Scrollable content */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-6 text-xs text-stage-text">
          {/* Mission */}
          <div className="bg-stage-bg/60 rounded-xl p-3.5 border border-stage-border/60">
            <p className="leading-relaxed">
              <strong className="text-cyan-600 dark:text-cyan-400">GTime</strong> is a lightweight Progressive Web App for guitarists who
              want chords for a Vietnamese song right now. Search by title or lyrics, tap a result, and read a clean chord sheet you can
              transpose to your voice. Keep the songs you love in a personal library on your own device, and tune up with the built-in guitar tuner.
            </p>
          </div>

          {/* How it works */}
          <div>
            <h4 className="font-mono font-bold text-[11px] uppercase tracking-wider text-stage-muted mb-3 flex items-center gap-1.5">
              <Info className="w-3.5 h-3.5 text-cyan-400" /> How It Works
            </h4>
            <ol className="space-y-2">
              {[
                ['Search', 'Type part of a song name or lyric. Accents are optional.'],
                ['Open', 'Tap a result. GTime fetches that one song and converts it to a ChordPro chord sheet.'],
                ['Play', 'Transpose to a comfortable key, and it is saved to your library automatically.'],
              ].map(([title, body], i) => (
                <li key={title} className="flex gap-3 items-start p-3 rounded-xl bg-stage-bg border border-stage-border/70">
                  <span className="w-6 h-6 rounded-full bg-cyan-500/15 text-cyan-400 font-mono font-bold flex items-center justify-center flex-shrink-0">
                    {i + 1}
                  </span>
                  <div>
                    <h5 className="font-bold text-stage-text">{title}</h5>
                    <p className="text-[11px] text-stage-muted mt-0.5 leading-normal">{body}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>

          {/* Features */}
          <div>
            <h4 className="font-mono font-bold text-[11px] uppercase tracking-wider text-stage-muted mb-3 flex items-center gap-1.5">
              <Guitar className="w-3.5 h-3.5 text-amber-400" /> Core Features
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {FEATURES.map(({ icon: Icon, tint, title, body }, i) => (
                <div
                  key={title}
                  className={`p-3 rounded-xl bg-stage-bg border border-stage-border/70 flex gap-2.5 ${
                    i === FEATURES.length - 1 && FEATURES.length % 2 === 1 ? 'sm:col-span-2' : ''
                  }`}
                >
                  <div className={`p-2 rounded-lg flex-shrink-0 h-fit ${tint}`}>
                    <Icon className="w-4 h-4" />
                  </div>
                  <div>
                    <h5 className="font-bold text-xs text-stage-text">{title}</h5>
                    <p className="text-[11px] text-stage-muted mt-0.5 leading-normal">{body}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Data source & privacy */}
          <div>
            <h4 className="font-mono font-bold text-[11px] uppercase tracking-wider text-stage-muted mb-3 flex items-center gap-1.5">
              <Globe className="w-3.5 h-3.5 text-emerald-400" /> Song Source & Privacy
            </h4>
            <div className="p-3.5 rounded-xl bg-stage-bg border border-stage-border/70 space-y-2 text-[11px] text-stage-muted leading-relaxed">
              <p>
                Chords and lyrics come from{' '}
                <a
                  href="https://hopamchuan.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-cyan-500 dark:text-cyan-400 font-semibold hover:underline"
                >
                  hopamchuan.com
                </a>
                , where they are contributed by its community. GTime is an independent project and is not affiliated with or endorsed by
                HopAmChuan. A song is only fetched when you open it, and every song keeps a link back to its original page.
              </p>
              <p>
                Lyrics and arrangements belong to their respective authors and contributors. Please support the artists and the source site.
              </p>
              <p className="flex items-start gap-1.5 text-emerald-500 dark:text-emerald-400">
                <ShieldCheck className="w-3.5 h-3.5 mt-px flex-shrink-0" />
                <span>
                  No accounts and no tracking. Your library is stored only in your browser (IndexedDB) and never leaves your device.
                  The tuner uses your microphone only while it is switched on. Sound is analysed on your device and is never recorded or sent
                  anywhere.
                </span>
              </p>
            </div>
          </div>

          {/* Developer */}
          <div className="bg-stage-bg/80 p-4 sm:p-5 rounded-2xl border border-stage-border/80 space-y-3">
            <div className="flex items-center gap-2">
              <div className="p-1.5 bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 rounded-lg border border-cyan-500/20">
                <Code2 className="w-4 h-4" />
              </div>
              <h3 className="text-sm font-black text-stage-text">Developer Information</h3>
            </div>
            <div className="flex flex-col sm:flex-row items-center sm:items-start gap-4">
              <div className="relative shrink-0">
                <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-cyan-500 via-blue-500 to-indigo-500 p-0.5 shadow-lg shadow-cyan-500/20">
                  <img
                    src="/avatar.png"
                    alt="Ly Vuong"
                    className="w-full h-full rounded-[14px] object-cover"
                    onError={(e) => {
                      (e.currentTarget as HTMLElement).style.display = 'none';
                    }}
                  />
                </div>
                <span className="absolute -bottom-1 -right-1 w-5 h-5 bg-cyan-500 text-slate-950 rounded-full flex items-center justify-center border-2 border-stage-card">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                </span>
              </div>
              <div className="space-y-1.5 text-center sm:text-left flex-1">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5">
                  <div>
                    <h4 className="text-sm font-extrabold text-stage-text">Ly Vuong</h4>
                    <p className="text-[11px] text-cyan-600 dark:text-cyan-400 font-bold">Creator & Lead Engineer</p>
                  </div>
                  <a
                    href="https://github.com/lyvuong/GTime"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 bg-stage-cardHover hover:bg-stage-border text-stage-text text-[11px] font-bold px-3 py-1.5 rounded-lg border border-stage-border transition-all self-center sm:self-auto"
                  >
                    <GitBranch className="w-3.5 h-3.5 text-cyan-600 dark:text-cyan-400" />
                    <span>GitHub Repository</span>
                    <ExternalLink className="w-3 h-3 text-stage-muted" />
                  </a>
                </div>
                <p className="text-[11px] text-stage-muted leading-relaxed">
                  Built as a companion to the Nhạc StageChord app, sharing its ChordPro engine, themes and transposition logic. Made with
                  React, Vite and Cloudflare Workers.
                </p>
              </div>
            </div>
          </div>

          {/* Version */}
          <div className="space-y-2.5">
            <h4 className="font-mono font-bold text-[11px] uppercase tracking-wider text-stage-muted flex items-center gap-1.5">
              <Tag className="w-3.5 h-3.5 text-emerald-400" /> Version & Build Specifications
            </h4>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <div className="bg-stage-bg/60 p-3 rounded-xl border border-stage-border/60 space-y-0.5">
                <span className="text-[10px] text-stage-muted uppercase font-extrabold tracking-wider block">Version</span>
                <span className="text-xs font-mono font-bold text-cyan-300 flex items-center gap-1">
                  <Tag className="w-3 h-3 text-cyan-400" />v{APP_VERSION}
                </span>
              </div>
              <div className="bg-stage-bg/60 p-3 rounded-xl border border-stage-border/60 space-y-0.5">
                <span className="text-[10px] text-stage-muted uppercase font-extrabold tracking-wider block">Build / Commit</span>
                <span className="text-xs font-mono font-bold text-stage-text flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                  {BUILD_HASH ? `#${BUILD_HASH}` : 'main'}
                </span>
              </div>
              <div className="bg-stage-bg/60 p-3 rounded-xl border border-stage-border/60 space-y-0.5">
                <span className="text-[10px] text-stage-muted uppercase font-extrabold tracking-wider block">Build Date</span>
                <span className="text-xs font-mono font-bold text-stage-text flex items-center gap-1">
                  <Calendar className="w-3 h-3 text-amber-400" />
                  {BUILD_DATE}
                </span>
              </div>
              <div className="bg-stage-bg/60 p-3 rounded-xl border border-stage-border/60 space-y-0.5">
                <span className="text-[10px] text-stage-muted uppercase font-extrabold tracking-wider block">Storage</span>
                <span className="text-xs font-mono font-bold text-emerald-400 flex items-center gap-1">
                  <Server className="w-3 h-3 text-emerald-400" />
                  IndexedDB
                </span>
              </div>
            </div>
          </div>

          {/* Footer line */}
          <div className="pt-3 border-t border-stage-border/60 flex flex-col sm:flex-row items-center justify-between gap-2 text-[11px] text-stage-muted">
            <span>{DISPLAY_VERSION} • PWA Ready</span>
            <div className="flex items-center gap-1">
              <span>Made with</span>
              <Heart className="w-3 h-3 text-rose-500 fill-rose-500" />
              <span>for guitarists everywhere</span>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-3.5 border-t border-stage-border bg-stage-bg/40 flex items-center justify-between">
          <a
            href="https://github.com/lyvuong/GTime"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-xs text-stage-muted hover:text-stage-text font-medium transition"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            <span>GitHub Repository</span>
          </a>
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-1.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs shadow-md shadow-cyan-500/20 active:scale-95 transition cursor-pointer"
          >
            Got It
          </button>
        </div>
      </div>
    </div>
  );
};

import { useState } from 'react';
import { ChevronDown, Music2 } from 'lucide-react';
import type { IntroOption } from '../lib/intro';

// A collapsible strip under the song toolbar with ways to start the song
export function IntroCard({ options }: { options: IntroOption[] }) {
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState<IntroOption['id'] | null>(null);
  if (options.length === 0) return null;
  const current = options.find((o) => o.id === picked) ?? options[0];

  return (
    <div className="border-b border-stage-border bg-stage-card/60">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="w-full px-4 py-2 flex items-center gap-2 text-sm font-semibold text-stage-muted hover:text-stage-text"
      >
        <Music2 className="w-4 h-4 text-stage-accent" /> Intro ideas
        <ChevronDown className={`w-4 h-4 ml-auto transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="px-4 pb-3 space-y-2">
          <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Intro options">
            {options.map((o) => (
              <button
                key={o.id}
                role="tab"
                aria-selected={o.id === current.id}
                onClick={() => setPicked(o.id)}
                className={`px-3 py-1 rounded-full border text-xs font-semibold ${
                  o.id === current.id ? 'bg-stage-accent/20 border-stage-accent text-stage-accent' : 'border-stage-border text-stage-muted'
                }`}
              >
                {o.label}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-1.5 font-mono font-bold text-lg">
            {current.chords.map((c, i) => (
              <span key={i} className="px-2.5 py-1 rounded-lg bg-stage-bg border border-stage-border">
                {c}
              </span>
            ))}
            {current.repeat > 1 && <span className="text-sm text-stage-muted font-semibold">× {current.repeat}</span>}
          </div>
          <p className="text-xs text-stage-muted">{current.note}</p>
        </div>
      )}
    </div>
  );
}

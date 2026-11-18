import { Moon, Sun, SunMoon } from 'lucide-react';
import type { ThemeMode } from '../lib/useTheme';

const LABEL: Record<ThemeMode, string> = { auto: 'Theme: follows your device', light: 'Theme: light', dark: 'Theme: dark' };

// One tap goes dark, light, auto
export function ThemeToggle({ mode, onNext }: { mode: ThemeMode; onNext: () => void }) {
  const Icon = mode === 'light' ? Sun : mode === 'dark' ? Moon : SunMoon;
  return (
    <button
      onClick={onNext}
      className="p-2 rounded-lg text-stage-muted hover:text-stage-text hover:bg-stage-cardHover"
      aria-label={`${LABEL[mode]}. Tap to change.`}
      title={LABEL[mode]}
    >
      <Icon className="w-5 h-5" />
    </button>
  );
}

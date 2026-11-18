import { useEffect, useState } from 'react';
import { applyThemeToDOM, STAGE_THEMES } from './themeManager';

// Dark (the original look), light, or follow the device. Remembered on this device.
export type ThemeMode = 'auto' | 'light' | 'dark';
const KEY = 'gtime_theme';
const ORDER: ThemeMode[] = ['dark', 'light', 'auto'];

function read(): ThemeMode {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'light' || v === 'auto' ? v : 'dark'; // dark unless chosen otherwise
  } catch {
    return 'dark'; // storage unavailable
  }
}

const prefersDark = () => (typeof matchMedia === 'function' ? matchMedia('(prefers-color-scheme: dark)').matches : true);

export function useTheme(): { mode: ThemeMode; next: () => void } {
  const [mode, setMode] = useState<ThemeMode>(read);

  useEffect(() => {
    const apply = () => {
      const dark = mode === 'dark' || (mode === 'auto' && prefersDark());
      const id = dark ? 'stage-dark' : 'light-contrast';
      applyThemeToDOM(id, STAGE_THEMES[id].defaultAccent);
      document.querySelector('meta[name="theme-color"]')?.setAttribute('content', STAGE_THEMES[id].previewBg);
    };
    apply();
    if (mode !== 'auto' || typeof matchMedia !== 'function') return;
    const query = matchMedia('(prefers-color-scheme: dark)');
    query.addEventListener('change', apply); // follow the device while it is set to auto
    return () => query.removeEventListener('change', apply);
  }, [mode]);

  return {
    mode,
    next: () => {
      const to = ORDER[(ORDER.indexOf(mode) + 1) % ORDER.length];
      setMode(to);
      try {
        localStorage.setItem(KEY, to);
      } catch {
        /* storage unavailable */
      }
    },
  };
}

'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  applyThemePreference,
  readStoredTheme,
  resolveThemeIsDark,
  THEME_STORAGE_KEY,
  type ThemePreference,
} from '@/lib/theme';

type ThemeContextValue = {
  preference: ThemePreference;
  resolved: 'light' | 'dark';
  setPreference: (value: ThemePreference) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [preference, setPreferenceState] = useState<ThemePreference>('system');
  const [resolved, setResolved] = useState<'light' | 'dark'>('light');
  const [ready, setReady] = useState(false);

  const syncResolved = useCallback((nextPreference: ThemePreference) => {
    setResolved(resolveThemeIsDark(nextPreference) ? 'dark' : 'light');
  }, []);

  useEffect(() => {
    const stored = readStoredTheme();
    setPreferenceState(stored);
    applyThemePreference(stored);
    syncResolved(stored);
    setReady(true);

    const media = window.matchMedia('(prefers-color-scheme: dark)');
    function onSystemChange() {
      setPreferenceState((current) => {
        if (current === 'system') {
          syncResolved('system');
        }
        return current;
      });
    }
    media.addEventListener('change', onSystemChange);
    return () => media.removeEventListener('change', onSystemChange);
  }, [syncResolved]);

  const setPreference = useCallback(
    (value: ThemePreference) => {
      setPreferenceState(value);
      applyThemePreference(value);
      syncResolved(value);
      window.localStorage.setItem(THEME_STORAGE_KEY, value);
    },
    [syncResolved],
  );

  const value = useMemo(
    () => ({
      preference: ready ? preference : 'system',
      resolved: ready ? resolved : 'light',
      setPreference,
    }),
    [preference, ready, resolved, setPreference],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error('useTheme must be used within ThemeProvider');
  }
  return ctx;
}

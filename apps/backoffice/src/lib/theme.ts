export type ThemePreference = 'system' | 'light' | 'dark';

export const THEME_STORAGE_KEY = 'flower.theme';

export function isThemePreference(value: string | null): value is ThemePreference {
  return value === 'system' || value === 'light' || value === 'dark';
}

export function readStoredTheme(): ThemePreference {
  if (typeof window === 'undefined') {
    return 'system';
  }
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    return isThemePreference(stored) ? stored : 'system';
  } catch {
    return 'system';
  }
}

export function applyThemePreference(preference: ThemePreference): void {
  document.documentElement.setAttribute('data-theme', preference);
}

export function resolveThemeIsDark(preference: ThemePreference): boolean {
  if (preference === 'dark') {
    return true;
  }
  if (preference === 'light') {
    return false;
  }
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

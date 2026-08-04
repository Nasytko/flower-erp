'use client';

import { t } from '@/i18n/ru';
import type { RuKey } from '@/i18n/ru';
import { useTheme } from '@/components/theme/theme-context';
import type { ThemePreference } from '@/lib/theme';

const OPTIONS: ThemePreference[] = ['system', 'light', 'dark'];

const LABELS: Record<ThemePreference, RuKey> = {
  system: 'themeSystem',
  light: 'themeLight',
  dark: 'themeDark',
};

export function ThemeSelector() {
  const { preference, resolved, setPreference } = useTheme();

  return (
    <div className="theme-selector">
      <p className="field__hint theme-selector__hint">{t('themeHint')}</p>
      <div className="theme-selector__options" role="radiogroup" aria-label={t('themeLabel')}>
        {OPTIONS.map((option) => {
          const active = preference === option;
          return (
            <button
              key={option}
              type="button"
              role="radio"
              aria-checked={active}
              className={
                active ? 'theme-selector__option theme-selector__option--active' : 'theme-selector__option'
              }
              onClick={() => setPreference(option)}
            >
              <span className="theme-selector__option-label">{t(LABELS[option])}</span>
              {option === 'system' ? (
                <span className="theme-selector__option-meta">
                  {resolved === 'dark' ? t('themeResolvedDark') : t('themeResolvedLight')}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}

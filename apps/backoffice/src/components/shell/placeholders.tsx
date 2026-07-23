import { t } from '@/i18n/ru';

/**
 * Visual placeholder only — auth/session not wired.
 * Must not imply a working account menu.
 */
export function UserMenuPlaceholder() {
  return (
    <span className="shell__placeholder" aria-disabled="true" title={t('loadingSession')}>
      {t('accountSoon')}
    </span>
  );
}

/**
 * Visual slot for a future organization switcher.
 * Does not hardcode fake orgs and does not invent multi-tenant selection logic.
 */
export function OrganizationSwitcherPlaceholder() {
  return (
    <span className="shell__placeholder" aria-disabled="true" title={t('orgContext')}>
      {t('orgContext')}
    </span>
  );
}

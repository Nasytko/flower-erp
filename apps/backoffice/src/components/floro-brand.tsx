import type { ReactNode } from 'react';
import { t } from '@/i18n/ru';

type FloroBrandProps = {
  showWordmark?: boolean;
  showTagline?: boolean;
  variant?: 'light' | 'dark';
  className?: string;
};

export function FloroLogo({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path
        d="M14 8C14 8 18 7 24 12C30 17 34 14 34 14C34 14 32 18 28 22C24 26 20 24 20 24C20 24 22 28 26 32C30 36 34 38 34 38"
        stroke="currentColor"
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M14 8V40"
        stroke="currentColor"
        strokeWidth="2.6"
        strokeLinecap="round"
      />
      <path
        d="M14 22H28"
        stroke="currentColor"
        strokeWidth="2.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function FloroBrand({
  showWordmark = true,
  showTagline = false,
  variant = 'dark',
  className = '',
}: FloroBrandProps) {
  const toneClass = variant === 'light' ? 'floro-brand floro-brand--light' : 'floro-brand';

  return (
    <span className={`${toneClass} ${className}`.trim()}>
      <FloroLogo className="floro-brand__logo" />
      {showWordmark ? (
        <span className="floro-brand__text">
          <span className="floro-brand__name">{t('brand')}</span>
          {showTagline ? <span className="floro-brand__tagline">{t('brandTagline')}</span> : null}
        </span>
      ) : null}
    </span>
  );
}

export function FloroBrandLink({
  href,
  children,
  className = '',
}: {
  href: string;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <a href={href} className={`floro-brand-link ${className}`.trim()} aria-label={t('brand')}>
      {children ?? <FloroBrand showTagline={false} />}
    </a>
  );
}

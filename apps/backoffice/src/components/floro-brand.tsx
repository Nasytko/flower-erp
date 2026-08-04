import type { ReactNode, SVGProps } from 'react';
import { t } from '@/i18n/ru';

type FloroBrandProps = {
  showWordmark?: boolean;
  showTagline?: boolean;
  variant?: 'light' | 'dark';
  className?: string;
};

/** Shared mark paths for logo + favicon. */
export const FLORO_LOGO_PATHS = {
  stem: 'M13 7V41',
  leaf:
    'M13 7C13 7 17.5 6 23.5 11.5C29.5 17 33.5 14 33.5 14C33.5 14 31.5 18.5 27.5 22.5C23.5 26.5 19.5 24.5 19.5 24.5C19.5 24.5 21.5 29 25.5 33C29.5 37 33.5 39 33.5 39',
  bar: 'M13 21.5H27.5',
} as const;

export function FloroLogo({ className, ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg
      className={className}
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      {...props}
    >
      <path
        d={FLORO_LOGO_PATHS.leaf}
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d={FLORO_LOGO_PATHS.stem}
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      <path
        d={FLORO_LOGO_PATHS.bar}
        stroke="currentColor"
        strokeWidth="2.5"
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

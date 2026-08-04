import type { ReactNode, SVGProps } from 'react';
import { t } from '@/i18n/ru';

type FloroBrandProps = {
  showWordmark?: boolean;
  showTagline?: boolean;
  variant?: 'light' | 'dark';
  className?: string;
};

/** Single-stroke Floro mark — lowercase f with a leaf flourish (brand board). */
export const FLORO_F_PATH =
  'M14 41.25V22H27.75H14V9.25C14 9.25 8.75 4.5 6.5 7.25C4.25 10 5.75 15.25 9.5 17.25C13.25 19.25 19.25 16.25 21.25 12.25C23.25 8.25 19.5 5.25 15.75 6.25C14.25 6.75 14 9.25 14 9.25';

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
        d={FLORO_F_PATH}
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
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

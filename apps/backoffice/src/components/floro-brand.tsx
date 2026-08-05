import Image from 'next/image';
import type { ReactNode } from 'react';
import { t } from '@/i18n/ru';

type FloroBrandProps = {
  showWordmark?: boolean;
  showTagline?: boolean;
  variant?: 'light' | 'dark';
  className?: string;
};

const BRAND_ICON_SRC = '/brand/floro-icon.png';

export function FloroLogo({ className = '' }: { className?: string }) {
  return (
    <Image
      src={BRAND_ICON_SRC}
      alt=""
      width={42}
      height={42}
      className={`floro-brand__logo${className ? ` ${className}` : ''}`}
      aria-hidden
      priority
    />
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
      <FloroLogo />
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

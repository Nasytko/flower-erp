'use client';

import type { ReactNode } from 'react';

type CatalogExpandRowProps = {
  expanded: boolean;
  onToggle: () => void;
  title: ReactNode;
  meta?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
};

export function CatalogExpandRow({
  expanded,
  onToggle,
  title,
  meta,
  actions,
  children,
}: CatalogExpandRowProps) {
  return (
    <div className="catalog-expand-row">
      <div className="catalog-expand-row__header">
        <button
          type="button"
          className="catalog-expand-row__toggle"
          onClick={onToggle}
          aria-expanded={expanded}
        >
          <span
            className={`catalog-expand-row__chevron${expanded ? ' catalog-expand-row__chevron--open' : ''}`}
          >
            ▼
          </span>
          <span className="catalog-expand-row__title">{title}</span>
        </button>
        {actions ? <div className="catalog-expand-row__actions">{actions}</div> : null}
      </div>
      {meta ? <div className="catalog-expand-row__meta">{meta}</div> : null}
      {expanded && children ? <div className="catalog-expand-row__body">{children}</div> : null}
    </div>
  );
}

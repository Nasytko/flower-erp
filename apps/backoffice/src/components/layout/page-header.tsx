import type { ReactNode } from 'react';
import type { BreadcrumbItem } from './breadcrumbs';
import { DocRef } from './doc-ref';

type PageHeaderProps = {
  title: string;
  /** System number shown as a small muted note (not in the main title). */
  refCode?: string | null;
  description?: string;
  /** @deprecated Breadcrumbs hidden in UI; prop kept for call-site compatibility. */
  breadcrumbs?: BreadcrumbItem[];
  actions?: ReactNode;
};

export function PageHeader({ title, refCode, description, actions }: PageHeaderProps) {
  return (
    <header className="page-header">
      <div className="page-header__text">
        <div className="page-header__title-row">
          <h1 className="page-header__title">{title}</h1>
          {refCode ? <DocRef className="page-header__ref">{refCode}</DocRef> : null}
        </div>
        {description ? <p className="page-header__description">{description}</p> : null}
      </div>
      {actions ? <div className="page-header__actions">{actions}</div> : null}
    </header>
  );
}

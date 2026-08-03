'use client';

import type { FormEvent, ReactNode } from 'react';
import { Card } from '@flower/ui';
import { EmptyState, ErrorState, LoadingState } from '@/components/layout/states';

type EntityListPanelProps = {
  title?: string;
  count?: number;
  toolbar?: ReactNode;
  footer?: ReactNode;
  loading?: boolean;
  error?: string | null;
  isEmpty?: boolean;
  emptyMessage?: string;
  children?: ReactNode;
};

function panelTitle(title: string | undefined, count: number | undefined): string | undefined {
  if (!title) return undefined;
  if (count === undefined) return title;
  return `${title} · ${count}`;
}

export function EntityListPanel({
  title,
  count,
  toolbar,
  footer,
  loading = false,
  error = null,
  isEmpty = false,
  emptyMessage,
  children,
}: EntityListPanelProps) {
  return (
    <Card title={panelTitle(title, count)}>
      {toolbar ? <div className="entity-list-panel__toolbar">{toolbar}</div> : null}
      {loading ? <LoadingState /> : null}
      {error ? <ErrorState message={error} /> : null}
      {!loading && !error && isEmpty ? (
        <EmptyState message={emptyMessage ?? 'Записей пока нет.'} />
      ) : null}
      {!loading && !error && !isEmpty ? children : null}
      {footer ? <div className="entity-list-panel__footer">{footer}</div> : null}
    </Card>
  );
}

type EntityListFiltersProps = {
  children: ReactNode;
  onSubmit?: (event: FormEvent<HTMLFormElement>) => void;
};

export function EntityListFilters({ children, onSubmit }: EntityListFiltersProps) {
  return (
    <form
      className="entity-list-panel__filters"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit?.(event);
      }}
    >
      {children}
    </form>
  );
}

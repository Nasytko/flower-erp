'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';

export type DataTableColumn<T> = {
  id: string;
  header: ReactNode;
  render: (row: T) => ReactNode;
  className?: string;
  align?: 'left' | 'right' | 'center';
};

type DataTableProps<T> = {
  columns: DataTableColumn<T>[];
  rows: T[];
  getRowKey: (row: T) => string;
  getRowHref?: (row: T) => string | undefined;
  onRowClick?: (row: T) => void;
  renderActions?: (row: T) => ReactNode;
  emptyMessage?: string;
};

export function DataTableCellPrimary({
  title,
  subtitle,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
}) {
  return (
    <div>
      <div className="data-table__primary">{title}</div>
      {subtitle ? <div className="data-table__secondary">{subtitle}</div> : null}
    </div>
  );
}

export function DataTable<T>({
  columns,
  rows,
  getRowKey,
  getRowHref,
  onRowClick,
  renderActions,
  emptyMessage,
}: DataTableProps<T>) {
  if (rows.length === 0) {
    return emptyMessage ? <p className="field__hint">{emptyMessage}</p> : null;
  }

  const hasActions = Boolean(renderActions);

  return (
    <div className="data-table-wrap">
      <table className="data-table">
        <thead>
          <tr>
            {columns.map((column) => (
              <th
                key={column.id}
                className={column.className}
                style={{ textAlign: column.align ?? 'left' }}
              >
                {column.header}
              </th>
            ))}
            {hasActions ? (
              <th className="data-table__actions-head" style={{ textAlign: 'right' }}>
                {' '}
              </th>
            ) : null}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const key = getRowKey(row);
            const href = getRowHref?.(row);
            const clickable = Boolean(href || onRowClick);
            return (
              <tr
                key={key}
                className={clickable ? 'data-table__row--clickable' : undefined}
                onClick={
                  onRowClick
                    ? () => {
                        onRowClick(row);
                      }
                    : undefined
                }
              >
                {columns.map((column, index) => {
                  const content = column.render(row);
                  const cell =
                    href && index === 0 ? (
                      <Link href={href} className="data-table__link">
                        {content}
                      </Link>
                    ) : (
                      content
                    );
                  return (
                    <td
                      key={column.id}
                      className={column.className}
                      style={{ textAlign: column.align ?? 'left' }}
                    >
                      {cell}
                    </td>
                  );
                })}
                {hasActions ? (
                  <td className="data-table__actions" onClick={(event) => event.stopPropagation()}>
                    {renderActions?.(row)}
                  </td>
                ) : null}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

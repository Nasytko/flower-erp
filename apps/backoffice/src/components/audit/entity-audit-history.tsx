'use client';

import { Card } from '@flower/ui';
import { EmptyState } from '@/components/layout/states';
import {
  auditActionLabel,
  formatAuditDiffLines,
  formatAuditWhen,
  getAuditContextLabel,
  type AuditEntry,
} from '@/lib/audit-ui';

type EntityAuditHistoryProps = {
  title?: string;
  entries: AuditEntry[];
  loading?: boolean;
  emptyMessage?: string;
};

export function EntityAuditHistory({
  title = 'История изменений',
  entries,
  loading = false,
  emptyMessage = 'Изменений пока нет.',
}: EntityAuditHistoryProps) {
  return (
    <Card title={title}>
      {loading ? <p className="page-state">Загрузка…</p> : null}
      {!loading && entries.length === 0 ? <EmptyState message={emptyMessage} /> : null}
      {!loading && entries.length > 0 ? (
        <ul className="list-stack audit-history">
          {entries.map((entry) => {
            const diffLines = formatAuditDiffLines(entry.beforeState, entry.afterState);
            const contextLabel = getAuditContextLabel(entry.beforeState, entry.afterState);

            return (
              <li key={entry.id} className="audit-history__row">
                <div className="audit-history__head">
                  <strong>{auditActionLabel(entry.action)}</strong>
                  <span className="audit-history__when">{formatAuditWhen(entry.createdAt)}</span>
                </div>
                <div className="audit-history__meta">
                  {entry.actorDisplayName ? (
                    <span>{entry.actorDisplayName}</span>
                  ) : (
                    <span style={{ color: 'var(--color-muted)' }}>Система</span>
                  )}
                  {entry.reason ? (
                    <span style={{ color: 'var(--color-muted)' }}> · {entry.reason}</span>
                  ) : null}
                </div>
                {contextLabel ? (
                  <p className="audit-history__context">{contextLabel}</p>
                ) : null}
                {diffLines.length > 0 ? (
                  <ul className="audit-history__changes">
                    {diffLines.map((line) => (
                      <li key={line}>{line}</li>
                    ))}
                  </ul>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : null}
    </Card>
  );
}

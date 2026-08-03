'use client';

import { useState } from 'react';
import { Button } from '@flower/ui';
import type { DeletionEntityType } from '@flower/api-client';
import { getApiClient } from '@/lib/api-client';
import { formatApiErrorMessage } from '@/lib/format-api-error';
import { useAuth } from '@/components/auth-provider';

type DeletionRequestButtonProps = {
  organizationId: string;
  entityType: DeletionEntityType;
  entityId: string;
  entityLabel: string;
  storeId?: string;
  disabled?: boolean;
  onRequested?: () => void;
  className?: string;
};

export function DeletionRequestButton({
  organizationId,
  entityType,
  entityId,
  entityLabel,
  storeId,
  disabled = false,
  onRequested,
  className,
}: DeletionRequestButtonProps) {
  const auth = useAuth();
  const [busy, setBusy] = useState(false);

  if (!auth.hasPermission('deletions:request')) {
    return null;
  }

  async function onClick() {
    if (
      !window.confirm(
        `Запросить удаление «${entityLabel}»?\n\nЗапись будет удалена безвозвратно после подтверждения директором или разработчиком.`,
      )
    ) {
      return;
    }
    const reason = window.prompt('Комментарий (необязательно):');
    if (reason === null) return;

    setBusy(true);
    try {
      await getApiClient().createDeletionRequest(organizationId, {
        entityType,
        entityId,
        entityLabel,
        storeId,
        reason: reason.trim() || undefined,
      });
      onRequested?.();
      window.alert('Запрос на удаление отправлен. Директор или разработчик подтвердит его в настройках ERP.');
    } catch (err) {
      window.alert(formatApiErrorMessage(err, 'Не удалось отправить запрос на удаление'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button
      type="button"
      variant="ghost"
      className={className}
      disabled={disabled || busy}
      onClick={() => void onClick()}
    >
      {busy ? 'Отправка…' : 'Удалить'}
    </Button>
  );
}

'use client';

import { useEffect, useState } from 'react';
import { Card } from '@flower/ui';
import type { HealthLiveResponse, HealthReadyResponse } from '@flower/contracts';
import { ApiClientError } from '@flower/api-client';
import { getApiClient } from '@/lib/api-client';
import { ErrorState, LoadingState } from '@/components/layout/states';
import { StatusBadge } from '@/components/layout/status-badge';

type HealthState =
  | { status: 'loading' }
  | { status: 'ok'; live: HealthLiveResponse; ready: HealthReadyResponse }
  | { status: 'error'; message: string };

export function HealthPanel() {
  const [state, setState] = useState<HealthState>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    const client = getApiClient();

    Promise.all([client.getLiveHealth(), client.getReadyHealth()])
      .then(([live, ready]) => {
        if (!cancelled) {
          setState({ status: 'ok', live, ready });
        }
      })
      .catch((error: unknown) => {
        if (cancelled) {
          return;
        }
        const message =
          error instanceof ApiClientError
            ? `${error.code}: ${error.message}`
            : error instanceof Error
              ? error.message
              : 'Неизвестная ошибка';
        setState({ status: 'error', message });
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <Card title="Состояние API">
      {state.status === 'loading' ? <LoadingState message="Проверка API…" /> : null}
      {state.status === 'error' ? (
        <ErrorState title="API недоступен" message={state.message} />
      ) : null}
      {state.status === 'ok' ? (
        <div style={{ display: 'grid', gap: 8, fontSize: 'var(--text-sm)' }}>
          <div className="meta-row">
            <span>Live</span>
            <StatusBadge status={state.live.status} />
          </div>
          <div className="meta-row">
            <span>Ready</span>
            <StatusBadge status={state.ready.status} />
            <span style={{ color: 'var(--color-muted)' }}>
              база данных: {state.ready.checks.database}
            </span>
          </div>
          <div style={{ color: 'var(--color-muted)' }}>{state.ready.timestamp}</div>
        </div>
      ) : null}
    </Card>
  );
}

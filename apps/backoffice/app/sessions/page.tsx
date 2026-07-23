'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/components/auth-provider';
import { getApiClient } from '@/lib/api-client';
import { Button } from '@flower/ui';
import { PageContainer } from '@/components/layout/page-container';
import { PageHeader } from '@/components/layout/page-header';
import { ErrorState, LoadingState } from '@/components/layout/states';
import { StatusBadge } from '@/components/layout/status-badge';

type SessionRow = {
  id: string;
  status: string;
  expiresAt: string;
  lastUsedAt: string;
  revokedAt: string | null;
};

export default function SessionsPage() {
  const auth = useAuth();
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const rows = await getApiClient().listSessions();
      setSessions(rows);
    } catch {
      setError('Не удалось загрузить сессии');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  return (
    <main>
      <PageContainer>
        <PageHeader
          title="Сессии"
          description="Активные и отозванные сессии refresh-токенов"
        />
        {loading ? <LoadingState /> : null}
        {error ? <ErrorState message={error} /> : null}
        <ul className="list-stack">
          {sessions.map((session) => (
            <li key={session.id}>
              <div className="meta-row">
                <StatusBadge status={session.status} />
                <span>последнее использование {new Date(session.lastUsedAt).toLocaleString()}</span>
                <span>истекает {new Date(session.expiresAt).toLocaleString()}</span>
                {session.status === 'ACTIVE' ? (
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() =>
                      void getApiClient()
                        .revokeSession(session.id)
                        .then(() => load())
                    }
                  >
                    Отозвать
                  </Button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
        <div style={{ marginTop: 16 }}>
          <Button type="button" variant="secondary" onClick={() => void getApiClient().logoutAll().then(() => auth.logout())}>
            Выйти на всех устройствах
          </Button>
        </div>
      </PageContainer>
    </main>
  );
}

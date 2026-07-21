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
      setError('Failed to load sessions');
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
        <PageHeader title="Sessions" description="Active and revoked refresh-token sessions" />
        {loading ? <LoadingState /> : null}
        {error ? <ErrorState message={error} /> : null}
        <ul className="list-stack">
          {sessions.map((session) => (
            <li key={session.id}>
              <div className="meta-row">
                <StatusBadge status={session.status} />
                <span>last used {new Date(session.lastUsedAt).toLocaleString()}</span>
                <span>expires {new Date(session.expiresAt).toLocaleString()}</span>
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
                    Revoke
                  </Button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
        <div style={{ marginTop: 16 }}>
          <Button type="button" variant="secondary" onClick={() => void getApiClient().logoutAll().then(() => auth.logout())}>
            Logout all devices
          </Button>
        </div>
      </PageContainer>
    </main>
  );
}

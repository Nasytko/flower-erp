'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { Button, Card, Input } from '@flower/ui';
import { ApiClientError, type CourierProfileDto } from '@flower/api-client';
import { getApiClient } from '@/lib/api-client';
import { useAuth } from '@/components/auth-provider';
import { PageContainer } from '@/components/layout/page-container';
import { PageHeader } from '@/components/layout/page-header';
import { Section } from '@/components/layout/section';
import { EmptyState, ErrorState, LoadingState } from '@/components/layout/states';
import { StatusBadge } from '@/components/layout/status-badge';
import { ConfirmDialog } from '@/components/workspace/workspace-ui';

export default function CouriersPage() {
  const params = useParams<{ organizationId: string; storeId: string }>();
  const auth = useAuth();
  const { organizationId, storeId } = params;
  const base = `/organizations/${organizationId}/stores/${storeId}`;

  const [couriers, setCouriers] = useState<CourierProfileDto[]>([]);
  const [users, setUsers] = useState<
    Array<{ id: string; login: string; displayName: string; membershipId: string }>
  >([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [membershipId, setMembershipId] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [phone, setPhone] = useState('');
  const [vehicleType, setVehicleType] = useState('');
  const [archiveId, setArchiveId] = useState<string | null>(null);

  const canManage = auth.hasPermission('delivery:manage-couriers');
  const canRead = auth.hasPermission('delivery:read') || canManage;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const client = getApiClient();
      const [list, orgUsers] = await Promise.all([
        client.listCouriers(organizationId, storeId),
        canManage ? client.listUsers(organizationId) : Promise.resolve([]),
      ]);
      setCouriers(list);
      setUsers(orgUsers);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Не удалось загрузить курьеров');
    } finally {
      setLoading(false);
    }
  }, [organizationId, storeId, canManage]);

  useEffect(() => {
    if (!canRead) return;
    void load();
  }, [canRead, load]);

  async function onCreate(event: FormEvent) {
    event.preventDefault();
    if (!membershipId || !displayName.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await getApiClient().createCourier(organizationId, storeId, {
        membershipId,
        displayNameSnapshot: displayName.trim(),
        phoneSnapshot: phone.trim() || null,
        vehicleType: vehicleType.trim() || null,
      });
      setMembershipId('');
      setDisplayName('');
      setPhone('');
      setVehicleType('');
      await load();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Не удалось создать');
    } finally {
      setBusy(false);
    }
  }

  if (!canRead) {
    return (
      <main>
        <PageContainer>
          <ErrorState message="Доступ запрещён." />
        </PageContainer>
      </main>
    );
  }

  return (
    <main>
      <PageContainer>
        <PageHeader
          title="Курьеры"
          description="Профили курьеров организации для доставок магазина."
          breadcrumbs={[
            { label: 'Доставка', href: `${base}/deliveries` },
            { label: 'Курьеры' },
          ]}
          actions={
            <Link href={`${base}/deliveries`}>
              <Button type="button" variant="secondary">
                К доставкам
              </Button>
            </Link>
          }
        />

        {loading ? <LoadingState /> : null}
        {error ? <ErrorState message={error} /> : null}

        {canManage ? (
          <Section>
            <Card title="Новый курьер">
              <form className="stack-form" onSubmit={onCreate}>
                <label>
                  Пользователь
                  <select
                    value={membershipId}
                    onChange={(e) => {
                      const id = e.target.value;
                      setMembershipId(id);
                      const user = users.find((u) => u.membershipId === id);
                      if (user) setDisplayName(user.displayName);
                    }}
                    required
                  >
                    <option value="">—</option>
                    {users.map((u) => (
                      <option key={u.membershipId} value={u.membershipId}>
                        {u.displayName} ({u.login})
                      </option>
                    ))}
                  </select>
                </label>
                <Input
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Отображаемое имя"
                  required
                />
                <Input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="Телефон"
                />
                <Input
                  value={vehicleType}
                  onChange={(e) => setVehicleType(e.target.value)}
                  placeholder="Тип ТС"
                />
                <Button type="submit" disabled={busy}>
                  Создать
                </Button>
              </form>
            </Card>
          </Section>
        ) : null}

        <Section>
          <Card title="Список">
            {!loading && couriers.length === 0 ? (
              <EmptyState message="Курьеров пока нет." />
            ) : (
              <ul className="list-stack">
                {couriers.map((c) => (
                  <li key={c.id}>
                    <div className="meta-row">
                      <strong>{c.displayNameSnapshot}</strong>
                      <StatusBadge status={c.status} />
                      <span>{c.status}</span>
                      {c.phoneSnapshot ? <span>{c.phoneSnapshot}</span> : null}
                      {c.vehicleType ? <span>{c.vehicleType}</span> : null}
                      {canManage && c.status !== 'ARCHIVED' ? (
                        <Button
                          type="button"
                          variant="secondary"
                          disabled={busy}
                          onClick={() => setArchiveId(c.id)}
                        >
                          Архив
                        </Button>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </Section>
      </PageContainer>

      <ConfirmDialog
        open={Boolean(archiveId)}
        title="Архивировать курьера?"
        message="Курьер будет помечен как ARCHIVED."
        confirmLabel="Архивировать"
        destructive
        busy={busy}
        onCancel={() => setArchiveId(null)}
        onConfirm={() => {
          if (!archiveId) return;
          const id = archiveId;
          setArchiveId(null);
          setBusy(true);
          void getApiClient()
            .archiveCourier(organizationId, storeId, id)
            .then(() => load())
            .catch((err) =>
              setError(err instanceof ApiClientError ? err.message : 'Не удалось архивировать'),
            )
            .finally(() => setBusy(false));
        }}
      />
    </main>
  );
}

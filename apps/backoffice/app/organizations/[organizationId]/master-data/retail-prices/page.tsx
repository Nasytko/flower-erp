'use client';

import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useParams } from 'next/navigation';
import { Button, Card, Input } from '@flower/ui';
import { getApiClient } from '@/lib/api-client';
import { useAuth } from '@/components/auth-provider';
import { PageContainer } from '@/components/layout/page-container';
import { PageHeader } from '@/components/layout/page-header';
import { Section } from '@/components/layout/section';
import { ErrorState, LoadingState } from '@/components/layout/states';
import { Field } from '@/components/layout/field';
import { addDaysIso, startOfWeekMonday } from '@/lib/retail-price';
import { formatApiErrorMessage } from '@/lib/format-api-error';
import { useToast } from '@/components/ui/toast';

type PriceRow = {
  itemId: string;
  name: string;
  code: string;
  pricingMode: 'UNIT' | 'SERVICE';
  amount: string;
};

export default function RetailPricesPage() {
  const params = useParams<{ organizationId: string }>();
  const auth = useAuth();
  const toast = useToast();
  const organizationId = params.organizationId;
  const base = `/organizations/${organizationId}/master-data`;

  const [weekStart, setWeekStart] = useState(startOfWeekMonday());
  const [flowers, setFlowers] = useState<PriceRow[]>([]);
  const [materials, setMaterials] = useState<PriceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canManage = auth.hasPermission('master-data:manage');

  async function load(week: string) {
    setLoading(true);
    setError(null);
    try {
      const data = await getApiClient().listRetailPrices(organizationId, week);
      setFlowers(
        data.flowers.map((row) => ({
          itemId: row.itemId,
          name: row.name,
          code: row.code,
          pricingMode: row.pricingMode,
          amount: row.amount ?? '',
        })),
      );
      setMaterials(
        data.materials.map((row) => ({
          itemId: row.itemId,
          name: row.name,
          code: row.code,
          pricingMode: row.pricingMode,
          amount: row.amount ?? '',
        })),
      );
    } catch (err) {
      setError(formatApiErrorMessage(err, 'Не удалось загрузить цены'));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load(weekStart);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organizationId, weekStart]);

  const filledCount = useMemo(
    () =>
      [...flowers, ...materials].filter((row) => row.amount.trim() && Number(row.amount) >= 0).length,
    [flowers, materials],
  );

  function shiftWeek(delta: number) {
    setWeekStart(addDaysIso(weekStart, delta * 7));
  }

  function updateAmount(section: 'flowers' | 'materials', itemId: string, amount: string) {
    const setter = section === 'flowers' ? setFlowers : setMaterials;
    setter((rows) => rows.map((row) => (row.itemId === itemId ? { ...row, amount } : row)));
  }

  async function onSave(event: FormEvent) {
    event.preventDefault();
    if (!canManage) return;
    setBusy(true);
    setError(null);
    try {
      const prices = [...flowers, ...materials]
        .filter((row) => row.amount.trim())
        .map((row) => ({ itemId: row.itemId, amount: row.amount.trim() }));
      await getApiClient().upsertRetailPrices(organizationId, {
        effectiveFrom: weekStart,
        prices,
      });
      toast.success('Розничные цены сохранены');
      await load(weekStart);
    } catch (err) {
      const message = formatApiErrorMessage(err, 'Не удалось сохранить');
      setError(message);
      toast.error(message);
    } finally {
      setBusy(false);
    }
  }

  function renderTable(section: 'flowers' | 'materials', rows: PriceRow[], title: string, hint: string) {
    return (
      <Card title={title}>
        <p style={{ margin: '0 0 12px', color: 'var(--color-muted)', fontSize: 'var(--text-sm)' }}>{hint}</p>
        {rows.length === 0 ? (
          <p className="field__hint">Нет активных позиций в справочнике.</p>
        ) : (
          <ul className="list-stack">
            {rows.map((row) => (
              <li key={row.itemId}>
                <div className="meta-row" style={{ alignItems: 'center', gap: 12 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <strong>{row.name}</strong>
                    <span className="field__hint" style={{ display: 'block' }}>
                      {row.code}
                    </span>
                  </div>
                  <Field label={section === 'flowers' ? 'BYN / шт.' : 'BYN / +1'}>
                    <Input
                      value={row.amount}
                      onChange={(e) => updateAmount(section, row.itemId, e.target.value)}
                      inputMode="decimal"
                      placeholder="0.00"
                      disabled={!canManage || busy}
                      aria-label={`Цена ${row.name}`}
                      style={{ width: 120 }}
                    />
                  </Field>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    );
  }

  return (
    <main>
      <PageContainer>
        <PageHeader
          title="Розничные цены"
          description="Цветы — цена за штуку на неделю. Материалы и упаковка — фиксированная услуга (+1)."
          breadcrumbs={[
            { label: 'Организации', href: '/organizations' },
            { label: 'Организация', href: `/organizations/${organizationId}` },
            { label: 'Справочники', href: base },
            { label: 'Розничные цены' },
          ]}
        />

        <Section>
          <Card title="Неделя">
            <div className="meta-row" style={{ flexWrap: 'wrap', gap: 12 }}>
              <Button type="button" variant="secondary" onClick={() => shiftWeek(-1)} disabled={busy}>
                ← Пред.
              </Button>
              <Field label="С понедельника">
                <Input
                  type="date"
                  value={weekStart}
                  onChange={(e) => setWeekStart(e.target.value)}
                  disabled={busy}
                />
              </Field>
              <Button type="button" variant="secondary" onClick={() => shiftWeek(1)} disabled={busy}>
                След. →
              </Button>
              <Button type="button" variant="ghost" onClick={() => setWeekStart(startOfWeekMonday())} disabled={busy}>
                Текущая неделя
              </Button>
            </div>
          </Card>
        </Section>

        {loading ? <LoadingState /> : null}
        {error ? <ErrorState message={error} /> : null}

        {!loading ? (
          <form onSubmit={(e) => void onSave(e)}>
            <Section>{renderTable('flowers', flowers, 'Цветы', 'Розничная цена за штуку.')}</Section>
            <Section>
              {renderTable(
                'materials',
                materials,
                'Материалы и доп. услуги',
                'Лента, упаковка — цена за одно применение (+1). Большой букет: упаковка ×2 = два +1.',
              )}
            </Section>
            {canManage ? (
              <Section>
                <Button type="submit" disabled={busy || filledCount === 0}>
                  Сохранить ({filledCount})
                </Button>
              </Section>
            ) : null}
          </form>
        ) : null}
      </PageContainer>
    </main>
  );
}

'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useParams } from 'next/navigation';
import { Button, Card, Input } from '@flower/ui';
import { getApiClient } from '@/lib/api-client';
import { PageContainer } from '@/components/layout/page-container';
import { PageHeader } from '@/components/layout/page-header';
import { Section } from '@/components/layout/section';
import { EmptyState, ErrorState, LoadingState } from '@/components/layout/states';
import { StatusBadge } from '@/components/layout/status-badge';
import { Field } from '@/components/layout/field';
import { FancySelect } from '@/components/layout/fancy-select';
import { formatApiErrorMessage } from '@/lib/format-api-error';

type Unit = { id: string; name: string; symbol: string; status: string };

export default function UnitsPage() {
  const params = useParams<{ organizationId: string }>();
  const organizationId = params.organizationId;
  const base = `/organizations/${organizationId}/master-data`;

  const [items, setItems] = useState<Unit[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [symbol, setSymbol] = useState('');
  const [quantityScale, setQuantityScale] = useState('0');
  const [creating, setCreating] = useState(false);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await getApiClient().listUnits(organizationId, 1, 100);
      setItems(res.items);
    } catch (err) {
      setError(formatApiErrorMessage(err, 'Не удалось загрузить'));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organizationId]);

  async function onCreate(event: FormEvent) {
    event.preventDefault();
    setCreating(true);
    setError(null);
    try {
      await getApiClient().createUnit(organizationId, {
        name,
        symbol,
        quantityScale: Number(quantityScale),
      });
      setName('');
      setSymbol('');
      setQuantityScale('0');
      await load();
    } catch (err) {
      setError(formatApiErrorMessage(err, 'Не удалось создать'));
    } finally {
      setCreating(false);
    }
  }

  async function onArchive(unitId: string) {
    setError(null);
    try {
      await getApiClient().archiveUnit(organizationId, unitId);
      await load();
    } catch (err) {
      setError(formatApiErrorMessage(err, 'Не удалось архивировать'));
    }
  }

  return (
    <main>
      <PageContainer>
        <PageHeader
          title="Единицы измерения"
          description="Нельзя архивировать единицу, пока она используется товарами."
          breadcrumbs={[
            { label: 'Организации', href: '/organizations' },
            { label: 'Организация', href: `/organizations/${organizationId}` },
            { label: 'Справочники', href: base },
            { label: 'Единицы' },
          ]}
        />
        <Section>
          <Card title="Список">
            {loading ? <LoadingState /> : null}
            {error ? <ErrorState message={error} /> : null}
            {!loading && items.length === 0 ? <EmptyState message="Единиц пока нет." /> : null}
            <ul className="list-stack">
              {items.map((item) => (
                <li key={item.id}>
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      gap: 12,
                      flexWrap: 'wrap',
                      padding: 12,
                      border: '1px solid var(--color-border)',
                      borderRadius: 10,
                      background: 'var(--color-surface)',
                    }}
                  >
                    <div className="meta-row">
                      <strong>
                        {item.name} ({item.symbol})
                      </strong>
                      <StatusBadge status={item.status} />
                    </div>
                    {item.status !== 'ARCHIVED' ? (
                      <Button variant="ghost" onClick={() => void onArchive(item.id)}>
                        Архив
                      </Button>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        </Section>
        <Section>
          <Card title="Создать единицу">
            <form onSubmit={onCreate} className="form-grid">
              <Field label="Название" required hint="Полное название, например «Штука» или «Ветка»">
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  minLength={2}
                  aria-label="Название единицы"
                />
              </Field>
              <Field
                label="Обозначение"
                required
                hint="Короткий символ в документах: шт, ветка, м"
              >
                <Input
                  value={symbol}
                  onChange={(e) => setSymbol(e.target.value)}
                  required
                  aria-label="Символ единицы"
                />
              </Field>
              <Field
                label="Дробность количества"
                required
                hint="Сколько знаков после запятой можно указывать в количестве"
              >
                <FancySelect
                  value={quantityScale}
                  onChange={setQuantityScale}
                  searchable={false}
                  options={[
                    { value: '0', label: 'Только целые (0)' },
                    { value: '1', label: '1 знак после запятой' },
                    { value: '2', label: '2 знака после запятой' },
                    { value: '3', label: '3 знака после запятой' },
                  ]}
                  aria-label="Дробность количества"
                />
              </Field>
              <Button type="submit" disabled={creating}>
                {creating ? 'Создание…' : 'Создать'}
              </Button>
            </form>
          </Card>
        </Section>
      </PageContainer>
    </main>
  );
}

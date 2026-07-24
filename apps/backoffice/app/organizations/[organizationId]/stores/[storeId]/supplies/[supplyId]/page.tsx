'use client';

import Link from 'next/link';
import { useEffect, useState, type FormEvent } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Button, Card, Input } from '@flower/ui';
import { getApiClient } from '@/lib/api-client';
import { PageContainer } from '@/components/layout/page-container';
import { PageHeader } from '@/components/layout/page-header';
import { Section } from '@/components/layout/section';
import { ErrorState, LoadingState } from '@/components/layout/states';
import { StatusBadge } from '@/components/layout/status-badge';
import { AutoNumberNote, Field } from '@/components/layout/field';
import { FancySelect } from '@/components/layout/fancy-select';
import { formatApiErrorMessage } from '@/lib/format-api-error';

type CatalogItem = {
  id: string;
  name: string;
  code: string;
  isPurchasable?: boolean;
};

type Ref = { id: string; name: string; status?: string; itemType?: string };

export default function SupplyDetailPage() {
  const params = useParams<{ organizationId: string; storeId: string; supplyId: string }>();
  const router = useRouter();
  const { organizationId, storeId, supplyId } = params;
  const base = `/organizations/${organizationId}/stores/${storeId}`;

  const [supply, setSupply] = useState<{
    id: string;
    number: string;
    status: string;
    warehouseId: string;
    items: Array<{
      id: string;
      itemId: string;
      orderedQuantity: string;
      item?: { name: string; code: string };
    }>;
  } | null>(null);
  const [receipts, setReceipts] = useState<Array<{ id: string; number: string; status: string }>>(
    [],
  );
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [categories, setCategories] = useState<Ref[]>([]);
  const [units, setUnits] = useState<Ref[]>([]);
  const [policies, setPolicies] = useState<Ref[]>([]);
  const [itemId, setItemId] = useState('');
  const [qty, setQty] = useState('1');
  const [showQuickCreate, setShowQuickCreate] = useState(false);
  const [quickName, setQuickName] = useState('');
  const [quickType, setQuickType] = useState<'FLOWER' | 'MATERIAL'>('FLOWER');
  const [quickCategoryId, setQuickCategoryId] = useState('');
  const [quickUnitId, setQuickUnitId] = useState('');
  const [quickPolicyId, setQuickPolicyId] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function load(selectItemId?: string) {
    setLoading(true);
    setError(null);
    try {
      const client = getApiClient();
      const [s, r, items, cats, unts, pols] = await Promise.all([
        client.getSupply(organizationId, storeId, supplyId),
        client.listGoodsReceipts(organizationId, storeId, supplyId),
        client.listItems(organizationId, { pageSize: 100, status: 'ACTIVE' }),
        client.listCategories(organizationId, 1, 100),
        client.listUnits(organizationId, 1, 100),
        client.listPolicies(organizationId, 1, 100),
      ]);
      setSupply(s);
      setReceipts(r);
      const purchasable = items.items.filter((item) => item.isPurchasable !== false);
      setCatalog(purchasable);
      setItemId((current) => {
        if (selectItemId && purchasable.some((item) => item.id === selectItemId)) {
          return selectItemId;
        }
        if (current && purchasable.some((item) => item.id === current)) {
          return current;
        }
        return purchasable[0]?.id ?? '';
      });
      const activeCats = cats.items.filter((c) => c.status === 'ACTIVE');
      const activeUnits = unts.items.filter((u) => u.status === 'ACTIVE');
      const activePolicies = pols.items.filter((p) => p.status === 'ACTIVE');
      setCategories(activeCats);
      setUnits(activeUnits);
      setPolicies(activePolicies);
      setQuickCategoryId((current) => current || activeCats[0]?.id || '');
      setQuickUnitId((current) => current || activeUnits[0]?.id || '');
    } catch (err) {
      setError(formatApiErrorMessage(err, 'Не удалось загрузить'));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organizationId, storeId, supplyId]);

  useEffect(() => {
    const match = policies.find((p) => p.itemType === quickType);
    if (match) setQuickPolicyId(match.id);
  }, [quickType, policies]);

  async function onAddItem(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await getApiClient().addSupplyItem(organizationId, storeId, supplyId, {
        itemId,
        orderedQuantity: qty,
      });
      setQty('1');
      await load();
    } catch (err) {
      setError(formatApiErrorMessage(err, 'Не удалось добавить позицию'));
    } finally {
      setBusy(false);
    }
  }

  async function onQuickCreate(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const created = await getApiClient().createItem(organizationId, {
        name: quickName,
        itemType: quickType,
        categoryId: quickCategoryId,
        unitId: quickUnitId,
        inventoryPolicyId: quickPolicyId,
        isPurchasable: true,
        isSellable: false,
      });
      setQuickName('');
      setShowQuickCreate(false);
      await load(created.id);
    } catch (err) {
      setError(formatApiErrorMessage(err, 'Не удалось создать товар'));
    } finally {
      setBusy(false);
    }
  }

  async function onSubmit() {
    setBusy(true);
    setError(null);
    try {
      await getApiClient().submitSupply(organizationId, storeId, supplyId);
      await load();
    } catch (err) {
      setError(formatApiErrorMessage(err, 'Не удалось отправить'));
    } finally {
      setBusy(false);
    }
  }

  async function onCreateReceipt() {
    setBusy(true);
    setError(null);
    try {
      const receipt = await getApiClient().createGoodsReceipt(organizationId, storeId, supplyId, {
        receivedAt: new Date().toISOString(),
      });
      router.push(`${base}/supplies/${supplyId}/receipts/${receipt.id}`);
    } catch (err) {
      setError(formatApiErrorMessage(err, 'Не удалось создать приёмку'));
      setBusy(false);
    }
  }

  const draft = supply?.status === 'DRAFT';
  const receivable =
    supply?.status === 'SUBMITTED_TO_SUPPLIER' || supply?.status === 'PARTIALLY_RECEIVED';

  return (
    <main>
      <PageContainer>
        <PageHeader
          title={supply?.number ?? 'Поставка'}
          description="Черновик поставки: добавьте позиции из справочника или создайте новый товар."
          breadcrumbs={[
            { label: 'Организации', href: '/organizations' },
            { label: 'Магазин', href: base },
            { label: 'Поставки', href: `${base}/supplies` },
            { label: supply?.number ?? 'Поставка' },
          ]}
          actions={supply ? <StatusBadge status={supply.status} /> : undefined}
        />
        {loading ? <LoadingState /> : null}
        {error ? <ErrorState message={error} /> : null}
        {supply ? (
          <>
            <Section>
              <Card title="Позиции">
                <ul className="list-stack">
                  {supply.items.map((line) => (
                    <li key={line.id}>
                      <div className="meta-row">
                        <strong>
                          {line.item?.name ?? line.itemId} ({line.item?.code})
                        </strong>
                        <span>Заказано: {line.orderedQuantity}</span>
                      </div>
                    </li>
                  ))}
                </ul>
                {draft ? (
                  <>
                    <form onSubmit={onAddItem} className="form-grid" style={{ marginTop: 16 }}>
                      <Field label="Товар" required hint="Выберите из справочника или создайте новый ниже">
                        <FancySelect
                          value={itemId}
                          onChange={setItemId}
                          options={catalog.map((item) => ({
                            value: item.id,
                            label: item.name,
                            hint: item.code,
                          }))}
                          required
                          aria-label="Товар"
                        />
                      </Field>
                      <Field label="Количество" required>
                        <Input
                          value={qty}
                          onChange={(e) => setQty(e.target.value)}
                          aria-label="Заказанное количество"
                          required
                        />
                      </Field>
                      <Button type="submit" disabled={busy || !itemId}>
                        Добавить позицию
                      </Button>
                      <Button
                        type="button"
                        variant="secondary"
                        disabled={busy}
                        onClick={() => setShowQuickCreate((v) => !v)}
                      >
                        {showQuickCreate ? 'Скрыть создание товара' : 'Новый товар в справочник'}
                      </Button>
                    </form>

                    {showQuickCreate ? (
                      <form
                        onSubmit={onQuickCreate}
                        className="form-grid"
                        style={{
                          marginTop: 16,
                          padding: 16,
                          border: '1px solid var(--color-border)',
                          borderRadius: 10,
                          background: 'var(--color-surface)',
                        }}
                      >
                        <p
                          style={{
                            margin: 0,
                            gridColumn: '1 / -1',
                            fontSize: 'var(--text-sm)',
                            color: 'var(--color-muted)',
                          }}
                        >
                          Быстрое создание товара для этой поставки. Код присвоится автоматически;
                          в карточке сохранится, кто и когда добавил.
                        </p>
                        <AutoNumberNote label="Код товара" />
                        <Field label="Название" required>
                          <Input
                            value={quickName}
                            onChange={(e) => setQuickName(e.target.value)}
                            required
                            minLength={2}
                            aria-label="Название нового товара"
                          />
                        </Field>
                        <Field label="Тип" required>
                          <FancySelect
                            value={quickType}
                            onChange={(value) => setQuickType(value as 'FLOWER' | 'MATERIAL')}
                            searchable={false}
                            options={[
                              { value: 'FLOWER', label: 'Цветок' },
                              { value: 'MATERIAL', label: 'Материал' },
                            ]}
                            aria-label="Тип нового товара"
                          />
                        </Field>
                        <Field label="Категория" required>
                          <FancySelect
                            value={quickCategoryId}
                            onChange={setQuickCategoryId}
                            options={categories.map((c) => ({ value: c.id, label: c.name }))}
                            required
                            aria-label="Категория нового товара"
                          />
                        </Field>
                        <Field label="Единица измерения" required>
                          <FancySelect
                            value={quickUnitId}
                            onChange={setQuickUnitId}
                            options={units.map((u) => ({ value: u.id, label: u.name }))}
                            required
                            aria-label="Единица нового товара"
                          />
                        </Field>
                        <Field label="Политика учёта" required>
                          <FancySelect
                            value={quickPolicyId}
                            onChange={setQuickPolicyId}
                            options={policies
                              .filter((p) => p.itemType === quickType)
                              .map((p) => ({ value: p.id, label: p.name }))}
                            required
                            aria-label="Политика нового товара"
                          />
                        </Field>
                        <Button
                          type="submit"
                          disabled={
                            busy ||
                            !quickName.trim() ||
                            !quickCategoryId ||
                            !quickUnitId ||
                            !quickPolicyId
                          }
                        >
                          Создать товар
                        </Button>
                      </form>
                    ) : null}
                  </>
                ) : null}
              </Card>
            </Section>
            <Section>
              <div className="page-header__actions">
                {draft ? (
                  <Button
                    type="button"
                    disabled={busy || supply.items.length === 0}
                    onClick={() => void onSubmit()}
                  >
                    Отправить поставщику
                  </Button>
                ) : null}
                {receivable ? (
                  <Button type="button" disabled={busy} onClick={() => void onCreateReceipt()}>
                    Создать приёмку
                  </Button>
                ) : null}
                <Link href={`${base}/warehouses/${supply.warehouseId}/inventory`}>
                  <Button type="button" variant="secondary">
                    Остатки склада
                  </Button>
                </Link>
              </div>
            </Section>
            <Section>
              <Card title="Приёмки">
                <ul className="list-stack">
                  {receipts.map((r) => (
                    <li key={r.id}>
                      <Link href={`${base}/supplies/${supplyId}/receipts/${r.id}`}>
                        <div className="meta-row">
                          <strong>{r.number}</strong>
                          <StatusBadge status={r.status} />
                        </div>
                      </Link>
                    </li>
                  ))}
                </ul>
              </Card>
            </Section>
          </>
        ) : null}
      </PageContainer>
    </main>
  );
}

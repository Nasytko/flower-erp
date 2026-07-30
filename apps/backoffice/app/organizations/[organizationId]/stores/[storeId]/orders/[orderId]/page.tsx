'use client';

import Link from 'next/link';
import { useEffect, useState, type FormEvent } from 'react';
import { useParams } from 'next/navigation';
import { Button, Card, Input } from '@flower/ui';
import { ApiClientError } from '@flower/api-client';
import { getApiClient } from '@/lib/api-client';
import { useAuth } from '@/components/auth-provider';
import { Field } from '@/components/layout/field';
import { AddressAutocomplete } from '@/components/layout/address-autocomplete';
import { ReadyAtField } from '@/components/layout/ready-at-field';
import { PageContainer } from '@/components/layout/page-container';
import { PageHeader } from '@/components/layout/page-header';
import { Section } from '@/components/layout/section';
import { ErrorState, LoadingState } from '@/components/layout/states';
import { formatApiErrorMessage } from '@/lib/format-api-error';
import {
  type FieldErrors,
  firstFieldError,
  hasFieldErrors,
  requiredText,
} from '@/lib/form-validation';
import {
  combineDateAndTime,
  isOrderHeaderEditable,
  splitReadyAt,
} from '@/lib/order-ui';
import {
  customCompositionItemsFromMap,
  OrderCompositionSection,
  type OrderCompositionMode,
} from '@/components/order/order-composition-section';

type OrderDetail = Awaited<ReturnType<ReturnType<typeof getApiClient>['getOrder']>>;

function compositionToMap(
  items: Array<{ itemId: string; plannedQuantity: string }>,
): Map<string, number> {
  const map = new Map<string, number>();
  for (const line of items) {
    const qty = Number(line.plannedQuantity) || 0;
    if (qty <= 0) continue;
    map.set(line.itemId, (map.get(line.itemId) ?? 0) + qty);
  }
  return map;
}

export default function OrderDetailPage() {
  const params = useParams<{ organizationId: string; storeId: string; orderId: string }>();
  const auth = useAuth();
  const { organizationId, storeId, orderId } = params;
  const base = `/organizations/${organizationId}/stores/${storeId}`;
  const calendarHref = `${base}/orders/calendar`;

  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [orderType, setOrderType] = useState<'PICKUP' | 'DELIVERY'>('PICKUP');
  const [recipientName, setRecipientName] = useState('');
  const [recipientPhone, setRecipientPhone] = useState('');
  const [readyDate, setReadyDate] = useState('');
  const [readyTime, setReadyTime] = useState('12:00');
  const [comment, setComment] = useState('');
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [deliveryCity, setDeliveryCity] = useState('');
  const [deliveryApartment, setDeliveryApartment] = useState('');
  const [deliveryComment, setDeliveryComment] = useState('');
  const [compositionMode, setCompositionMode] = useState<OrderCompositionMode>('CUSTOM');
  const [showcaseBouquetId, setShowcaseBouquetId] = useState('');
  const [customQtyByItem, setCustomQtyByItem] = useState<Map<string, number>>(() => new Map());
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const detail = await getApiClient().getOrder(organizationId, storeId, orderId);
      setOrder(detail);
      setOrderType(detail.type === 'DELIVERY' ? 'DELIVERY' : 'PICKUP');
      setRecipientName(detail.recipientName ?? '');
      setRecipientPhone(detail.recipientPhone ?? '');
      setComment(detail.comment ?? '');
      const { date, time } = splitReadyAt(detail.readyAt);
      setReadyDate(date);
      setReadyTime(time);
      setCustomQtyByItem(compositionToMap(detail.composition?.items ?? []));
      setCompositionMode('CUSTOM');

      if (detail.type === 'DELIVERY') {
        const deliveries = await getApiClient().listDeliveries(organizationId, storeId);
        const linked = deliveries.find(
          (row) => row.orderId === orderId && row.status !== 'CANCELLED',
        );
        if (linked) {
          const full = await getApiClient().getDelivery(organizationId, storeId, linked.id);
          setDeliveryAddress(full.addressLine || '');
          setDeliveryCity(full.city || '');
          setDeliveryApartment(full.apartment || '');
          setDeliveryComment(full.deliveryComment || '');
        }
      }
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Не удалось загрузить заказ');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!auth.hasPermission('orders:read')) return;
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organizationId, storeId, orderId, auth]);

  const editable = order ? isOrderHeaderEditable(order.status) : false;
  const canUpdate = editable && auth.hasPermission('orders:update');

  function validateSave(): FieldErrors {
    const errors: FieldErrors = {
      recipientName: requiredText(recipientName, 'Укажите имя'),
      readyDate: requiredText(readyDate, 'Укажите дату'),
      readyTime: requiredText(readyTime, 'Укажите время'),
    };
    if (orderType === 'DELIVERY') {
      errors.deliveryAddress = requiredText(deliveryAddress, 'Укажите адрес доставки');
    }
    if (compositionMode === 'SHOWCASE' && !showcaseBouquetId) {
      errors.showcaseBouquet = 'Выберите букет';
    }
    if (
      compositionMode === 'CUSTOM' &&
      customCompositionItemsFromMap(customQtyByItem).length === 0
    ) {
      errors.composition = 'Добавьте цветы или услуги';
    }
    return errors;
  }

  async function onSave(event: FormEvent) {
    event.preventDefault();
    if (!canUpdate) return;
    const errors = validateSave();
    setFieldErrors(errors);
    if (hasFieldErrors(errors)) {
      setError(firstFieldError(errors));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const client = getApiClient();
      await client.updateOrder(organizationId, storeId, orderId, {
        type: orderType,
        recipientName: recipientName.trim(),
        recipientPhone: recipientPhone.trim() || null,
        comment: comment.trim() || null,
        readyAt: combineDateAndTime(readyDate, readyTime),
        deliveryAddressLine: orderType === 'DELIVERY' ? deliveryAddress.trim() : null,
        deliveryCity: orderType === 'DELIVERY' ? deliveryCity.trim() || null : null,
        deliveryApartment: orderType === 'DELIVERY' ? deliveryApartment.trim() || null : null,
        deliveryComment: orderType === 'DELIVERY' ? deliveryComment.trim() || null : null,
      });

      if (compositionMode === 'SHOWCASE' && showcaseBouquetId) {
        const hasComposition = (order?.composition?.items.length ?? 0) > 0;
        if (!hasComposition || window.confirm('Заменить текущий состав букетом с витрины?')) {
          await client.applyOrderCompositionTemplate(organizationId, storeId, orderId, {
            templateItemId: showcaseBouquetId,
          });
        }
      } else if (compositionMode === 'CUSTOM') {
        await client.setOrderComposition(organizationId, storeId, orderId, {
          items: customCompositionItemsFromMap(customQtyByItem),
        });
      }

      await load();
    } catch (err) {
      setError(formatApiErrorMessage(err, 'Не удалось сохранить'));
    } finally {
      setBusy(false);
    }
  }

  async function onCancel() {
    if (!window.confirm('Отменить заказ?')) return;
    setBusy(true);
    setError(null);
    try {
      await getApiClient().cancelOrder(organizationId, storeId, orderId);
      await load();
    } catch (err) {
      setError(formatApiErrorMessage(err, 'Не удалось отменить заказ'));
    } finally {
      setBusy(false);
    }
  }

  if (!auth.hasPermission('orders:read')) {
    return <p className="page-state">Доступ запрещён</p>;
  }

  return (
    <main>
      <PageContainer>
        <PageHeader
          title={order?.recipientName?.trim() || 'Заказ'}
          refCode={order?.number}
          breadcrumbs={[
            { label: 'Магазин', href: base },
            { label: 'Заказы', href: calendarHref },
            { label: order?.recipientName?.trim() || 'Карточка' },
          ]}
          actions={
            <div className="page-header__actions">
              {order?.status === 'READY' && auth.hasPermission('sales:create') ? (
                <Link href={`${base}/sales/new?fromOrder=${orderId}`}>
                  <Button type="button">Оформить продажу</Button>
                </Link>
              ) : null}
              <Link href={calendarHref}>
                <Button type="button" variant="secondary">
                  К календарю
                </Button>
              </Link>
            </div>
          }
        />

        {loading ? <LoadingState /> : null}
        {error ? <ErrorState message={error} /> : null}

        {order && !loading ? (
          <Section>
            <form onSubmit={onSave} className="stack-form order-essentials-form" noValidate>
              <Card title="Контакт">
                <div className="sale-custom-meta">
                  <Field label="Имя" required error={fieldErrors.recipientName}>
                    <Input
                      value={recipientName}
                      onChange={(e) => {
                        setRecipientName(e.target.value);
                        if (fieldErrors.recipientName) {
                          setFieldErrors((prev) => ({ ...prev, recipientName: undefined }));
                        }
                      }}
                      disabled={!canUpdate || busy}
                      required
                    />
                  </Field>
                  <Field label="Телефон">
                    <Input
                      value={recipientPhone}
                      onChange={(e) => setRecipientPhone(e.target.value)}
                      inputMode="tel"
                      disabled={!canUpdate || busy}
                    />
                  </Field>
                </div>
              </Card>

              <Card title="Получение">
                <div className="sale-mode" role="tablist" aria-label="Способ получения">
                  <button
                    type="button"
                    role="tab"
                    aria-selected={orderType === 'PICKUP'}
                    className={`sale-mode__card${orderType === 'PICKUP' ? ' sale-mode__card--active' : ''}`}
                    onClick={() => canUpdate && setOrderType('PICKUP')}
                    disabled={!canUpdate || busy}
                  >
                    <span className="sale-mode__title">Самовывоз</span>
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={orderType === 'DELIVERY'}
                    className={`sale-mode__card${orderType === 'DELIVERY' ? ' sale-mode__card--active' : ''}`}
                    onClick={() => canUpdate && setOrderType('DELIVERY')}
                    disabled={!canUpdate || busy}
                  >
                    <span className="sale-mode__title">Доставка</span>
                  </button>
                </div>

                <Field
                  label={orderType === 'DELIVERY' ? 'Когда доставить' : 'Когда готов'}
                  required
                  error={fieldErrors.readyDate || fieldErrors.readyTime}
                >
                  <ReadyAtField
                    date={readyDate}
                    time={readyTime}
                    onDateChange={setReadyDate}
                    onTimeChange={setReadyTime}
                    disabled={!canUpdate || busy}
                    required
                  />
                </Field>

                {orderType === 'DELIVERY' ? (
                  <>
                    <Field label="Адрес" required error={fieldErrors.deliveryAddress}>
                      <AddressAutocomplete
                        organizationId={organizationId}
                        storeId={storeId}
                        value={deliveryAddress}
                        onChange={setDeliveryAddress}
                        onSelect={(hit) => {
                          if (hit.city) setDeliveryCity(hit.city);
                        }}
                        city={deliveryCity || undefined}
                        disabled={!canUpdate || busy}
                        required
                      />
                    </Field>
                    <div className="sale-custom-meta">
                      <Field label="Квартира / офис">
                        <Input
                          value={deliveryApartment}
                          onChange={(e) => setDeliveryApartment(e.target.value)}
                          disabled={!canUpdate || busy}
                        />
                      </Field>
                      <Field label="Город">
                        <Input
                          value={deliveryCity}
                          onChange={(e) => setDeliveryCity(e.target.value)}
                          disabled={!canUpdate || busy}
                        />
                      </Field>
                    </div>
                    <Field label="Пометка для курьера">
                      <Input
                        value={deliveryComment}
                        onChange={(e) => setDeliveryComment(e.target.value)}
                        disabled={!canUpdate || busy}
                      />
                    </Field>
                  </>
                ) : null}
              </Card>

              <Card title="Состав">
                <OrderCompositionSection
                  organizationId={organizationId}
                  storeId={storeId}
                  mode={compositionMode}
                  onModeChange={setCompositionMode}
                  showcaseBouquetId={showcaseBouquetId}
                  onShowcaseBouquetIdChange={setShowcaseBouquetId}
                  customQtyByItem={customQtyByItem}
                  onCustomQtyChange={(itemId, qty) => {
                    setCustomQtyByItem((prev) => {
                      const next = new Map(prev);
                      if (qty <= 0) next.delete(itemId);
                      else next.set(itemId, qty);
                      return next;
                    });
                  }}
                  disabled={!canUpdate || busy}
                  showcaseError={fieldErrors.showcaseBouquet}
                  reservedLines={!canUpdate ? order.composition?.items : undefined}
                />
                {fieldErrors.composition ? (
                  <p className="field__error">{fieldErrors.composition}</p>
                ) : null}
              </Card>

              <Card title="Комментарий">
                <Field label="Пожелания и пометки">
                  <Input
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                    disabled={!canUpdate || busy}
                  />
                </Field>
              </Card>

              {canUpdate ? (
                <Button type="submit" disabled={busy}>
                  {busy ? 'Сохранение…' : 'Сохранить'}
                </Button>
              ) : (
                <p className="field__hint">Заказ закрыт для редактирования.</p>
              )}

              {order.status !== 'COMPLETED' &&
              order.status !== 'CANCELLED' &&
              auth.hasPermission('orders:cancel') ? (
                <Button type="button" variant="ghost" disabled={busy} onClick={() => void onCancel()}>
                  Отменить заказ
                </Button>
              ) : null}
            </form>
          </Section>
        ) : null}
      </PageContainer>
    </main>
  );
}

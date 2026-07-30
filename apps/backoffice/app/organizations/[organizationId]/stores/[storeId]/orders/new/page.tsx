'use client';

import Link from 'next/link';
import { useEffect, useState, type FormEvent } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Button, Card, Input } from '@flower/ui';
import { getApiClient } from '@/lib/api-client';
import { useAuth } from '@/components/auth-provider';
import { Field } from '@/components/layout/field';
import { AddressAutocomplete } from '@/components/layout/address-autocomplete';
import { defaultReadyDate, ReadyAtField } from '@/components/layout/ready-at-field';
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
import { combineDateAndTime } from '@/lib/order-ui';
import {
  customCompositionItemsFromMap,
  OrderCompositionSection,
  type OrderCompositionMode,
} from '@/components/order/order-composition-section';

export default function NewOrderPage() {
  const params = useParams<{ organizationId: string; storeId: string }>();
  const router = useRouter();
  const auth = useAuth();
  const { organizationId, storeId } = params;
  const base = `/organizations/${organizationId}/stores/${storeId}`;
  const calendarHref = `${base}/orders/calendar`;

  const [orderType, setOrderType] = useState<'PICKUP' | 'DELIVERY'>('PICKUP');
  const [recipientName, setRecipientName] = useState('');
  const [recipientPhone, setRecipientPhone] = useState('');
  const [readyDate, setReadyDate] = useState(defaultReadyDate);
  const [readyTime, setReadyTime] = useState('12:00');
  const [comment, setComment] = useState('');
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [deliveryCity, setDeliveryCity] = useState('');
  const [deliveryApartment, setDeliveryApartment] = useState('');
  const [deliveryComment, setDeliveryComment] = useState('');
  const [storeCity, setStoreCity] = useState('');
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [compositionMode, setCompositionMode] = useState<OrderCompositionMode>('SHOWCASE');
  const [showcaseBouquetId, setShowcaseBouquetId] = useState('');
  const [customQtyByItem, setCustomQtyByItem] = useState<Map<string, number>>(() => new Map());

  const canCreate = auth.hasPermission('orders:create');

  useEffect(() => {
    if (!auth.hasPermission('orders:read')) return;
    let cancelled = false;
    void getApiClient()
      .getStore(organizationId, storeId)
      .then((store) => {
        if (!cancelled) setStoreCity(store.city?.trim() || '');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [organizationId, storeId, auth]);

  function validateCreate(): FieldErrors {
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
    if (compositionMode === 'CUSTOM' && customCompositionItemsFromMap(customQtyByItem).length === 0) {
      errors.composition = 'Добавьте цветы или услуги';
    }
    return errors;
  }

  async function onCreate(event: FormEvent) {
    event.preventDefault();
    const errors = validateCreate();
    setFieldErrors(errors);
    if (hasFieldErrors(errors)) {
      setError(firstFieldError(errors));
      return;
    }
    setCreating(true);
    setError(null);
    try {
      const client = getApiClient();
      const created = await client.createOrder(organizationId, storeId, {
        type: orderType,
        occasion: 'OTHER',
        recipientName: recipientName.trim(),
        recipientPhone: recipientPhone.trim() || undefined,
        readyAt: combineDateAndTime(readyDate, readyTime),
        comment: comment.trim() || undefined,
        deliveryAddressLine:
          orderType === 'DELIVERY' ? deliveryAddress.trim() : undefined,
        deliveryCity:
          orderType === 'DELIVERY' ? deliveryCity.trim() || undefined : undefined,
        deliveryApartment:
          orderType === 'DELIVERY' ? deliveryApartment.trim() || undefined : undefined,
        deliveryComment:
          orderType === 'DELIVERY' ? deliveryComment.trim() || undefined : undefined,
      });

      if (compositionMode === 'SHOWCASE' && showcaseBouquetId) {
        await client.applyOrderCompositionTemplate(organizationId, storeId, created.id, {
          templateItemId: showcaseBouquetId,
        });
      } else {
        const items = customCompositionItemsFromMap(customQtyByItem);
        if (items.length > 0) {
          await client.setOrderComposition(organizationId, storeId, created.id, { items });
        }
      }

      router.push(`${base}/orders/${created.id}`);
    } catch (err) {
      setError(formatApiErrorMessage(err, 'Не удалось создать заказ'));
      setCreating(false);
    }
  }

  if (!auth.hasPermission('orders:read')) {
    return <p className="page-state">Доступ запрещён</p>;
  }

  if (!canCreate) {
    return (
      <main>
        <PageContainer>
          <ErrorState message="Доступ запрещён: требуется orders:create." />
        </PageContainer>
      </main>
    );
  }

  return (
    <main>
      <PageContainer>
        <PageHeader
          title="Новый заказ"
          breadcrumbs={[
            { label: 'Магазин', href: base },
            { label: 'Заказы', href: calendarHref },
            { label: 'Новый заказ' },
          ]}
          actions={
            <Link href={calendarHref}>
              <Button type="button" variant="secondary">
                К календарю
              </Button>
            </Link>
          }
        />

        {loading ? <LoadingState /> : null}
        {error ? <ErrorState message={error} /> : null}

        {!loading ? (
          <Section>
            <form onSubmit={onCreate} className="stack-form order-essentials-form" noValidate>
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
                      placeholder="Анна"
                      required
                    />
                  </Field>
                  <Field label="Телефон">
                    <Input
                      value={recipientPhone}
                      onChange={(e) => setRecipientPhone(e.target.value)}
                      placeholder="+375 …"
                      inputMode="tel"
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
                    onClick={() => setOrderType('PICKUP')}
                  >
                    <span className="sale-mode__title">Самовывоз</span>
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={orderType === 'DELIVERY'}
                    className={`sale-mode__card${orderType === 'DELIVERY' ? ' sale-mode__card--active' : ''}`}
                    onClick={() => setOrderType('DELIVERY')}
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
                    onDateChange={(value) => {
                      setReadyDate(value);
                      if (fieldErrors.readyDate) {
                        setFieldErrors((prev) => ({ ...prev, readyDate: undefined }));
                      }
                    }}
                    onTimeChange={(value) => {
                      setReadyTime(value);
                      if (fieldErrors.readyTime) {
                        setFieldErrors((prev) => ({ ...prev, readyTime: undefined }));
                      }
                    }}
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
                        onChange={(value) => {
                          setDeliveryAddress(value);
                          if (fieldErrors.deliveryAddress) {
                            setFieldErrors((prev) => ({ ...prev, deliveryAddress: undefined }));
                          }
                        }}
                        onSelect={(hit) => {
                          if (hit.city) setDeliveryCity(hit.city);
                        }}
                        city={deliveryCity || storeCity || undefined}
                        placeholder="ул. Независимости, 10"
                        required
                      />
                    </Field>
                    <div className="sale-custom-meta">
                      <Field label="Квартира / офис">
                        <Input
                          value={deliveryApartment}
                          onChange={(e) => setDeliveryApartment(e.target.value)}
                          placeholder="12"
                        />
                      </Field>
                      <Field
                        label="Город"
                        tooltip={
                          storeCity
                            ? `Если пусто — город магазина: ${storeCity}`
                            : 'Если пусто — город магазина'
                        }
                      >
                        <Input
                          value={deliveryCity}
                          onChange={(e) => setDeliveryCity(e.target.value)}
                          placeholder={storeCity || 'Как у магазина'}
                        />
                      </Field>
                    </div>
                    <Field label="Пометка для курьера">
                      <Input
                        value={deliveryComment}
                        onChange={(e) => setDeliveryComment(e.target.value)}
                        placeholder="Подъезд, домофон, оставить у двери"
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
                    if (fieldErrors.composition) {
                      setFieldErrors((prev) => ({ ...prev, composition: undefined }));
                    }
                  }}
                  showcaseError={fieldErrors.showcaseBouquet}
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
                    placeholder="Особенности, пожелания клиента"
                  />
                </Field>
              </Card>

              <Button type="submit" disabled={creating}>
                {creating ? 'Сохранение…' : 'Сохранить заказ'}
              </Button>
            </form>
          </Section>
        ) : null}
      </PageContainer>
    </main>
  );
}

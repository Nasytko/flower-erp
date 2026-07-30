'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Button, Card, Input } from '@flower/ui';
import { getApiClient } from '@/lib/api-client';
import { useAuth } from '@/components/auth-provider';
import { Field } from '@/components/layout/field';
import { AddressAutocomplete } from '@/components/layout/address-autocomplete';
import { FancySelect } from '@/components/layout/fancy-select';
import { MoneyBynInput, parseBynToApi } from '@/components/layout/money-byn-input';
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

type CustomerOption = { id: string; name: string; phone: string; status: string };

type ShowcaseBouquet = {
  id: string;
  name: string;
  code: string;
  previewLines: Array<{ componentName: string; quantity: string }>;
  previewMoreCount: number;
};

type CompositionMode = 'SHOWCASE' | 'MANUAL';

export default function NewOrderPage() {
  const params = useParams<{ organizationId: string; storeId: string }>();
  const router = useRouter();
  const auth = useAuth();
  const { organizationId, storeId } = params;
  const base = `/organizations/${organizationId}/stores/${storeId}`;
  const calendarHref = `${base}/orders/calendar`;

  const [customers, setCustomers] = useState<CustomerOption[]>([]);
  const [orderType, setOrderType] = useState<'PICKUP' | 'DELIVERY'>('PICKUP');
  const [customerId, setCustomerId] = useState('');
  const [recipientName, setRecipientName] = useState('');
  const [recipientPhone, setRecipientPhone] = useState('');
  const [readyDate, setReadyDate] = useState(defaultReadyDate);
  const [readyTime, setReadyTime] = useState('12:00');
  const [comment, setComment] = useState('');
  const [plannedPrice, setPlannedPrice] = useState('');
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [deliveryCity, setDeliveryCity] = useState('');
  const [deliveryApartment, setDeliveryApartment] = useState('');
  const [deliveryComment, setDeliveryComment] = useState('');
  const [storeCity, setStoreCity] = useState('');
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [compositionMode, setCompositionMode] = useState<CompositionMode>('MANUAL');
  const [showcaseBouquets, setShowcaseBouquets] = useState<ShowcaseBouquet[]>([]);
  const [showcaseBouquetId, setShowcaseBouquetId] = useState('');

  const canCreate = auth.hasPermission('orders:create');

  useEffect(() => {
    if (!auth.hasPermission('orders:read')) return;
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const client = getApiClient();
        const [customerList, store, bouquets] = await Promise.all([
          auth.hasPermission('customers:read')
            ? client.listCustomers(organizationId)
            : Promise.resolve([] as CustomerOption[]),
          client.getStore(organizationId, storeId),
          auth.hasPermission('master-data:read')
            ? client.listShowcaseBouquets(organizationId)
            : Promise.resolve([] as ShowcaseBouquet[]),
        ]);
        if (cancelled) return;
        setCustomers(customerList.filter((c) => c.status === 'ACTIVE'));
        setStoreCity(store.city?.trim() || '');
        setShowcaseBouquets(bouquets);
        if (bouquets[0]) {
          setShowcaseBouquetId(bouquets[0]!.id);
        }
      } catch (err) {
        if (!cancelled) {
          setError(formatApiErrorMessage(err, 'Не удалось загрузить данные'));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [organizationId, storeId, auth]);

  const selectedShowcase = useMemo(
    () => showcaseBouquets.find((item) => item.id === showcaseBouquetId) ?? null,
    [showcaseBouquets, showcaseBouquetId],
  );

  function validateCreate(): FieldErrors {
    const errors: FieldErrors = {
      recipientName: requiredText(recipientName, 'Укажите получателя'),
      readyDate: requiredText(readyDate, 'Укажите дату'),
      readyTime: requiredText(readyTime, 'Укажите время'),
    };
    if (orderType === 'DELIVERY') {
      errors.deliveryAddress = requiredText(deliveryAddress, 'Укажите адрес доставки');
    }
    if (compositionMode === 'SHOWCASE' && !showcaseBouquetId) {
      errors.showcaseBouquet = 'Выберите букет с витрины';
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
      const price = parseBynToApi(plannedPrice) ?? undefined;
      const created = await client.createOrder(organizationId, storeId, {
        type: orderType,
        occasion: 'OTHER',
        customerId: customerId || undefined,
        recipientName: recipientName.trim(),
        recipientPhone: recipientPhone.trim() || undefined,
        readyAt: combineDateAndTime(readyDate, readyTime),
        comment: comment.trim() || undefined,
        plannedPrice: price,
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
        if (!price) {
          try {
            const recipe = await client.getItemRecipe(organizationId, showcaseBouquetId);
            const quote = await client.resolveRetailComposition(organizationId, {
              lines: recipe.lines.map((line) => ({
                itemId: line.componentItemId,
                quantity: line.quantity,
              })),
            });
            if (quote.total && quote.total !== '0.00') {
              await client.updateOrder(organizationId, storeId, created.id, {
                plannedPrice: quote.total,
              });
            }
          } catch {
            // Price suggestion is optional
          }
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
            <Card title="Данные заказа">
              <form onSubmit={onCreate} className="stack-form" noValidate>
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

                <div className="sale-mode" role="tablist" aria-label="Способ набора состава">
                  <button
                    type="button"
                    role="tab"
                    aria-selected={compositionMode === 'SHOWCASE'}
                    className={`sale-mode__card${compositionMode === 'SHOWCASE' ? ' sale-mode__card--active' : ''}`}
                    onClick={() => setCompositionMode('SHOWCASE')}
                  >
                    <span className="sale-mode__title">С витрины</span>
                    <span className="sale-mode__hint">Готовый букет по рецепту</span>
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={compositionMode === 'MANUAL'}
                    className={`sale-mode__card${compositionMode === 'MANUAL' ? ' sale-mode__card--active' : ''}`}
                    onClick={() => setCompositionMode('MANUAL')}
                  >
                    <span className="sale-mode__title">Вручную</span>
                    <span className="sale-mode__hint">Состав на карточке заказа</span>
                  </button>
                </div>

                {compositionMode === 'SHOWCASE' ? (
                  showcaseBouquets.length > 0 ? (
                    <>
                      <Field label="Букет с витрины" required error={fieldErrors.showcaseBouquet}>
                        <FancySelect
                          value={showcaseBouquetId}
                          onChange={setShowcaseBouquetId}
                          options={showcaseBouquets.map((item) => ({
                            value: item.id,
                            label: item.name,
                            hint: item.code,
                          }))}
                          searchable
                          placeholder="Выберите букет"
                        />
                      </Field>
                      {selectedShowcase && selectedShowcase.previewLines.length > 0 ? (
                        <div className="field__hint">
                          {selectedShowcase.previewLines
                            .map((line) => `${line.componentName} × ${line.quantity}`)
                            .join(' · ')}
                          {selectedShowcase.previewMoreCount > 0
                            ? ` · ещё ${selectedShowcase.previewMoreCount}`
                            : ''}
                        </div>
                      ) : null}
                    </>
                  ) : (
                    <p className="field__hint">
                      Нет букетов на витрине. Отметьте позицию «На витрине» в справочнике и задайте
                      рецепт.
                    </p>
                  )
                ) : null}

                {customers.length > 0 ? (
                  <Field label="Клиент">
                    <FancySelect
                      value={customerId}
                      onChange={setCustomerId}
                      options={[
                        { value: '', label: 'Без привязки' },
                        ...customers.map((c) => ({
                          value: c.id,
                          label: c.name,
                          hint: c.phone,
                        })),
                      ]}
                      searchable
                      placeholder="Без привязки"
                    />
                  </Field>
                ) : null}

                <div className="sale-custom-meta">
                  <Field label="Получатель" required error={fieldErrors.recipientName}>
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

                <Field
                  label={orderType === 'DELIVERY' ? 'Срок доставки' : 'Срок готовности'}
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
                    <Field label="Адрес доставки" required error={fieldErrors.deliveryAddress}>
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
                    <Field
                      label="Пометка к адресу"
                      hint="Для курьера: подъезд, домофон, ориентиры"
                    >
                      <Input
                        value={deliveryComment}
                        onChange={(e) => setDeliveryComment(e.target.value)}
                        placeholder="Подъезд 2, домофон 120, оставить у двери"
                      />
                    </Field>
                  </>
                ) : null}

                <Field label="Плановая цена">
                  <MoneyBynInput value={plannedPrice} onChange={setPlannedPrice} />
                </Field>

                <Field label="Пометка к заказу">
                  <Input
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                    placeholder="Пожелания, особенности, комментарий для команды"
                  />
                </Field>

                <Button type="submit" disabled={creating}>
                  {creating ? 'Создание…' : 'Создать заказ'}
                </Button>
              </form>
            </Card>
          </Section>
        ) : null}
      </PageContainer>
    </main>
  );
}

'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Button, Input } from '@flower/ui';
import { getApiClient } from '@/lib/api-client';
import { Field } from '@/components/layout/field';
import { FancySelect } from '@/components/layout/fancy-select';
import { formatApiErrorMessage } from '@/lib/format-api-error';
import { filterRecipeIngredients } from '@/lib/catalog-items';

export type RecipeCatalogItem = {
  id: string;
  name: string;
  code: string;
  itemType: string;
  isSellable?: boolean;
};

type RecipeDraftLine = {
  key: string;
  componentItemId: string;
  quantity: string;
};

function newRecipeKey() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `r_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function itemTypeLabel(type: string) {
  return type === 'MATERIAL' ? 'Материал' : 'Цветок';
}

export type ItemRecipeEditorProps = {
  organizationId: string;
  itemId: string;
  catalog: RecipeCatalogItem[];
  canEdit: boolean;
  onSaved?: () => void;
};

export function ItemRecipeEditor({
  organizationId,
  itemId,
  catalog,
  canEdit,
  onSaved,
}: ItemRecipeEditorProps) {
  const [lines, setLines] = useState<RecipeDraftLine[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const componentOptions = useMemo(
    () =>
      filterRecipeIngredients(catalog, itemId).map((row) => ({
        value: row.id,
        label: row.name,
        hint: `${row.code} · ${itemTypeLabel(row.itemType)}`,
      })),
    [catalog, itemId],
  );

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    void getApiClient()
      .getItemRecipe(organizationId, itemId)
      .then((recipe) => {
        if (cancelled) return;
        setLines(
          recipe.lines.length > 0
            ? recipe.lines.map((line) => ({
                key: line.id,
                componentItemId: line.componentItemId,
                quantity: line.quantity,
              }))
            : [{ key: newRecipeKey(), componentItemId: '', quantity: '1' }],
        );
      })
      .catch(() => {
        if (!cancelled) {
          setLines([{ key: newRecipeKey(), componentItemId: '', quantity: '1' }]);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [organizationId, itemId]);

  async function onSave(event: FormEvent) {
    event.preventDefault();
    if (!canEdit) return;
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const payload = lines
        .filter((line) => line.componentItemId && line.quantity.trim())
        .map((line) => ({
          componentItemId: line.componentItemId,
          quantity: line.quantity.trim(),
        }));
      const result = await getApiClient().setItemRecipe(organizationId, itemId, {
        lines: payload,
      });
      setLines(
        result.lines.map((line) => ({
          key: line.id,
          componentItemId: line.componentItemId,
          quantity: line.quantity,
        })),
      );
      setMessage('Состав сохранён');
      onSaved?.();
    } catch (err) {
      setError(formatApiErrorMessage(err, 'Не удалось сохранить состав'));
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <p className="field__hint">Загрузка состава…</p>;
  }

  return (
    <form onSubmit={(event) => void onSave(event)} className="stack-form">
      <p className="field__hint" style={{ margin: 0 }}>
        Укажите цветы и материалы — при заказе и продаже спишутся они, а не сам букет.
      </p>
      {componentOptions.length === 0 ? (
        <p className="field__hint">
          Нет ингредиентов в справочнике. Сначала добавьте цветы и материалы в{' '}
          <Link href={`/organizations/${organizationId}/master-data/items`}>Товары</Link>.
        </p>
      ) : null}
      {error ? <p className="field__hint" style={{ color: 'var(--color-danger)' }}>{error}</p> : null}
      {message ? <p className="page-state">{message}</p> : null}
      <div className="stack-form">
        {lines.map((line) => (
          <div key={line.key} className="sale-custom-meta">
            <Field label="Компонент">
              <FancySelect
                value={line.componentItemId}
                onChange={(value) =>
                  setLines((prev) =>
                    prev.map((row) =>
                      row.key === line.key ? { ...row, componentItemId: value } : row,
                    ),
                  )
                }
                options={componentOptions}
                searchable
                placeholder="Цветок или материал"
                disabled={!canEdit || saving}
              />
            </Field>
            <Field label="Кол-во">
              <Input
                value={line.quantity}
                onChange={(event) =>
                  setLines((prev) =>
                    prev.map((row) =>
                      row.key === line.key ? { ...row, quantity: event.target.value } : row,
                    ),
                  )
                }
                inputMode="decimal"
                disabled={!canEdit || saving}
              />
            </Field>
            {canEdit ? (
              <Button
                type="button"
                variant="ghost"
                onClick={() => setLines((prev) => prev.filter((row) => row.key !== line.key))}
                disabled={saving || lines.length <= 1}
              >
                Удалить
              </Button>
            ) : null}
          </div>
        ))}
      </div>
      {canEdit ? (
        <div className="meta-row">
          <Button
            type="button"
            variant="secondary"
            onClick={() =>
              setLines((prev) => [...prev, { key: newRecipeKey(), componentItemId: '', quantity: '1' }])
            }
            disabled={saving}
          >
            Добавить строку
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? 'Сохранение…' : 'Сохранить состав'}
          </Button>
        </div>
      ) : null}
    </form>
  );
}

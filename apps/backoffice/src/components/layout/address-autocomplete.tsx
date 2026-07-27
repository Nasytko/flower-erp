'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { Input } from '@flower/ui';
import type { AddressSearchHitDto } from '@flower/api-client';
import { getApiClient } from '@/lib/api-client';

export type AddressSelection = AddressSearchHitDto;

type AddressAutocompleteProps = {
  organizationId: string;
  storeId: string;
  value: string;
  onChange: (value: string) => void;
  onSelect?: (hit: AddressSelection) => void;
  city?: string;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  name?: string;
};

export function AddressAutocomplete({
  organizationId,
  storeId,
  value,
  onChange,
  onSelect,
  city,
  placeholder = 'Начните вводить улицу или адрес…',
  required,
  disabled,
  name,
}: AddressAutocompleteProps) {
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [hits, setHits] = useState<AddressSearchHitDto[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [hint, setHint] = useState<string | null>(null);

  useEffect(() => {
    const trimmed = value.trim();
    if (trimmed.length < 2) {
      setHits([]);
      setHint(null);
      return;
    }

    const timer = window.setTimeout(async () => {
      setLoading(true);
      setHint(null);
      try {
        const results = await getApiClient().searchAddresses(organizationId, storeId, {
          q: trimmed,
          city: city?.trim() || undefined,
        });
        setHits(results);
        setActiveIndex(0);
        setOpen(results.length > 0);
        if (results.length === 0) {
          setHint('Адрес не найден — можно ввести вручную');
        }
      } catch {
        setHits([]);
        setHint('Подсказки недоступны — введите адрес вручную');
      } finally {
        setLoading(false);
      }
    }, 400);

    return () => window.clearTimeout(timer);
  }, [value, city, organizationId, storeId]);

  useEffect(() => {
    if (!open) return;
    function onDoc(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  function pick(hit: AddressSearchHitDto) {
    onChange(hit.addressLine);
    onSelect?.(hit);
    setOpen(false);
    setHits([]);
  }

  return (
    <div ref={rootRef} className={`fancy-select address-autocomplete${open ? ' fancy-select--open' : ''}`}>
      <Input
        name={name}
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => {
          if (hits.length > 0) setOpen(true);
        }}
        onKeyDown={(e) => {
          if (!open || hits.length === 0) return;
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setActiveIndex((idx) => Math.min(idx + 1, hits.length - 1));
          }
          if (e.key === 'ArrowUp') {
            e.preventDefault();
            setActiveIndex((idx) => Math.max(idx - 1, 0));
          }
          if (e.key === 'Enter' && hits[activeIndex]) {
            e.preventDefault();
            pick(hits[activeIndex]!);
          }
          if (e.key === 'Escape') setOpen(false);
        }}
        placeholder={placeholder}
        required={required}
        disabled={disabled}
        autoComplete="off"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
      />
      {open && hits.length > 0 ? (
        <div className="fancy-select__panel address-autocomplete__panel" id={listId} role="listbox">
          <ul className="fancy-select__list">
            {hits.map((hit, index) => (
              <li key={`${hit.latitude}-${hit.longitude}-${index}`}>
                <button
                  type="button"
                  role="option"
                  aria-selected={index === activeIndex}
                  className={`fancy-select__option${index === activeIndex ? ' fancy-select__option--active' : ''}`}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => pick(hit)}
                >
                  <span className="fancy-select__value">{hit.addressLine}</span>
                  <span className="fancy-select__option-hint">{hit.displayAddress}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {loading ? <p className="field__hint address-autocomplete__hint">Ищем на карте…</p> : null}
      {!loading && hint ? <p className="field__hint address-autocomplete__hint">{hint}</p> : null}
    </div>
  );
}

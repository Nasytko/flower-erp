'use client';

import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';

export type SelectOption = {
  value: string;
  label: string;
  hint?: string;
  group?: string;
};

type FancySelectProps = {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  disabled?: boolean;
  required?: boolean;
  searchable?: boolean;
  searchPlaceholder?: string;
  emptyText?: string;
  'aria-label'?: string;
  className?: string;
};

/**
 * Accessible combobox-style select with search and grouped options.
 */
export function FancySelect({
  value,
  onChange,
  options,
  placeholder = 'Выберите…',
  disabled,
  required,
  searchable = true,
  searchPlaceholder = 'Поиск…',
  emptyText = 'Ничего не найдено',
  'aria-label': ariaLabel,
  className,
}: FancySelectProps) {
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);

  const selected = options.find((opt) => opt.value === value) ?? null;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter(
      (opt) =>
        opt.label.toLowerCase().includes(q) ||
        (opt.hint?.toLowerCase().includes(q) ?? false) ||
        (opt.group?.toLowerCase().includes(q) ?? false),
    );
  }, [options, query]);

  const groups = useMemo(() => {
    const map = new Map<string, SelectOption[]>();
    for (const opt of filtered) {
      const key = opt.group ?? '';
      const list = map.get(key) ?? [];
      list.push(opt);
      map.set(key, list);
    }
    return [...map.entries()];
  }, [filtered]);

  useEffect(() => {
    if (!open) return;
    function onDoc(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
        setQuery('');
      }
    }
    function onEsc(event: globalThis.KeyboardEvent) {
      if (event.key === 'Escape') {
        setOpen(false);
        setQuery('');
      }
    }
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onEsc);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onEsc);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    setActiveIndex(0);
  }, [open, query]);

  function pick(next: string) {
    onChange(next);
    setOpen(false);
    setQuery('');
  }

  function onTriggerKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (disabled) return;
    if (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      setOpen(true);
    }
  }

  function onListKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, Math.max(filtered.length - 1, 0)));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const opt = filtered[activeIndex];
      if (opt) pick(opt.value);
    }
  }

  return (
    <div
      ref={rootRef}
      className={['fancy-select', open ? 'fancy-select--open' : '', className]
        .filter(Boolean)
        .join(' ')}
    >
      <button
        type="button"
        className="fancy-select__trigger"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-label={ariaLabel}
        aria-required={required || undefined}
        onClick={() => {
          if (!disabled) setOpen((v) => !v);
        }}
        onKeyDown={onTriggerKeyDown}
      >
        <span className={selected ? 'fancy-select__value' : 'fancy-select__placeholder'}>
          {selected ? (
            <>
              {selected.label}
              {selected.hint ? (
                <span className="fancy-select__value-hint"> · {selected.hint}</span>
              ) : null}
            </>
          ) : (
            placeholder
          )}
        </span>
        <span className="fancy-select__chevron" aria-hidden="true">
          ▾
        </span>
      </button>

      {/* Hidden input for native form required validation when needed */}
      {required ? (
        <input
          tabIndex={-1}
          aria-hidden="true"
          required
          value={value}
          onChange={() => undefined}
          className="fancy-select__native"
        />
      ) : null}

      {open ? (
        <div className="fancy-select__panel" role="presentation" onKeyDown={onListKeyDown}>
          {searchable ? (
            <div className="fancy-select__search">
              <input
                autoFocus
                className="fancy-select__search-input"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={searchPlaceholder}
                aria-label={searchPlaceholder}
              />
            </div>
          ) : null}
          <ul id={listId} className="fancy-select__list" role="listbox">
            {filtered.length === 0 ? (
              <li className="fancy-select__empty">{emptyText}</li>
            ) : (
              groups.map(([group, rows]) => (
                <li key={group || '__all'} className="fancy-select__group" role="presentation">
                  {group ? <div className="fancy-select__group-label">{group}</div> : null}
                  <ul className="fancy-select__group-list" role="group">
                    {rows.map((opt) => {
                      const flatIndex = filtered.indexOf(opt);
                      const isActive = flatIndex === activeIndex;
                      const isSelected = opt.value === value;
                      return (
                        <li key={opt.value} role="option" aria-selected={isSelected}>
                          <button
                            type="button"
                            className={[
                              'fancy-select__option',
                              isActive ? 'fancy-select__option--active' : '',
                              isSelected ? 'fancy-select__option--selected' : '',
                            ]
                              .filter(Boolean)
                              .join(' ')}
                            onMouseEnter={() => setActiveIndex(flatIndex)}
                            onClick={() => pick(opt.value)}
                          >
                            <span className="fancy-select__option-label">{opt.label}</span>
                            {opt.hint ? (
                              <span className="fancy-select__option-hint">{opt.hint}</span>
                            ) : null}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </li>
              ))
            )}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

/** Friendly RU labels for seeded payment method codes/names. */
export function paymentMethodLabel(method: { name: string; code?: string; type?: string }): string {
  const code = (method.code ?? '').toUpperCase();
  const type = (method.type ?? '').toUpperCase();
  if (code === 'CASH' || type === 'CASH' || /^cash$/i.test(method.name)) return 'Наличные';
  if (
    code === 'BANK_CARD' ||
    type === 'BANK_CARD' ||
    /bank\s*card|card/i.test(method.name)
  ) {
    return 'Банковская карта';
  }
  if (code === 'BANK_TRANSFER' || type === 'BANK_TRANSFER' || /transfer/i.test(method.name)) {
    return 'Банковский перевод';
  }
  if (type === 'ONLINE' || /online/i.test(method.name)) return 'Онлайн';
  if (type === 'QR' || /^qr$/i.test(method.name)) return 'QR-код';
  if (type === 'GIFT_CERTIFICATE' || /gift|сертификат/i.test(method.name)) {
    return 'Подарочный сертификат';
  }
  return method.name;
}

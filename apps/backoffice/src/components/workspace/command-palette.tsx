'use client';

import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/components/auth-provider';
import {
  filterNavByPermissions,
  parseStoreRoute,
  PRIMARY_NAV,
  resolveNavActionShortcuts,
} from '@/lib/nav';

export function CommandPalette() {
  const auth = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const route = parseStoreRoute(pathname);
  const organizationId = auth.organization?.id ?? route.organizationId;
  const storeId = route.storeId;
  const listId = useId();

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const navItems = useMemo(
    () => filterNavByPermissions(PRIMARY_NAV, auth.hasPermission, organizationId, storeId),
    [auth.hasPermission, organizationId, storeId],
  );

  const actionItems = useMemo(() => resolveNavActionShortcuts(navItems), [navItems]);

  const entries = useMemo(() => {
    const navEntries = navItems.map((item) => ({
      id: `nav:${item.href}`,
      label: item.label,
      href: item.href,
      group: 'Navigate' as const,
    }));
    const actionEntries = actionItems.map((item) => ({
      id: `action:${item.id}`,
      label: item.label,
      href: item.href,
      group: 'Actions' as const,
    }));
    const all = [...actionEntries, ...navEntries];
    const q = query.trim().toLowerCase();
    if (!q) return all;
    return all.filter(
      (entry) =>
        entry.label.toLowerCase().includes(q) || entry.href.toLowerCase().includes(q),
    );
  }, [actionItems, navItems, query]);

  const close = useCallback(() => {
    setOpen(false);
    setQuery('');
    setActiveIndex(0);
  }, []);

  const go = useCallback(
    (href: string) => {
      close();
      router.push(href);
    },
    [close, router],
  );

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setOpen((current) => !current);
      }
      if (event.key === 'Escape' && open) {
        event.preventDefault();
        close();
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [close, open]);

  useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(() => inputRef.current?.focus(), 0);
    return () => window.clearTimeout(timer);
  }, [open]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query, open]);

  useEffect(() => {
    if (!open) return;
    function onFocus(event: FocusEvent) {
      const panel = panelRef.current;
      if (!panel) return;
      if (event.target instanceof Node && !panel.contains(event.target)) {
        inputRef.current?.focus();
      }
    }
    document.addEventListener('focusin', onFocus);
    return () => document.removeEventListener('focusin', onFocus);
  }, [open]);

  if (!open) return null;

  return (
    <div className="command-palette" role="presentation">
      <button type="button" className="command-palette__backdrop" aria-label="Close" onClick={close} />
      <div
        ref={panelRef}
        className="command-palette__panel"
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
      >
        <input
          ref={inputRef}
          className="command-palette__input"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search navigation and actions…"
          aria-controls={listId}
          aria-autocomplete="list"
          onKeyDown={(event) => {
            if (event.key === 'ArrowDown') {
              event.preventDefault();
              setActiveIndex((i) => Math.min(i + 1, Math.max(entries.length - 1, 0)));
            } else if (event.key === 'ArrowUp') {
              event.preventDefault();
              setActiveIndex((i) => Math.max(i - 1, 0));
            } else if (event.key === 'Enter') {
              event.preventDefault();
              const entry = entries[activeIndex];
              if (entry) go(entry.href);
            }
          }}
        />
        <ul id={listId} className="command-palette__list" role="listbox">
          {entries.length === 0 ? (
            <li className="command-palette__empty">No matches</li>
          ) : (
            entries.map((entry, index) => (
              <li key={entry.id} role="option" aria-selected={index === activeIndex}>
                <button
                  type="button"
                  className={
                    index === activeIndex
                      ? 'command-palette__item command-palette__item--active'
                      : 'command-palette__item'
                  }
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={() => go(entry.href)}
                >
                  <span>{entry.label}</span>
                  <span className="command-palette__group">{entry.group}</span>
                </button>
              </li>
            ))
          )}
        </ul>
        <p className="command-palette__hint">Esc to close · ↑↓ to move · Enter to open</p>
      </div>
    </div>
  );
}

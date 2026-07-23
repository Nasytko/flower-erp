'use client';

import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/components/auth-provider';
import { getApiClient } from '@/lib/api-client';
import { t } from '@/i18n/ru';
import { resolveNavWorkspace, resolveStoreHomePath } from '@/lib/nav';
import { getLastWorkspace, setLastWorkspace } from '@/lib/workspace-context';

type StoreRow = { id: string; name: string; code: string };

export function WorkspaceSwitcher() {
  const auth = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);

  const [open, setOpen] = useState(false);
  const [stores, setStores] = useState<StoreRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cachedStoreName, setCachedStoreName] = useState<string | null>(null);

  const workspace = useMemo(
    () => resolveNavWorkspace(pathname, auth.organization?.id),
    [pathname, auth.organization?.id],
  );

  useEffect(() => {
    const last = getLastWorkspace();
    setCachedStoreName(
      last && last.storeId === workspace.storeId ? last.storeName ?? null : null,
    );
  }, [workspace.storeId]);

  const storeLabel =
    (workspace.storeId && stores.find((s) => s.id === workspace.storeId)?.name) ||
    (workspace.storeId && cachedStoreName) ||
    (workspace.storeId ? t('storeSelected') : t('storeNotSelected'));

  const loadStores = useCallback(async () => {
    const orgId = workspace.organizationId ?? auth.organization?.id;
    if (!orgId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await getApiClient().listStores(orgId, 1, 100);
      setStores(res.items.map((s) => ({ id: s.id, name: s.name, code: s.code })));
    } catch {
      setError(t('failedToLoadStores'));
    } finally {
      setLoading(false);
    }
  }, [workspace.organizationId, auth.organization?.id]);

  useEffect(() => {
    if (!auth.organization?.id) return;
    void loadStores();
  }, [auth.organization?.id, loadStores]);

  useEffect(() => {
    if (!open) return;
    function onDocClick(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  async function selectStore(store: StoreRow) {
    const orgId = workspace.organizationId ?? auth.organization?.id;
    if (!orgId) return;
    setLastWorkspace({ organizationId: orgId, storeId: store.id, storeName: store.name });
    setOpen(false);
    const home = resolveStoreHomePath(orgId, store.id, auth.hasPermission);
    router.push(home);
  }

  if (!auth.organization) {
    return (
      <span className="workspace-switcher workspace-switcher--empty">{t('orgContext')}</span>
    );
  }

  return (
    <div className="workspace-switcher" ref={rootRef}>
      <button
        type="button"
        className="workspace-switcher__trigger"
        aria-expanded={open}
        aria-controls={listId}
        aria-haspopup="listbox"
        onClick={() => {
          setOpen((v) => !v);
          if (!open) void loadStores();
        }}
      >
        <span className="workspace-switcher__org">{auth.organization.name}</span>
        <span className="workspace-switcher__sep" aria-hidden="true">
          /
        </span>
        <span
          className={
            workspace.storeId
              ? 'workspace-switcher__store'
              : 'workspace-switcher__store workspace-switcher__store--muted'
          }
        >
          {storeLabel}
        </span>
      </button>

      {open ? (
        <div className="workspace-switcher__panel" id={listId} role="listbox">
          <p className="workspace-switcher__heading">{t('selectStore')}</p>
          {loading ? <p className="workspace-switcher__status">{t('loading')}</p> : null}
          {error ? <p className="workspace-switcher__status workspace-switcher__status--error">{error}</p> : null}
          {!loading && !error && stores.length === 0 ? (
            <p className="workspace-switcher__status">{t('noStores')}</p>
          ) : null}
          <ul className="workspace-switcher__list">
            {stores.map((store) => {
              const active = store.id === workspace.storeId;
              return (
                <li key={store.id}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={active}
                    className={
                      active
                        ? 'workspace-switcher__option workspace-switcher__option--active'
                        : 'workspace-switcher__option'
                    }
                    onClick={() => void selectStore(store)}
                  >
                    <span>{store.name}</span>
                    <span className="workspace-switcher__code">{store.code}</span>
                  </button>
                </li>
              );
            })}
          </ul>
          {auth.hasPermission('organization:read') ? (
            <Link
              href="/organizations"
              className="workspace-switcher__footer"
              onClick={() => setOpen(false)}
            >
              {t('allOrganizations')}
            </Link>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

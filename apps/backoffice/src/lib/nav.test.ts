import assert from 'node:assert/strict';
import test from 'node:test';
import {
  filterNavByPermissions,
  isNavItemActive,
  parseStoreRoute,
  PRIMARY_NAV,
  resolveNavActionShortcuts,
  resolveNavHref,
  resolveNavWorkspace,
  resolveStoreHomePath,
  SETTINGS_NAV,
} from './nav';
import {
  clearLastWorkspace,
  LAST_ORGANIZATION_ID_KEY,
  LAST_STORE_ID_KEY,
} from './workspace-context';

const memory = new Map<string, string>();
const localStorageMock = {
  getItem: (key: string) => memory.get(key) ?? null,
  setItem: (key: string, value: string) => {
    memory.set(key, String(value));
  },
  removeItem: (key: string) => {
    memory.delete(key);
  },
};
Object.defineProperty(globalThis, 'localStorage', {
  value: localStorageMock,
  configurable: true,
});
Object.defineProperty(globalThis, 'window', {
  value: globalThis,
  configurable: true,
});

test('PRIMARY_NAV follows staff IA with Заказы first', () => {
  const labels = PRIMARY_NAV.map((item) => item.label);
  assert.deepEqual(labels, [
    'Заказы',
    'Продажа',
    'Клиенты',
    'Остатки',
    'Поступления',
    'Списания',
  ]);
});

test('SETTINGS_NAV is director-only settings hub', () => {
  const settings = SETTINGS_NAV.find((item) => item.label === 'Настройки');
  assert.ok(settings);
  assert.equal(settings?.permission, 'users:read');
  assert.equal(
    resolveNavHref(settings, 'org-1', 'store-1'),
    '/organizations/org-1/settings',
  );
});

test('resolveStoreHomePath returns order calendar when orders:read', () => {
  assert.equal(
    resolveStoreHomePath('org-1', 'store-1', (code) => code === 'orders:read'),
    '/organizations/org-1/stores/store-1/orders/calendar',
  );
});

test('resolveStoreHomePath returns sales when only sales:read', () => {
  assert.equal(
    resolveStoreHomePath('org-1', 'store-1', (code) => code === 'sales:read'),
    '/organizations/org-1/stores/store-1/sales',
  );
});

test('resolveNavActionShortcuts maps new-order to create form', () => {
  const nav = filterNavByPermissions(PRIMARY_NAV, () => true, 'org-1', 'store-1');
  const actions = resolveNavActionShortcuts(nav);
  const newOrder = actions.find((a) => a.id === 'new-order');
  assert.equal(newOrder?.href, '/organizations/org-1/stores/store-1/orders/new');
});

test('parseStoreRoute extracts org and store ids', () => {
  assert.deepEqual(parseStoreRoute('/organizations/org-1/stores/store-1/orders/calendar'), {
    organizationId: 'org-1',
    storeId: 'store-1',
  });
});

test('resolveNavWorkspace uses store from URL on order calendar', () => {
  clearLastWorkspace();
  const onStore = resolveNavWorkspace(
    '/organizations/org-1/stores/store-2/orders/calendar',
    'org-1',
  );
  assert.equal(onStore.storeId, 'store-2');
  assert.equal(onStore.fromLastStore, false);
  clearLastWorkspace();
  assert.equal(globalThis.localStorage?.getItem(LAST_STORE_ID_KEY), null);
  assert.equal(globalThis.localStorage?.getItem(LAST_ORGANIZATION_ID_KEY), null);
});

test('isNavItemActive matches nested routes', () => {
  assert.equal(
    isNavItemActive(
      '/organizations/org-1/stores/store-1/orders/calendar',
      '/organizations/org-1/stores/store-1/orders/calendar',
    ),
    true,
  );
});

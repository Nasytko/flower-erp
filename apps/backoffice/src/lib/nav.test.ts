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
} from './nav';
import {
  clearLastWorkspace,
  LAST_ORGANIZATION_ID_KEY,
  LAST_STORE_ID_KEY,
  setLastWorkspace,
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

test('organizations link is active on nested store routes', () => {
  assert.equal(isNavItemActive('/organizations', '/organizations'), true);
  assert.equal(isNavItemActive('/organizations/org-1/stores/store-1', '/organizations'), true);
  assert.equal(isNavItemActive('/', '/organizations'), false);
});

test('parseStoreRoute extracts org and store ids', () => {
  assert.deepEqual(parseStoreRoute('/organizations/org-1/stores/store-1/sales'), {
    organizationId: 'org-1',
    storeId: 'store-1',
  });
  assert.deepEqual(parseStoreRoute('/organizations/org-1'), {
    organizationId: null,
    storeId: null,
  });
});

test('PRIMARY_NAV is flat nine-item IA', () => {
  const labels = PRIMARY_NAV.map((item) => item.label);
  assert.deepEqual(labels, [
    'Сегодня',
    'Заказы',
    'Продажи',
    'Склад',
    'Поставки',
    'Доставка',
    'Финансы',
    'Справочники',
    'Настройки',
  ]);
  assert.equal(labels.includes('Обзор'), false);
  assert.equal(labels.includes('Операции'), false);
  assert.equal(labels.includes('Оплаты'), false);
  assert.equal(labels.includes('Остатки'), false);
  assert.equal(labels.includes('Списания'), false);
  assert.equal(labels.includes('Перемещения'), false);
  assert.equal(labels.includes('Инвентаризации'), false);
  assert.equal(labels.includes('Клиенты'), false);
  assert.equal(labels.includes('Пользователи'), false);
  assert.equal(labels.includes('Организации'), false);
  assert.equal(labels.includes('Сессии'), false);
});

test('store-scoped Delivery nav resolves with delivery:read', () => {
  const deliveryItem = PRIMARY_NAV.find((item) => item.label === 'Доставка');
  assert.ok(deliveryItem);
  assert.equal(deliveryItem.permission, 'delivery:read');
  assert.equal(resolveNavHref(deliveryItem, 'org-1', null), null);
  assert.equal(
    resolveNavHref(deliveryItem, 'org-1', 'store-1'),
    '/organizations/org-1/stores/store-1/deliveries',
  );
  const filtered = filterNavByPermissions(
    [deliveryItem],
    (code) => code === 'delivery:read',
    'org-1',
    'store-1',
  );
  assert.equal(filtered.length, 1);
  assert.equal(filtered[0]?.href, '/organizations/org-1/stores/store-1/deliveries');
});

test('store-scoped Today nav resolves with workspace:read', () => {
  const todayItem = PRIMARY_NAV.find((item) => item.label === 'Сегодня');
  assert.ok(todayItem);
  assert.equal(resolveNavHref(todayItem, 'org-1', null), null);
  assert.equal(
    resolveNavHref(todayItem, 'org-1', 'store-1'),
    '/organizations/org-1/stores/store-1/today',
  );
  const filtered = filterNavByPermissions(
    [todayItem],
    (code) => code === 'workspace:read',
    'org-1',
    'store-1',
  );
  assert.equal(filtered.length, 1);
  assert.equal(filtered[0]?.href, '/organizations/org-1/stores/store-1/today');
});

test('Финансы resolves to payments route', () => {
  const finance = PRIMARY_NAV.find((item) => item.label === 'Финансы');
  assert.ok(finance);
  assert.equal(finance.permission, 'payments:read');
  assert.equal(
    resolveNavHref(finance, 'org-1', 'store-1'),
    '/organizations/org-1/stores/store-1/payments',
  );
});

test('Склад resolves to stock route', () => {
  const stock = PRIMARY_NAV.find((item) => item.label === 'Склад');
  assert.ok(stock);
  assert.equal(stock.permission, 'inventory:read');
  assert.equal(
    resolveNavHref(stock, 'org-1', 'store-1'),
    '/organizations/org-1/stores/store-1/stock',
  );
});

test('Настройки resolves to users admin page', () => {
  const settings = PRIMARY_NAV.find((item) => item.label === 'Настройки');
  assert.ok(settings);
  assert.equal(settings.permission, 'users:read');
  assert.equal(resolveNavHref(settings, 'org-1', null), '/organizations/org-1/users');
});

test('store-scoped Sales nav resolves only with store context', () => {
  const salesItem = {
    href: '/organizations/{orgId}/stores/{storeId}/sales',
    label: 'Продажи',
    permission: 'sales:read',
    storeScoped: true,
  };
  assert.equal(resolveNavHref(salesItem, 'org-1', null), null);
  assert.equal(
    resolveNavHref(salesItem, 'org-1', 'store-1'),
    '/organizations/org-1/stores/store-1/sales',
  );
  const filtered = filterNavByPermissions(
    [salesItem],
    (code) => code === 'sales:read',
    'org-1',
    'store-1',
  );
  assert.equal(filtered.length, 1);
  assert.equal(filtered[0]?.href, '/organizations/org-1/stores/store-1/sales');
});

test('resolveNavActionShortcuts maps to PRIMARY_NAV routes', () => {
  const nav = filterNavByPermissions(PRIMARY_NAV, () => true, 'org-1', 'store-1');
  const actions = resolveNavActionShortcuts(nav);
  const today = actions.find((a) => a.id === 'today');
  const sale = actions.find((a) => a.id === 'new-sale');
  const stock = actions.find((a) => a.id === 'stock');
  assert.equal(today?.href, '/organizations/org-1/stores/store-1/today');
  assert.equal(sale?.href, '/organizations/org-1/stores/store-1/sales/new');
  assert.equal(stock?.href, '/organizations/org-1/stores/store-1/stock');
});

test('resolveStoreHomePath prefers today when workspace:read', () => {
  assert.equal(
    resolveStoreHomePath('org-1', 'store-1', (code) =>
      ['workspace:read', 'operations:read', 'delivery:read'].includes(code),
    ),
    '/organizations/org-1/stores/store-1/today',
  );
});

test('resolveStoreHomePath prefers deliveries for delivery-only (courier)', () => {
  assert.equal(
    resolveStoreHomePath('org-1', 'store-1', (code) => code === 'delivery:read'),
    '/organizations/org-1/stores/store-1/deliveries',
  );
});

test('resolveStoreHomePath falls back to store base without workspace/delivery', () => {
  assert.equal(
    resolveStoreHomePath('org-1', 'store-1', () => false),
    '/organizations/org-1/stores/store-1',
  );
});

test('resolveNavWorkspace falls back to last store outside store routes', () => {
  clearLastWorkspace();
  setLastWorkspace({ organizationId: 'org-1', storeId: 'store-9', storeName: 'Main' });
  const resolved = resolveNavWorkspace('/organizations', 'org-1');
  assert.equal(resolved.organizationId, 'org-1');
  assert.equal(resolved.storeId, 'store-9');
  assert.equal(resolved.fromLastStore, true);

  const onStore = resolveNavWorkspace('/organizations/org-1/stores/store-2/today', 'org-1');
  assert.equal(onStore.storeId, 'store-2');
  assert.equal(onStore.fromLastStore, false);

  clearLastWorkspace();
  assert.equal(globalThis.localStorage?.getItem(LAST_STORE_ID_KEY), null);
  assert.equal(globalThis.localStorage?.getItem(LAST_ORGANIZATION_ID_KEY), null);
});

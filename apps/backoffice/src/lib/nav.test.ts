import assert from 'node:assert/strict';
import test from 'node:test';
import {
  filterNavByPermissions,
  isNavItemActive,
  parseStoreRoute,
  PRIMARY_NAV,
  resolveNavActionShortcuts,
  resolveNavHref,
  resolveStoreHomePath,
} from './nav';

test('organizations link is active on nested store routes', () => {
  assert.equal(isNavItemActive('/organizations', '/organizations'), true);
  assert.equal(
    isNavItemActive('/organizations/org-1/stores/store-1', '/organizations'),
    true,
  );
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

test('PRIMARY_NAV includes today, operations, stock, supplies, delivery', () => {
  const labels = PRIMARY_NAV.map((item) => item.label);
  assert.ok(labels.includes('Сегодня'));
  assert.ok(labels.includes('Operations'));
  assert.ok(labels.includes('Остатки'));
  assert.ok(labels.includes('Поставки'));
  assert.ok(labels.includes('Заказы'));
  assert.ok(labels.includes('Доставка'));
  assert.equal(labels.includes('Dashboard'), false);
  const ordersIdx = labels.indexOf('Заказы');
  const deliveryIdx = labels.indexOf('Доставка');
  assert.ok(ordersIdx >= 0 && deliveryIdx === ordersIdx + 1);
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

test('store-scoped Payments nav resolves with permissions', () => {
  const paymentsItem = {
    href: '/organizations/{orgId}/stores/{storeId}/payments',
    label: 'Оплаты',
    permission: 'payments:read',
    storeScoped: true,
  };
  assert.equal(resolveNavHref(paymentsItem, 'org-1', null), null);
  assert.equal(
    resolveNavHref(paymentsItem, 'org-1', 'store-1'),
    '/organizations/org-1/stores/store-1/payments',
  );
  const filtered = filterNavByPermissions(
    [paymentsItem],
    (code) => code === 'payments:read',
    'org-1',
    'store-1',
  );
  assert.equal(filtered.length, 1);
  assert.equal(filtered[0]?.href, '/organizations/org-1/stores/store-1/payments');
});

test('resolveNavActionShortcuts maps to PRIMARY_NAV routes', () => {
  const nav = filterNavByPermissions(
    PRIMARY_NAV,
    () => true,
    'org-1',
    'store-1',
  );
  const actions = resolveNavActionShortcuts(nav);
  const today = actions.find((a) => a.id === 'today');
  const sale = actions.find((a) => a.id === 'new-sale');
  const stock = actions.find((a) => a.id === 'stock');
  assert.equal(today?.href, '/organizations/org-1/stores/store-1/today');
  assert.equal(sale?.href, '/organizations/org-1/stores/store-1/sales/new');
  assert.equal(stock?.href, '/organizations/org-1/stores/store-1/stock');
});

test('resolveStoreHomePath prefers today for workspace-only', () => {
  assert.equal(
    resolveStoreHomePath('org-1', 'store-1', (code) => code === 'workspace:read'),
    '/organizations/org-1/stores/store-1/today',
  );
});

test('resolveStoreHomePath prefers operations when operations:read', () => {
  assert.equal(
    resolveStoreHomePath('org-1', 'store-1', (code) =>
      ['operations:read', 'workspace:read'].includes(code),
    ),
    '/organizations/org-1/stores/store-1/operations',
  );
});

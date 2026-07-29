import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ADMIN_NAV,
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

test('PRIMARY_NAV follows Stage B IA with Сегодня first', () => {
  const labels = PRIMARY_NAV.map((item) => item.label);
  assert.deepEqual(labels, [
    'Сегодня',
    'Заказы',
    'Продажа',
    'Клиенты',
    'Остатки',
    'Поступления',
    'Списания',
    'Инвентаризация',
    'Отчёты',
    'Настройки',
  ]);
});

test('ADMIN_NAV contains director sections', () => {
  const labels = ADMIN_NAV.map((item) => item.label);
  assert.ok(labels.includes('Сотрудники'));
  assert.ok(labels.includes('Касса'));
  assert.ok(labels.includes('Аудит'));
});

test('resolveStoreHomePath returns /today when workspace access', () => {
  assert.equal(
    resolveStoreHomePath('org-1', 'store-1', (code) =>
      ['workspace:read', 'operations:read', 'delivery:read'].includes(code),
    ),
    '/organizations/org-1/stores/store-1/today',
  );
});

test('resolveNavActionShortcuts maps today to /today', () => {
  const nav = filterNavByPermissions(PRIMARY_NAV, () => true, 'org-1', 'store-1');
  const actions = resolveNavActionShortcuts(nav);
  const today = actions.find((a) => a.id === 'today');
  assert.equal(today?.href, '/organizations/org-1/stores/store-1/today');
});

test('Сегодня nav resolves without single permission when anyPermission matches', () => {
  const today = PRIMARY_NAV.find((item) => item.label === 'Сегодня');
  assert.ok(today);
  const filtered = filterNavByPermissions(
    [today],
    (code) => code === 'delivery:read',
    'org-1',
    'store-1',
  );
  assert.equal(filtered.length, 1);
  assert.equal(filtered[0]?.href, '/organizations/org-1/stores/store-1/today');
});

test('Настройки resolves to store settings', () => {
  const settings = PRIMARY_NAV.find((item) => item.label === 'Настройки');
  assert.ok(settings);
  assert.equal(
    resolveNavHref(settings, 'org-1', 'store-1'),
    '/organizations/org-1/stores/store-1/settings',
  );
});

test('parseStoreRoute extracts org and store ids', () => {
  assert.deepEqual(parseStoreRoute('/organizations/org-1/stores/store-1/today'), {
    organizationId: 'org-1',
    storeId: 'store-1',
  });
});

test('resolveNavWorkspace uses store from URL on /today', () => {
  clearLastWorkspace();
  const onStore = resolveNavWorkspace('/organizations/org-1/stores/store-2/today', 'org-1');
  assert.equal(onStore.storeId, 'store-2');
  assert.equal(onStore.fromLastStore, false);
  clearLastWorkspace();
  assert.equal(globalThis.localStorage?.getItem(LAST_STORE_ID_KEY), null);
  assert.equal(globalThis.localStorage?.getItem(LAST_ORGANIZATION_ID_KEY), null);
});

test('isNavItemActive matches nested routes', () => {
  assert.equal(
    isNavItemActive('/organizations/org-1/stores/store-1/today', '/organizations/org-1/stores/store-1/today'),
    true,
  );
});

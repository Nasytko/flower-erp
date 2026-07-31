import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  filterSettingsNav,
  isSettingsAreaPath,
  isSettingsNavItemActive,
  masterDataBreadcrumbs,
  settingsBreadcrumbs,
  settingsHubHref,
} from './settings-nav';

const orgId = 'org-1';
const storeId = 'store-1';
const allowAll = () => true;
const denyAll = () => false;

test('settingsHubHref points to org settings hub', () => {
  assert.equal(settingsHubHref(orgId), `/organizations/${orgId}/settings`);
});

test('settingsBreadcrumbs starts with org list and settings hub', () => {
  assert.deepEqual(settingsBreadcrumbs(orgId, { label: 'Сотрудники' }), [
    { label: 'Организации', href: '/organizations' },
    { label: 'Настройки', href: `/organizations/${orgId}/settings` },
    { label: 'Сотрудники' },
  ]);
});

test('masterDataBreadcrumbs nests under settings hub', () => {
  assert.deepEqual(masterDataBreadcrumbs(orgId, { label: 'Товары' }), [
    { label: 'Организации', href: '/organizations' },
    { label: 'Настройки', href: `/organizations/${orgId}/settings` },
    { label: 'Справочники', href: `/organizations/${orgId}/master-data` },
    { label: 'Товары' },
  ]);
});

test('isSettingsAreaPath covers settings routes', () => {
  assert.equal(isSettingsAreaPath(`/organizations/${orgId}/settings`), true);
  assert.equal(isSettingsAreaPath(`/organizations/${orgId}/master-data/items`), true);
  assert.equal(isSettingsAreaPath(`/organizations/${orgId}/customers`), false);
});

test('filterSettingsNav hides store-scoped items without store context', () => {
  const categories = filterSettingsNav(allowAll, orgId);
  const storeItems = categories.flatMap((category) => category.items);
  assert.equal(
    storeItems.some((item) => item.href.includes('/payment-methods')),
    false,
  );
});

test('filterSettingsNav includes store settings when storeId provided', () => {
  const categories = filterSettingsNav(allowAll, orgId, storeId);
  const storeItems = categories.flatMap((category) => category.items);
  assert.equal(
    storeItems.some((item) => item.href.endsWith('/payment-methods')),
    true,
  );
});

test('filterSettingsNav returns empty when user lacks permissions', () => {
  assert.equal(filterSettingsNav(denyAll, orgId).length, 0);
});

test('isSettingsNavItemActive highlights master-data sub-routes from hub link', () => {
  const hub = `/organizations/${orgId}/master-data`;
  assert.equal(
    isSettingsNavItemActive(`${hub}/items`, hub),
    true,
  );
});

import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  canManageCatalog,
  canOperateCatalog,
  catalogBreadcrumbs,
  filterOrgSettingsNav,
  filterStoreSettingsNav,
  isCatalogAreaPath,
  isOrgSettingsAreaPath,
  isSettingsAreaPath,
  isSettingsNavItemActive,
  orgSettingsBreadcrumbs,
  orgSettingsHubHref,
} from './settings-nav';

const orgId = 'org-1';
const storeId = 'store-1';
const allowAll = () => true;
const denyAll = () => false;
const directorOnly = (code: string) =>
  code === 'users:read' || code === 'master-data:manage' || code === 'organization:read';
const floristOnly = (code: string) =>
  code === 'master-data:read' || code === 'master-data:operate';

test('orgSettingsHubHref points to org ERP settings hub', () => {
  assert.equal(orgSettingsHubHref(orgId), `/organizations/${orgId}/settings`);
});

test('orgSettingsBreadcrumbs uses ERP settings label', () => {
  assert.deepEqual(orgSettingsBreadcrumbs(orgId, { label: 'Сотрудники' }), [
    { label: 'Организации', href: '/organizations' },
    { label: 'Настройки ERP', href: `/organizations/${orgId}/settings` },
    { label: 'Сотрудники' },
  ]);
});

test('catalogBreadcrumbs is separate from ERP settings', () => {
  assert.deepEqual(catalogBreadcrumbs(orgId, { label: 'Товары' }), [
    { label: 'Организации', href: '/organizations' },
    { label: 'Справочник', href: `/organizations/${orgId}/catalog` },
    { label: 'Товары' },
  ]);
});

test('isOrgSettingsAreaPath covers ERP admin routes only', () => {
  assert.equal(isOrgSettingsAreaPath(`/organizations/${orgId}/settings`), true);
  assert.equal(isOrgSettingsAreaPath(`/organizations/${orgId}/settings/stores`), true);
  assert.equal(isOrgSettingsAreaPath(`/organizations/${orgId}/users`), true);
  assert.equal(isOrgSettingsAreaPath(`/organizations/${orgId}/master-data/items`), false);
});

test('isCatalogAreaPath covers operational catalog routes', () => {
  assert.equal(isCatalogAreaPath(`/organizations/${orgId}/catalog`), true);
  assert.equal(isCatalogAreaPath(`/organizations/${orgId}/master-data/items`), true);
  assert.equal(isCatalogAreaPath(`/organizations/${orgId}/settings`), false);
});

test('isSettingsAreaPath includes org and store settings', () => {
  assert.equal(isSettingsAreaPath(`/organizations/${orgId}/settings`), true);
  assert.equal(
    isSettingsAreaPath(`/organizations/${orgId}/stores/${storeId}/settings`),
    true,
  );
  assert.equal(isSettingsAreaPath(`/organizations/${orgId}/catalog`), false);
});

test('filterOrgSettingsNav hides store-scoped items', () => {
  const categories = filterOrgSettingsNav(allowAll, orgId);
  const items = categories.flatMap((category) => category.items);
  assert.equal(
    items.some((item) => item.href.includes('/payment-methods')),
    false,
  );
});

test('filterStoreSettingsNav includes store settings when storeId provided', () => {
  const categories = filterStoreSettingsNav(allowAll, orgId, storeId);
  const items = categories.flatMap((category) => category.items);
  assert.equal(
    items.some((item) => item.href.endsWith('/payment-methods')),
    true,
  );
});

test('filterOrgSettingsNav returns empty when user lacks permissions', () => {
  assert.equal(filterOrgSettingsNav(denyAll, orgId).length, 0);
});

test('canOperateCatalog allows florist operate permission', () => {
  assert.equal(canOperateCatalog(floristOnly), true);
  assert.equal(canOperateCatalog(directorOnly), true);
  assert.equal(canOperateCatalog(denyAll), false);
});

test('canManageCatalog requires full catalog admin', () => {
  assert.equal(canManageCatalog(floristOnly), false);
  assert.equal(canManageCatalog(directorOnly), true);
});

test('isSettingsNavItemActive highlights catalog sub-routes from hub link', () => {
  const hub = `/organizations/${orgId}/catalog`;
  assert.equal(isSettingsNavItemActive(`${hub}/items`, hub), true);
});

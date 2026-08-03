import { expect, test } from '@playwright/test';

const STORE_BASE =
  '/organizations/00000000-0000-0000-0000-000000000001/stores/00000000-0000-0000-0000-000000000002';

test.describe('inventory operations smoke', () => {
  test('write-offs route redirects to login when unauthenticated', async ({ page }) => {
    await page.goto(`${STORE_BASE}/write-offs`);
    await page.waitForURL(/\/login/, { timeout: 15_000 });
    await expect(page).toHaveURL(/\/login/);
  });
});

import { test, expect } from '@playwright/test';

test.describe('sales smoke', () => {
  test.skip(!process.env.AUTH_E2E, 'Set AUTH_E2E=1 to run');

  test('unauthenticated sales route redirects to login', async ({ page }) => {
    await page.goto(
      '/organizations/00000000-0000-0000-0000-000000000001/stores/00000000-0000-0000-0000-000000000002/sales',
    );
    await expect(page).toHaveURL(/login/);
  });
});

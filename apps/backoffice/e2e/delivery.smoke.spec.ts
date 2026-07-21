import { test, expect } from '@playwright/test';

test.describe('delivery smoke', () => {
  test.skip(!process.env.AUTH_E2E, 'Set AUTH_E2E=1 to run');

  test('unauthenticated deliveries route redirects to login', async ({ page }) => {
    await page.goto(
      '/organizations/00000000-0000-0000-0000-000000000001/stores/00000000-0000-0000-0000-000000000002/deliveries',
    );
    await expect(page).toHaveURL(/login/);
  });
});

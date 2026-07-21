import { test, expect } from '@playwright/test';

test.describe('orders smoke', () => {
  test.skip(!process.env.AUTH_E2E, 'Set AUTH_E2E=1 to run');

  test('login page still reachable; orders route redirects when unauthenticated', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByRole('heading', { name: /Flower ERP/i })).toBeVisible();

    await page.goto('/organizations/00000000-0000-0000-0000-000000000001/stores/00000000-0000-0000-0000-000000000002/orders');
    await expect(page).toHaveURL(/login/);
  });
});

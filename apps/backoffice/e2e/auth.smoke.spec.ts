import { test, expect } from '@playwright/test';

const run = process.env.AUTH_E2E === '1';

test.describe('auth smoke', () => {
  test.skip(!run, 'Set AUTH_E2E=1 with running backoffice+API');

  test('unauthenticated redirects to login', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveURL(/\/login/);
  });

  test('login page is usable on mobile viewport', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/login');
    await expect(page.getByRole('heading', { name: 'Flower ERP' })).toBeVisible();
    await expect(page.getByRole('button', { name: /Sign in/i })).toBeVisible();
  });
});

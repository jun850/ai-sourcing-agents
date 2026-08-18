import { test, expect } from '@playwright/test';
import { injectMockApi } from './fixtures/mock-api';

const COPILOT_RESPONSE = {
  summary: 'Best match: cotton jersey fabrics with OEM capability and GOTS certification.',
  usage: { prompt_tokens: 120, completion_tokens: 48 },
  products: [
    { id: 'FAB-100', score: 91, hits: ['OEM available', 'GOTS certified', 'Jersey knit'], miss: [] },
  ],
};

test.describe('Copilot SRP', () => {
  test.beforeEach(async ({ page }) => {
    await injectMockApi(page);
    // Stub the Supabase edge function for copilot-ask
    await page.route('**/functions/v1/copilot-ask', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(COPILOT_RESPONSE),
      });
    });
    // Stub catalog page RPC
    await page.route('**/rpc/public_list_catalog_products', async route => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    });
  });

  test('filter rail is hidden in copilot-srp mode', async ({ page }) => {
    await page.addInitScript(`
      try {
        sessionStorage.setItem('arcana_copilot_query', JSON.stringify({
          text: 'organic cotton jersey OEM',
          results: [{ id: 'FAB-100', score: 91, hits: ['OEM available'], miss: [] }],
          summary: 'Best match: cotton jersey.'
        }));
      } catch(_) {}
    `);
    await page.goto('/pages/category.html?copilot=1&q=organic+cotton+jersey+OEM');
    await page.waitForLoadState('networkidle', { timeout: 12_000 });
    // Use page.evaluate so we don't timeout if the element doesn't exist
    const isHidden = await page.evaluate(() => {
      const el = document.querySelector('.filter-rail') as HTMLElement | null;
      if (!el) return true;
      const style = window.getComputedStyle(el);
      return style.display === 'none' || style.visibility === 'hidden';
    });
    expect(isHidden).toBe(true);
  });

  test('copilot mode does not render the standard mobile action bar', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.addInitScript(`
      try {
        sessionStorage.setItem('arcana_copilot_query', JSON.stringify({
          text: 'organic cotton jersey OEM',
          results: [],
          summary: 'Best match: cotton jersey.'
        }));
      } catch(_) {}
    `);
    await page.goto('/pages/category.html?copilot=1&q=organic+cotton+jersey+OEM');
    await page.waitForLoadState('networkidle', { timeout: 12_000 });
    const isHidden = await page.evaluate(() => {
      const el = document.querySelector('.mobile-action-bar') as HTMLElement | null;
      if (!el) return true;
      return window.getComputedStyle(el).display === 'none';
    });
    expect(isHidden).toBe(true);
  });

  test('page renders without uncaught JS errors in copilot mode', async ({ page }) => {
    const errors: string[] = [];
    // "Transition was skipped" is a benign browser View Transitions API message, not an app error
    const IGNORE = /favicon|cross-origin|Transition was skipped/i;
    page.on('pageerror', e => { if (!IGNORE.test(e.message)) errors.push(e.message); });
    await page.goto('/pages/category.html?copilot=1&q=test');
    await page.waitForLoadState('networkidle', { timeout: 12_000 });
    expect(errors).toHaveLength(0);
  });
});

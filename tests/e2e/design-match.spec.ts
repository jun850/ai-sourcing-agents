import { test, expect } from '@playwright/test';
import { injectMockApi } from './fixtures/mock-api';

const DESIGN_MATCH_FIXTURE = {
  bom: [
    { category: 'fabrics', name: 'Cotton jersey', weight: '180 GSM', composition: '100% Cotton' },
    { category: 'trims', name: 'Flat zipper', length: '20cm' },
  ],
  imageUrl: 'https://placehold.co/400x600/eef2ee/2e4a3a?text=Design',
  query: 'cotton jersey OEM sustainable',
};

test.describe('Design Match SRP', () => {
  test.beforeEach(async ({ page }) => {
    await injectMockApi(page);
    // Seed the sessionStorage key that design-match mode reads
    await page.addInitScript(`
      try {
        sessionStorage.setItem('arcana_design_match', JSON.stringify(${JSON.stringify(DESIGN_MATCH_FIXTURE)}));
      } catch(_) {}
    `);
  });

  test('design-match mode renders without crash', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', e => { if (!e.message.includes('favicon') && !e.message.includes('cross-origin')) errors.push(e.message); });
    await page.goto('/pages/category.html?design-match=1');
    await page.waitForLoadState('networkidle', { timeout: 12_000 });
    expect(errors).toHaveLength(0);
  });

  test('design-match mode hides the filter rail', async ({ page }) => {
    await page.goto('/pages/category.html?design-match=1');
    await page.waitForLoadState('networkidle', { timeout: 12_000 });
    const filterRail = page.locator('.filter-rail');
    const isHidden = await filterRail.evaluate(el => {
      const style = window.getComputedStyle(el);
      return style.display === 'none' || style.visibility === 'hidden';
    });
    expect(isHidden).toBe(true);
  });

  test('design-match mode hides mobile action bar', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/pages/category.html?design-match=1');
    await page.waitForLoadState('networkidle', { timeout: 12_000 });
    const mobileBar = page.locator('.mobile-action-bar');
    const isHidden = await mobileBar.evaluate(el => window.getComputedStyle(el).display === 'none');
    expect(isHidden).toBe(true);
  });
});

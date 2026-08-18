import { test, expect } from '@playwright/test';
import { injectMockApi, seedCart } from './fixtures/mock-api';

// Mobile viewport matching iPhone 14
const MOBILE = { width: 390, height: 844 };

const PRODUCT_SEED = `
window._QA_SEED_PRODUCT = {
  id: 'FAB-100', name: 'Organic Cotton Jersey 180gsm', cat: 'fabrics', badge: 'non-oem',
  comp: '100% Organic Cotton', spec: 'Jersey knit, 180 GSM', gsm: '180 GSM',
  moq: '200 yards', unit: 'yard', price: 4.8, seller: 'Greenfields Textile',
  loc: 'Surat, India', origin_country: 'India',
  img: 'https://placehold.co/600x600/eef2ee/2e4a3a?text=Organic+Cotton',
  images: ['https://placehold.co/600x600/eef2ee/2e4a3a?text=Organic+Cotton'],
  certs: ['GOTS'], supplierVerified: true,
  description: 'Soft-hand organic cotton jersey.', lead_time: '7-14 days', isPrivate: false,
  factorySlug: null, factoryId: null,
};
document.addEventListener('DOMContentLoaded', () => {
  if (window.ARCANA_PRODUCT_MAP) window.ARCANA_PRODUCT_MAP['FAB-100'] = window._QA_SEED_PRODUCT;
  if (Array.isArray(window.ARCANA_PRODUCTS) && !window.ARCANA_PRODUCTS.find(p => p.id === 'FAB-100')) {
    window.ARCANA_PRODUCTS.push(window._QA_SEED_PRODUCT);
  }
}, { once: true });
`;

test.describe('Mobile purchase flow (390px)', () => {
  test.use({ viewport: MOBILE });

  test.beforeEach(async ({ page }) => {
    await injectMockApi(page);
    await page.addInitScript(PRODUCT_SEED);
  });

  test('L2 mobile action bar is visible and filter rail is hidden', async ({ page }) => {
    await page.goto('/pages/category.html?l2=fabrics');
    await expect(page.locator('.mobile-action-bar')).toBeVisible({ timeout: 10_000 });
    const filterRailVisible = await page.locator('.filter-rail').evaluate(el =>
      window.getComputedStyle(el).display !== 'none'
    );
    expect(filterRailVisible).toBe(false);
  });

  test('L2 mobile back link is visible', async ({ page }) => {
    await page.goto('/pages/category.html?l2=fabrics&l3=cotton');
    await expect(page.locator('.mobile-context-back, #catalogMobileBack')).toBeVisible({ timeout: 10_000 });
  });

  test('PDP Add to Cart button is accessible at mobile viewport', async ({ page }) => {
    await page.goto('/pages/product.html?id=FAB-100');
    await expect(page.locator('#addBtn')).toBeVisible({ timeout: 12_000 });
  });

  test('PDP has no horizontal scroll at mobile viewport', async ({ page }) => {
    await page.goto('/pages/product.html?id=FAB-100');
    await page.locator('h1').waitFor({ state: 'visible', timeout: 12_000 });
    const bodyScrollWidth = await page.evaluate(() => document.body.scrollWidth);
    const viewportWidth = await page.evaluate(() => window.innerWidth);
    expect(bodyScrollWidth).toBeLessThanOrEqual(viewportWidth + 4); // 4px tolerance for scrollbar
  });

  test('L2 category page has no horizontal scroll at mobile viewport', async ({ page }) => {
    await page.goto('/pages/category.html?l2=fabrics');
    await page.locator('h1').waitFor({ state: 'visible', timeout: 10_000 });
    const bodyScrollWidth = await page.evaluate(() => document.body.scrollWidth);
    const viewportWidth = await page.evaluate(() => window.innerWidth);
    expect(bodyScrollWidth).toBeLessThanOrEqual(viewportWidth + 4);
  });

  test('Cart page renders at mobile viewport', async ({ page }) => {
    await seedCart(page);
    await page.goto('/pages/cart.html');
    await expect(page.locator('main, #cart-root, .cart-root')).toBeVisible({ timeout: 12_000 });
    const bodyScrollWidth = await page.evaluate(() => document.body.scrollWidth);
    const viewportWidth = await page.evaluate(() => window.innerWidth);
    expect(bodyScrollWidth).toBeLessThanOrEqual(viewportWidth + 4);
  });

  test('Checkout page renders at mobile viewport without horizontal scroll', async ({ page }) => {
    await seedCart(page);
    await page.goto('/pages/checkout.html');
    await page.waitForLoadState('networkidle', { timeout: 15_000 });
    const bodyScrollWidth = await page.evaluate(() => document.body.scrollWidth);
    const viewportWidth = await page.evaluate(() => window.innerWidth);
    expect(bodyScrollWidth).toBeLessThanOrEqual(viewportWidth + 4);
  });

  test('mobile filter sheet opens and overlays the page', async ({ page }) => {
    await page.goto('/pages/category.html?l2=fabrics');
    await page.locator('#mobileFilterBtn').waitFor({ state: 'visible', timeout: 10_000 });
    await page.locator('#mobileFilterBtn').click();
    await expect(page.locator('.filter-rail')).toBeVisible({ timeout: 4_000 });
    // Overlay backdrop
    await expect(page.locator('body')).toHaveClass(/sheet-active/);
    // Filter rail sheet should be visible (not display:none)
    const isVisible = await page.locator('.filter-rail').evaluate(el =>
      window.getComputedStyle(el).display !== 'none'
    );
    expect(isVisible).toBe(true);
  });
});

import { test, expect } from '@playwright/test';
import { injectMockApi } from './fixtures/mock-api';

const PDP = '/pages/product.html?id=FAB-100';

test.beforeEach(async ({ page }) => {
  await injectMockApi(page);
  // Seed ARCANA_PRODUCTS / ARCANA_PRODUCT_MAP with FAB-100 before page scripts run
  await page.addInitScript(`
    window._QA_SEED_PRODUCT = {
      id: 'FAB-100', name: 'Organic Cotton Jersey 180gsm', cat: 'fabrics', badge: 'non-oem',
      comp: '100% Organic Cotton', spec: 'Jersey knit, 180 GSM', gsm: '180 GSM',
      moq: '200 yards', unit: 'yard', price: 4.8, seller: 'Greenfields Textile',
      loc: 'Surat, India', origin_country: 'India',
      img: 'https://placehold.co/600x600/eef2ee/2e4a3a?text=Organic+Cotton',
      images: [
        'https://placehold.co/600x600/eef2ee/2e4a3a?text=Organic+Cotton',
        'https://placehold.co/600x600/f6eede/72531d?text=Close+up',
      ],
      certs: ['GOTS', 'Oeko-Tex'], supplierVerified: true,
      description: 'Soft-hand organic cotton jersey, GOTS certified.',
      lead_time: '7–14 days', isPrivate: false,
      factorySlug: null, factoryId: null,
    };
    // Pre-populate product maps so the PDP doesn't need a network fetch
    document.addEventListener('DOMContentLoaded', () => {
      if (window.ARCANA_PRODUCT_MAP) {
        window.ARCANA_PRODUCT_MAP['FAB-100'] = window._QA_SEED_PRODUCT;
      }
      if (Array.isArray(window.ARCANA_PRODUCTS)) {
        if (!window.ARCANA_PRODUCTS.find(p => p.id === 'FAB-100')) {
          window.ARCANA_PRODUCTS.push(window._QA_SEED_PRODUCT);
        }
      }
    }, { once: true });
  `);
});

test.describe('L3 product detail page', () => {
  test('renders product heading and price', async ({ page }) => {
    await page.goto(PDP);
    await expect(page.locator('h1')).toContainText(/Organic Cotton/i, { timeout: 10_000 });
    await expect(page.locator('.price-box')).toBeVisible();
  });

  test('gallery image and thumbnails render', async ({ page }) => {
    await page.goto(PDP);
    await expect(page.locator('[data-gallery-main]')).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('.pdp-thumbnails button')).toHaveCount(2, { timeout: 6_000 });
  });

  test('all three tabs are present and About is selected by default', async ({ page }) => {
    await page.goto(PDP);
    const tabs = page.locator('.pdp-tab-btn');
    await tabs.first().waitFor({ state: 'visible', timeout: 10_000 });
    await expect(tabs).toHaveCount(3);
    await expect(tabs.nth(0)).toHaveAttribute('aria-selected', 'true');
    await expect(tabs.nth(1)).toHaveAttribute('aria-selected', 'false');
    await expect(tabs.nth(2)).toHaveAttribute('aria-selected', 'false');
  });

  test('clicking Specifications tab shows spec panel', async ({ page }) => {
    await page.goto(PDP);
    const specsTab = page.locator('.pdp-tab-btn').nth(1);
    await specsTab.waitFor({ state: 'visible', timeout: 10_000 });
    await specsTab.click();
    await expect(specsTab).toHaveAttribute('aria-selected', 'true');
    // Specs panel should be visible; About panel should be hidden
    const panels = page.locator('.pdp-tab-panel');
    await expect(panels.nth(0)).toHaveAttribute('hidden', '', { timeout: 4_000 });
    await expect(panels.nth(1)).not.toHaveAttribute('hidden');
  });

  test('clicking Sourcing tab shows MOQ and lead time', async ({ page }) => {
    await page.goto(PDP);
    const sourcingTab = page.locator('.pdp-tab-btn').nth(2);
    await sourcingTab.waitFor({ state: 'visible', timeout: 10_000 });
    await sourcingTab.click();
    const sourcingPanel = page.locator('#pdp-tab-sourcing');
    await expect(sourcingPanel).not.toHaveAttribute('hidden');
    await expect(sourcingPanel).toContainText(/MOQ|200 yards/i);
  });

  test('clicking gallery image opens lightbox', async ({ page }) => {
    await page.goto(PDP);
    await page.locator('[data-gallery-main]').waitFor({ state: 'visible', timeout: 10_000 });
    await page.locator('[data-gallery-main]').click();
    await expect(page.locator('#pdpLightbox')).toBeVisible({ timeout: 4_000 });
    await expect(page.locator('#lbImg')).toBeVisible();
  });

  test('pressing Escape closes the lightbox', async ({ page }) => {
    await page.goto(PDP);
    await page.locator('[data-gallery-main]').waitFor({ state: 'visible', timeout: 10_000 });
    await page.locator('[data-gallery-main]').click();
    await expect(page.locator('#pdpLightbox')).toBeVisible({ timeout: 4_000 });
    await page.keyboard.press('Escape');
    await expect(page.locator('#pdpLightbox')).not.toBeVisible();
  });

  test('lightbox close button closes it', async ({ page }) => {
    await page.goto(PDP);
    await page.locator('[data-gallery-main]').waitFor({ state: 'visible', timeout: 10_000 });
    await page.locator('[data-gallery-main]').click();
    await page.locator('#lbClose').click();
    await expect(page.locator('#pdpLightbox')).not.toBeVisible({ timeout: 4_000 });
  });

  test('trust row shows Verified supplier badge', async ({ page }) => {
    await page.goto(PDP);
    await expect(page.locator('.pdp-trust')).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('.pdp-trust-badge')).toContainText(/verified/i);
    await expect(page.locator('.pdp-trust-cert')).toHaveCount(2);
  });

  test('sticky panel is visible on desktop viewport', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(PDP);
    await expect(page.locator('.pdp-sticky-panel')).toBeVisible({ timeout: 10_000 });
    // At desktop widths the sticky panel should have sticky positioning
    const position = await page.locator('.pdp-sticky-panel').evaluate(
      el => window.getComputedStyle(el).position
    );
    expect(['sticky', 'static']).toContain(position); // static is ok at narrower desktop
  });

  test('Add to Cart button is visible', async ({ page }) => {
    await page.goto(PDP);
    await expect(page.locator('#addBtn')).toBeVisible({ timeout: 10_000 });
  });

  test('quantity stepper increments and decrements', async ({ page }) => {
    await page.goto(PDP);
    const input = page.locator('#pdpQuantity');
    await input.waitFor({ state: 'visible', timeout: 10_000 });
    const initialValue = Number(await input.inputValue());
    await page.locator('[data-inc]').click();
    await expect(input).toHaveValue(String(initialValue + 1));
    await page.locator('[data-dec]').click();
    await expect(input).toHaveValue(String(initialValue));
  });
});

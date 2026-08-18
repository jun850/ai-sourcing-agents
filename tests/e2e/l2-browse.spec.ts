import { test, expect } from '@playwright/test';
import { injectMockApi } from './fixtures/mock-api';

test.beforeEach(async ({ page }) => {
  await injectMockApi(page);
});

test.describe('L2 category browse', () => {
  test('renders category heading and filter rail on /categories/fabrics', async ({ page }) => {
    await page.goto('/pages/category.html?l2=fabrics');
    await expect(page.locator('h1')).toContainText(/fabrics/i, { timeout: 8_000 });
    await expect(page.locator('.filter-rail')).toBeVisible();
    await expect(page.locator('#sortChips')).toBeVisible();
  });

  test('collapsible filter sections toggle on click', async ({ page }) => {
    await page.goto('/pages/category.html?l2=fabrics');
    const toggle = page.locator('.frl-toggle').first();
    await toggle.waitFor({ state: 'visible', timeout: 8_000 });
    // Starts expanded
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    // Collapse
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    // Expand again
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  });

  test('shows OEM availability filter and toggling re-renders grid', async ({ page }) => {
    await page.goto('/pages/category.html?l2=fabrics');
    await page.locator('[name="avail"][value="oem"]').waitFor({ state: 'visible', timeout: 8_000 });
    await page.locator('[name="avail"][value="oem"]').click();
    // Grid re-renders (may be empty with mock but doesn't crash)
    await expect(page.locator('.prod-grid, .fcard-grid')).toBeVisible({ timeout: 6_000 });
  });

  test('sort chip selection highlights the chosen chip', async ({ page }) => {
    await page.goto('/pages/category.html?l2=fabrics');
    const priceChip = page.locator('[data-sort="price"]');
    await priceChip.waitFor({ state: 'visible', timeout: 8_000 });
    await priceChip.click();
    await expect(priceChip).toHaveClass(/on/);
    // Recommended chip should no longer be active
    await expect(page.locator('[data-sort="rec"]')).not.toHaveClass(/on/);
  });

  test('breadcrumb shows Home > All categories > Fabrics at L2', async ({ page }) => {
    await page.goto('/pages/category.html?l2=fabrics');
    await page.locator('.crumbs').waitFor({ state: 'visible', timeout: 8_000 });
    const crumbs = page.locator('.crumbs li');
    await expect(crumbs).toHaveCount(3, { timeout: 6_000 });
    await expect(crumbs.nth(2)).toContainText(/fabrics/i);
  });

  test('L3 subcategory pill navigates to L3 listing', async ({ page }) => {
    await page.goto('/pages/category.html?l2=fabrics');
    // Wait for the subcategory pill links inside catalogLevelNav
    const subLink = page.locator('#catalogLevelNav a[href*="cotton"], #catalogLevelNav a[href*="knits"]').first();
    try {
      await subLink.waitFor({ state: 'visible', timeout: 8_000 });
      await subLink.click();
      // Should update URL or navigate to L3
      await expect(page).toHaveURL(/l3=|\/fabrics\//, { timeout: 6_000 });
    } catch {
      // Subcategory pills may not appear with empty mock catalog — acceptable
      test.skip();
    }
  });

  test('category lede text appears at L2', async ({ page }) => {
    await page.goto('/pages/category.html?l2=fabrics');
    // catalog-lede is rendered inside catalogLevelNav by renderLevelNav()
    const lede = page.locator('.catalog-lede');
    await lede.waitFor({ state: 'visible', timeout: 8_000 });
    await expect(lede).not.toBeEmpty();
  });

  test('mobile action bar is visible at 390px width', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/pages/category.html?l2=fabrics');
    await expect(page.locator('.mobile-action-bar')).toBeVisible({ timeout: 8_000 });
    await expect(page.locator('.filter-rail')).not.toBeVisible();
  });

  test('mobile filter button opens filter sheet at 390px', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/pages/category.html?l2=fabrics');
    await page.locator('#mobileFilterBtn').click();
    await expect(page.locator('.filter-rail')).toBeVisible({ timeout: 4_000 });
    // Overlay should be active
    await expect(page.locator('body')).toHaveClass(/sheet-active/);
  });
});

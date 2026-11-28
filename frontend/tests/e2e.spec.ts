import { expect, test } from '@playwright/test';

const ROUTES = [
  '/',
  '/monitoring',
  '/map',
  '/simulation',
  '/mitigation',
  '/reports',
  '/health',
  '/settings',
];

test.describe('FloodForgeAI Comprehensive Responsive & Functional QA', () => {
  test('RiskGauge value, km2 unit, and tier badge never overlap across Live Ops and 2001 Demo', async ({
    page,
  }) => {
    await page.goto('/');
    await expect(page.getByText('Live Data')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId('risk-gauge-unit')).toBeVisible();

    const valueBox = await page.getByTestId('risk-gauge-value').boundingBox();
    const unitBox = await page.getByTestId('risk-gauge-unit').boundingBox();
    const tierBox = await page.getByTestId('risk-gauge-tier').boundingBox();

    expect(valueBox).not.toBeNull();
    expect(unitBox).not.toBeNull();
    expect(tierBox).not.toBeNull();

    if (valueBox && unitBox && tierBox) {
      // Numerical value must sit strictly above km2 unit with zero vertical overlap
      expect(valueBox.y + valueBox.height).toBeLessThanOrEqual(unitBox.y);
      // km2 unit must sit strictly above tier badge
      expect(unitBox.y + unitBox.height).toBeLessThanOrEqual(tierBox.y);
    }

    // Switch to 2001 Demo and re-verify non-overlap with non-zero exposure
    await page.getByRole('button', { name: '2001 Demo' }).click();
    await expect(page.getByTestId('risk-gauge-tier')).toContainText(/Warning|Emergency|Watch/i);

    const demoVal = await page.getByTestId('risk-gauge-value').boundingBox();
    const demoUnit = await page.getByTestId('risk-gauge-unit').boundingBox();
    const demoTier = await page.getByTestId('risk-gauge-tier').boundingBox();
    if (demoVal && demoUnit && demoTier) {
      expect(demoVal.y + demoVal.height).toBeLessThanOrEqual(demoUnit.y);
      expect(demoUnit.y + demoUnit.height).toBeLessThanOrEqual(demoTier.y);
    }
  });

  test('Dashboard hierarchy, safety disclaimer, and zero horizontal overflow across all routes', async ({
    page,
  }) => {
    const pageErrors: string[] = [];
    page.on('pageerror', (err) => pageErrors.push(err.message));

    for (const route of ROUTES) {
      await page.goto(route);
      await page.waitForLoadState('domcontentloaded');

      // Flood safety PMD & NDMA disclaimer must remain visible & not truncated
      await expect(page.getByText(/PMD & NDMA bulletins/i).first()).toBeVisible();

      // Zero unintended document-level horizontal overflow
      const overflow = await page.evaluate(() => {
        return document.documentElement.scrollWidth > window.innerWidth + 1;
      });
      expect(overflow, `Horizontal overflow detected on ${route}`).toBe(false);
    }

    // Verify dashboard-specific hierarchy on /
    await page.goto('/');
    const outlookBox = await page.getByRole('heading', { name: 'Flood Outlook' }).boundingBox();
    const kpiBox = await page.getByText('Flood Risk', { exact: true }).first().boundingBox();
    const mapBox = await page.getByRole('heading', { name: 'Flood Risk Map' }).boundingBox();

    expect(outlookBox).not.toBeNull();
    expect(kpiBox).not.toBeNull();
    expect(mapBox).not.toBeNull();
    if (outlookBox && kpiBox && mapBox) {
      expect(outlookBox.y).toBeLessThan(kpiBox.y);
      expect(kpiBox.y).toBeLessThan(mapBox.y);
    }

    // Legacy route redirects
    await page.goto('/forecast');
    await expect(page).toHaveURL(/\/simulation$/);
    await page.goto('/equity');
    await expect(page).toHaveURL(/\/reports\?tab=equity$/);

    // 404 route handling
    await page.goto('/nonexistent-municipal-page');
    await expect(page.getByText('404 — Page Not Found')).toBeVisible();

    expect(pageErrors).toEqual([]);
  });

  test('Notification panel stays inside viewport & mobile drawer/search work cleanly', async ({
    page,
  }) => {
    await page.goto('/');
    const viewport = page.viewportSize()!;

    // Open notification panel and verify it stays strictly within viewport bounds
    await page.getByRole('button', { name: 'System notifications' }).click();
    const dialog = page.getByRole('dialog', { name: 'System notifications' });
    await expect(dialog).toBeVisible();
    const box = await dialog.boundingBox();
    expect(box).not.toBeNull();
    if (box) {
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(viewport.width + 1);
    }
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);

    // Mobile-specific drawer & search checks
    if (viewport.width < 1024) {
      await page.getByRole('button', { name: 'Open navigation' }).click();
      const navDialog = page.getByRole('dialog', { name: 'Mobile navigation' });
      await expect(navDialog).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(navDialog).toHaveCount(0);
    }

    if (viewport.width < 768) {
      await page.getByRole('button', { name: 'Search stations' }).click();
      const searchInput = page.getByRole('searchbox', { name: 'Mobile station search' });
      await expect(searchInput).toBeVisible();
      await searchInput.fill('Katarian');
      await expect(page.getByText(/Katarian/i).first()).toBeVisible();
    }
  });
});

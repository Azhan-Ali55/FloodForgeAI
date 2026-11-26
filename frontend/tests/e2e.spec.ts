import { expect, test } from '@playwright/test';

test.describe('FloodForgeAI Municipal Monitoring Portal E2E QA', () => {
  test('desktop dashboard, navigation, back/forward, direct URLs, and 404 handling', async ({
    page,
  }) => {
    const pageErrors: string[] = [];
    const failedLocalAssets: string[] = [];
    page.on('pageerror', (err) => pageErrors.push(err.message));
    page.on('response', (res) => {
      if (res.url().startsWith('http://127.0.0.1:4174') && res.status() >= 400) {
        failedLocalAssets.push(`${res.status()} ${res.url()}`);
      }
    });

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');

    // Top horizontal navigation items
    const navLabels = [
      'Dashboard',
      'Live Monitoring',
      'Flood Risk Map',
      'Predictions',
      'Reports',
      'Settings',
    ];
    for (const label of navLabels) {
      await expect(page.getByRole('link', { name: label })).toBeVisible();
    }

    // Three-column desktop panels visible
    await expect(page.getByRole('heading', { name: 'Weather Forecast' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Environmental Conditions' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Water Monitoring' })).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'Nullah Lai Basin — Environmental & Flood Risk Map' })
    ).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Current Flood Risk' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Monitoring Statistics' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Active Flood & Station Alerts' })).toBeVisible();

    // Navigate through routes and test back/forward
    await page.getByRole('link', { name: 'Live Monitoring' }).click();
    await expect(page).toHaveURL(/\/monitoring$/);
    await expect(
      page.getByRole('heading', { name: /Live Environmental & Station Telemetry/i })
    ).toBeVisible();

    await page.getByRole('link', { name: 'Flood Risk Map' }).click();
    await expect(page).toHaveURL(/\/map$/);

    await page.goBack();
    await expect(page).toHaveURL(/\/monitoring$/);
    await page.goForward();
    await expect(page).toHaveURL(/\/map$/);

    // Direct URL visit & refresh on /reports
    await page.goto('/reports');
    await expect(
      page.getByRole('heading', { name: /Flood Mitigation Investment Optimizer/i })
    ).toBeVisible();
    await page.reload();
    await expect(
      page.getByRole('heading', { name: /Flood Mitigation Investment Optimizer/i })
    ).toBeVisible();

    // 404 route handling
    await page.goto('/nonexistent-municipal-page');
    await expect(page.getByText('404 — Page Not Found')).toBeVisible();
    await page.getByRole('link', { name: /Return to Dashboard/i }).click();
    await expect(page).toHaveURL(/\/$/);

    expect(pageErrors).toEqual([]);
    expect(failedLocalAssets).toEqual([]);
  });

  test('interactive map markers, station popups, switching, closing, and layer controls', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');

    // Select STN-04 via station quick selector (syncs marker highlight & anchored Leaflet popup)
    await page.getByRole('button', { name: /STN-04/i }).click();

    const popup = page.locator('.ff-station-popup');
    await expect(popup).toBeVisible();
    await expect(popup).toContainText('STN-04');
    await expect(popup).toContainText('WASA Pumping Station Katarian');
    await expect(popup).toContainText('Data unavailable');

    // Verify popup does not get covered by the top-left basemap toolbar
    const mapHeading = page.getByRole('heading', {
      name: 'Nullah Lai Basin — Environmental & Flood Risk Map',
    });
    await mapHeading.scrollIntoViewIfNeeded();
    await page.waitForTimeout(300);
    const toolbarBox = await page.getByRole('button', { name: 'Map Layers' }).boundingBox();
    const popupBox = await popup.boundingBox();
    expect(toolbarBox).not.toBeNull();
    expect(popupBox).not.toBeNull();
    if (toolbarBox && popupBox) {
      expect(popupBox.y).toBeGreaterThanOrEqual(toolbarBox.y + toolbarBox.height - 2);
    }

    // Click another station (STN-10) without closing first -> updates popup in place
    await page.getByRole('button', { name: /STN-10/i }).click();
    await expect(popup).toContainText('STN-10');
    await expect(popup).toContainText('Rescue 1122 Gawalmandi Command');

    // Close popup using X button
    await popup.getByRole('button', { name: 'Close station popup' }).click();
    await expect(popup).toBeHidden();

    // Toggle 5-Day and 3-Day forecast options
    await page.getByRole('button', { name: '5-Day' }).click();
    await expect(page.getByText('5d horizon')).toBeVisible();
    await page.getByRole('button', { name: '3-Day' }).click();
    await expect(page.getByText('3d horizon')).toBeVisible();

    // Open Map Layers dropdown & toggle layers
    await page.getByRole('button', { name: 'Map Layers' }).click();
    const clustersCheckbox = page.getByLabel('Exposed Building Clusters');
    await expect(clustersCheckbox).toBeVisible();
    await clustersCheckbox.check();
    await expect(clustersCheckbox).toBeChecked();
  });

  test('forms validation, optimizer, reports tabs, and settings controls', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });

    // Predictions page form validation & run
    await page.goto('/prediction');
    const rainNumberInput = page.locator('input[type="number"]').first();
    await rainNumberInput.fill('300');
    await page.getByRole('button', { name: /Run Flood Simulation/i }).click();
    await expect(
      page.getByText('Rainfall intensity must be between 5 and 200 mm/hr.')
    ).toBeVisible();

    await page.getByRole('button', { name: '2001 Cloudburst (620 mm / 10h)' }).click();
    await page.getByRole('button', { name: /Run Flood Simulation/i }).click();
    await expect(
      page.getByText('Rainfall intensity must be between 5 and 200 mm/hr.')
    ).toBeHidden();
    await expect(page.getByText('Before-the-Storm Preparedness Action List')).toBeVisible();

    // Reports tabs & optimizer validation
    await page.goto('/reports');
    await page.getByRole('button', { name: /Zone Equity & Risk-Transfer Audit/i }).click();
    await expect(
      page.getByRole('heading', { name: /Neighborhood Equity & Impact Assessment/i })
    ).toBeVisible();

    await page.getByRole('button', { name: /Model & Data Diagnostics/i }).click();
    await expect(
      page.getByRole('heading', { name: /System Intelligence & Model Diagnostics/i })
    ).toBeVisible();

    await page.getByRole('button', { name: /Mitigation Portfolio Report/i }).click();
    const optButton = page.getByRole('button', { name: /Optimize Investment Portfolio/i });
    await expect(optButton).toBeEnabled();

    // Unchecking all 3 intervention types disables optimization cleanly
    const checkboxes = page.locator('input[type="checkbox"]');
    const count = await checkboxes.count();
    for (let i = 0; i < count; i++) {
      if (await checkboxes.nth(i).isChecked()) {
        await checkboxes.nth(i).uncheck();
      }
    }
    await expect(optButton).toBeDisabled();

    // Settings page health check failure fallback
    await page.goto('/settings');
    await page.getByPlaceholder('http://localhost:8000').fill('http://127.0.0.1:59999');
    await page.getByRole('button', { name: 'Test /api/health' }).click();
    await expect(page.getByText('Backend Unreachable')).toBeVisible({ timeout: 8000 });
  });

  test('offline Open-Meteo API failure gracefully activates deterministic fallback', async ({
    page,
  }) => {
    await page.route('https://api.open-meteo.com/**', (route) => route.abort());
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/');

    await expect(page.getByRole('button', { name: 'Fallback Data' })).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByRole('button', { name: /STN-01/i })).toBeVisible();
  });

  test('responsive mobile (390x844) bottom sheet and tablet (768x1024) layout without overflow', async ({
    page,
  }) => {
    // Mobile viewport
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');

    const mobileOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth
    );
    expect(mobileOverflow).toBe(false);

    // Mobile hamburger drawer works
    await page.getByRole('button', { name: 'Toggle navigation menu' }).click();
    await expect(page.getByRole('link', { name: 'Predictions' })).toBeVisible();
    await page.getByRole('button', { name: 'Toggle navigation menu' }).click();

    // Clicking station opens responsive bottom sheet instead of desktop popup
    await page.getByRole('button', { name: /STN-04/i }).click();
    const bottomSheet = page.locator('.fixed.inset-x-0.bottom-0');
    await expect(bottomSheet).toBeVisible();
    await expect(bottomSheet).toContainText('WASA Pumping Station Katarian');
    await bottomSheet.getByRole('button', { name: 'Close station popup' }).click();
    await expect(bottomSheet).toBeHidden();

    // Tablet viewport
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.goto('/');
    const tabletOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth
    );
    expect(tabletOverflow).toBe(false);
  });
});

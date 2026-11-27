import { expect, test } from '@playwright/test';

test.describe('FloodForgeAI Portal E2E Verification', () => {
  test('desktop dashboard hierarchy, top calendar, navigation, back/forward, and 404 handling', async ({
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

    // Primary horizontal navigation items
    for (const label of ['Overview', 'Flood Map', 'Forecast', 'Simulation', 'Mitigation', 'Reports']) {
      await expect(page.getByRole('link', { name: label })).toBeVisible();
    }

    // Single header mode switcher (none inside main content)
    await expect(
      page.getByRole('group', { name: 'Operational mode switch' })
    ).toBeVisible();
    await expect(
      page.locator('main').getByRole('button', { name: /2001 Cloudburst Demo/i })
    ).toHaveCount(0);

    // Top-positioned Calendar + Supporting Weather completely removed from dashboard
    await expect(page.getByRole('heading', { name: 'Flood Outlook' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Flood Risk Map' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Flood Risk' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Mitigation Impact' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Risk Alerts' })).toBeVisible();
    await expect(page.getByText(/Supporting Weather/i)).toHaveCount(0);
    await expect(page.getByText('Weather Conditions')).toHaveCount(0);

    // Calendar renders at top of main content (above map)
    const calendarBox = await page.getByRole('heading', { name: 'Flood Outlook' }).boundingBox();
    const mapBox = await page.getByRole('heading', { name: 'Flood Risk Map' }).boundingBox();
    expect(calendarBox).not.toBeNull();
    expect(mapBox).not.toBeNull();
    if (calendarBox && mapBox) {
      expect(calendarBox.y).toBeLessThan(mapBox.y);
    }

    // Navigate routes and verify Live Monitoring holds meteorological telemetry
    await page.goto('/monitoring');
    await expect(
      page.getByRole('heading', { name: /Live Environmental & Station Telemetry/i })
    ).toBeVisible();

    await page.getByRole('link', { name: 'Flood Map' }).click();
    await expect(page).toHaveURL(/\/map$/);

    await page.goBack();
    await expect(page).toHaveURL(/\/monitoring$/);
    await page.goForward();
    await expect(page).toHaveURL(/\/map$/);

    // Direct URL visit & refresh on /reports
    await page.goto('/reports');
    await expect(
      page.getByRole('heading', { name: /Mitigation Portfolio Optimizer/i })
    ).toBeVisible();
    await page.reload();
    await expect(
      page.getByRole('heading', { name: /Mitigation Portfolio Optimizer/i })
    ).toBeVisible();

    // 404 route handling
    await page.goto('/nonexistent-municipal-page');
    await expect(page.getByText('404 — Page Not Found')).toBeVisible();
    await page.getByRole('link', { name: /Return to Dashboard/i }).click();
    await expect(page).toHaveURL(/\/$/);

    expect(pageErrors).toEqual([]);
    expect(failedLocalAssets).toEqual([]);
  });

  test('interactive map markers, station popups, split compare slider, and layer controls', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');

    // Before/After Split Curtain visible by default on Overview map
    await expect(
      page.getByLabel('Before and after flood comparison slider')
    ).toBeVisible();

    // Select STN-04 via Intelligence Map selector or verify map popup on /map
    await page.goto('/map');
    await page.getByRole('button', { name: /STN-04/i }).click();

    const popup = page.locator('.ff-station-popup');
    await expect(popup).toBeVisible();
    await expect(popup).toContainText('STN-04');
    await expect(popup).toContainText('WASA Pumping Station Katarian');
    await expect(popup).toContainText('Soil Moisture (0–9 cm)');

    // Close popup using X button
    await popup.getByRole('button', { name: 'Close station popup' }).click();
    await expect(popup).toBeHidden();

    // Layer dropdown toggles cleanly
    await page.getByRole('button', { name: 'Map Layers' }).click();
    const clustersCheckbox = page.getByLabel('Exposed Building Clusters');
    await expect(clustersCheckbox).toBeVisible();
    await clustersCheckbox.check();
    await expect(clustersCheckbox).toBeChecked();
  });

  test('forms validation, optimizer workflows, equity tabs, and settings controls', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });

    // Simulation page form validation
    await page.goto('/simulation');
    await expect(
      page.getByText(/30 m D8 runoff routing across the 200×200 DEM/i)
    ).toBeVisible();
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

    // Reports tabs & optimizer empty-type stale warning
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
    const optButton = page.getByRole('button', { name: /Run Budget Optimization/i });
    await expect(optButton).toBeEnabled();

    const checkboxes = page.locator('input[type="checkbox"]');
    const count = await checkboxes.count();
    for (let i = 0; i < count; i++) {
      if (await checkboxes.nth(i).isChecked()) {
        await checkboxes.nth(i).uncheck();
      }
    }
    await expect(optButton).toBeDisabled();
    await expect(page.getByRole('alert')).toContainText(/at least one intervention/i);

    // Settings failure fallback
    await page.goto('/settings');
    await page.getByLabel('Server Connection Address').fill('http://127.0.0.1:59999');
    await page.getByRole('button', { name: 'Check Server Connection' }).click();
    await expect(page.getByText('Backend Unreachable')).toBeVisible({ timeout: 8000 });
  });

  test('offline Open-Meteo API failure shows incomplete fallback state without false all-clear', async ({
    page,
  }) => {
    await page.route('https://api.open-meteo.com/**', (route) => route.abort());
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/');

    await expect(page.getByRole('button', { name: 'Fallback' })).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByText(/Weather Forecast Unavailable|Incomplete/i)).toBeVisible();
    await expect(page.getByText('No Threshold Exceedance Forecasted')).toHaveCount(0);
  });

  test('responsive layout without horizontal overflow across 360px, 390px, 768px, 1024px, 1440px, 1920px', async ({
    page,
  }) => {
    const pageErrors: string[] = [];
    page.on('pageerror', (err) => pageErrors.push(err.message));

    for (const width of [360, 390, 768, 1024, 1440, 1920]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto('/');
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth
      );
      expect(overflow, `Horizontal overflow detected at ${width}px`).toBe(false);
    }

    // Mobile drawer check at 390px
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    await page.getByRole('button', { name: 'Toggle navigation menu' }).click();
    await expect(page.getByRole('link', { name: 'Forecast' })).toBeVisible();
    await page.getByRole('button', { name: 'Toggle navigation menu' }).click();

    expect(pageErrors).toEqual([]);
  });

  test('hackathon workflow: 2001 Demo replay, calendar navigation, budget slider, and Before/After impact', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');

    // Pagination Next 7d button works
    await page.getByRole('button', { name: 'Next 7 forecast dates' }).click();
    await expect(page.getByText('2/')).toBeVisible();

    // Switch to 2001 Demo via single header toggle
    await page.getByRole('button', { name: /2001 Cloudburst Demo \(150mm\)/i }).click();
    await expect(page.getByText('July 2001 Cloudburst Replay:')).toBeVisible();
    await expect(page.getByText('5.09')).toBeVisible({ timeout: 25_000 });
    await expect(page.getByText('64,653')).toBeVisible();
    await expect(page.getByText(/34 interventions modeled/)).toBeVisible();

    // Dynamic metrics without hardcoded ~230M label
    await expect(page.getByText(/Pareto optimum/i)).toHaveCount(0);
    await expect(page.getByText(/Pareto Knee From Model/i)).toBeVisible();

    // Budget slider updates portfolio metrics
    const slider = page.getByLabel('Mitigation investment budget');
    await expect(slider).toBeVisible();
    const beforePct = await page.getByText(/-[0-9.]+%/).first().innerText();
    await page.getByRole('button', { name: '50M', exact: true }).click();
    await expect(page.getByText(/PKR 50\.0M/)).toBeVisible({ timeout: 10_000 });
    await expect
      .poll(async () => page.getByText(/-[0-9.]+%/).first().innerText(), { timeout: 20_000 })
      .not.toBe(beforePct);

    // Rapid 2001 day scrubbing updates to dry recovery day cleanly
    await page.getByLabel('2001 archive day selector').fill('0');
    await expect(page.getByText(/Jul 16, 2001/)).toBeVisible();
  });

  test('zero flood risk day proposes zero sites & incomplete ensemble shows disclosure', async ({
    page,
  }) => {
    const nowSec = Math.floor(Date.now() / 1000);
    const hourlyTimes = Array.from({ length: 19 * 24 }, (_, i) => nowSec - 3 * 86400 + i * 3600);
    const dailyTimes = Array.from({ length: 19 }, (_, i) => nowSec - 3 * 86400 + i * 86400);

    await page.route('https://api.open-meteo.com/v1/forecast**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          latitude: 33.64,
          longitude: 73.06,
          timezone: 'Asia/Karachi',
          hourly: {
            time: hourlyTimes,
            precipitation: hourlyTimes.map(() => 0),
            precipitation_probability: hourlyTimes.map(() => 5),
          },
          daily: {
            time: dailyTimes,
            precipitation_sum: dailyTimes.map(() => 0),
            precipitation_probability_max: dailyTimes.map(() => 5),
          },
        }),
      });
    });
    await page.route('https://ensemble-api.open-meteo.com/**', (route) => route.abort());

    const satelliteUrls: string[] = [];
    await page.route('https://server.arcgisonline.com/**', async (route) => {
      satelliteUrls.push(route.request().url());
      await route.fulfill({ status: 200, contentType: 'image/png', body: Buffer.from('') });
    });

    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/');

    await expect(page.getByText('0 interventions modeled')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/accuracy vs\. local river gauges unverified/i)).toBeVisible();

    // Satellite {z}/{y}/{x} order check
    await page.getByRole('button', { name: 'Satellite' }).click();
    await expect.poll(() => satelliteUrls.length, { timeout: 10_000 }).toBeGreaterThan(0);
    expect(satelliteUrls.some((u) => /\/tile\/13\/328\d\/575\d$/.test(u))).toBe(true);
    expect(satelliteUrls.some((u) => /\/tile\/13\/575\d\/328\d$/.test(u))).toBe(false);

    // Verify manual In-Browser engine choice is NOT overridden by healthy backend check
    await page.route('http://127.0.0.1:49991/api/health', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ status: 'ok', ready: true, version: '0.3.0' }),
      });
    });
    await page.route('http://127.0.0.1:49991/api/forecast', async (route) => {
      await route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ detail: 'unavailable' }),
      });
    });

    await page.goto('/settings');
    await page.getByRole('button', { name: /In-Browser Mode/i }).click();
    await page.getByLabel('Server Connection Address').fill('http://127.0.0.1:49991');
    await page.getByRole('button', { name: 'Check Server Connection' }).click();
    await expect(page.getByText('System Status: Healthy')).toBeVisible({ timeout: 8000 });
    await expect(
      page.getByRole('button', { name: /In-Browser Mode/i }).locator('svg')
    ).toBeVisible();
  });
});

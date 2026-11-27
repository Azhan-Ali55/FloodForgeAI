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

    // Rebalanced dashboard hierarchy & single header mode switcher
    await expect(
      page.getByRole('group', { name: 'Operational mode switch' })
    ).toBeVisible();
    await expect(page.locator('main').getByRole('button', { name: /2001 Cloudburst Demo/i })).toHaveCount(0);
    await expect(
      page.getByRole('heading', { name: 'Nullah Lai Basin — Environmental & Flood Risk Map' })
    ).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Current Flood Risk' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Active Flood & Station Alerts' })).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'Mitigation Simulation & Investment Effectiveness' })
    ).toBeVisible();
    await expect(page.getByRole('heading', { name: /Calendar Flood Outlook/i })).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'Supporting Weather & Environmental Inputs' })
    ).toBeVisible();

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
    await expect(popup).toContainText('Soil Moisture (0–9 cm)');

    // Verify 5-tier alert ladder, preparedness plan, and color-coded equity zone legend
    await expect(page.getByText('5-Tier Alert Framework')).toBeVisible();
    await expect(page.getByText('Preparedness Action Plan')).toBeVisible();
    await expect(page.getByText('Zone 1: Upstream Islamabad')).toBeVisible();
    await expect(page.getByText('Zone 2: Downstream Rawalpindi')).toBeVisible();

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

    // Expand detailed weather breakdown, toggle 5-Day / 3-Day, and collapse again
    await page.getByRole('button', { name: 'Expand Weather Details' }).click();
    await page.getByRole('button', { name: '5-Day' }).click();
    await expect(page.getByText('5d horizon')).toBeVisible();
    await page.getByRole('button', { name: '3-Day' }).click();
    await expect(page.getByText('3d horizon')).toBeVisible();
    await page.getByRole('button', { name: 'Hide Detailed Weather Charts' }).click();

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

    // Predictions page form validation, D8 note & run
    await page.goto('/prediction');
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
    await expect(page.getByText('Before-the-Storm Preparedness Action List')).toBeVisible();

    // Past Flood Hindcast & Prevention Impact section
    await expect(
      page.getByRole('heading', {
        name: /Past Flood Hindcast & Prevention Impact/i,
      })
    ).toBeVisible();
    await expect(page.getByText('Buildings Protected')).toBeVisible({ timeout: 25_000 });
    await expect(page.getByText('Residents Protected')).toBeVisible();

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
    const optButton = page.getByRole('button', { name: /Run Budget Optimization/i });
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
    await page.getByLabel('Server Connection Address').fill('http://127.0.0.1:59999');
    await page.getByRole('button', { name: 'Check Server Connection' }).click();
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

  test('responsive mobile (375x812 & 390x844) bottom sheet and tablet (768x1024) layout across routes without overflow', async ({
    page,
  }) => {
    const pageErrors: string[] = [];
    page.on('pageerror', (err) => pageErrors.push(err.message));

    // Check every primary route at 375px mobile width for horizontal overflow
    await page.setViewportSize({ width: 375, height: 812 });
    for (const routePath of ['/', '/monitoring', '/map', '/prediction', '/reports', '/settings']) {
      await page.goto(routePath);
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth
      );
      expect(overflow, `Unexpected horizontal overflow on ${routePath} at 375px`).toBe(false);
    }

    // Standard mobile viewport bottom sheet & drawer checks
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');

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
    expect(pageErrors).toEqual([]);
  });

  test('30-day advance flood watch, monsoon surge simulation, and most affected vs safe zones', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');

    await expect(
      page.getByRole('heading', { name: /Calendar Flood Outlook/i })
    ).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'Most Affected Areas vs. Safe Zones' })
    ).toBeVisible();
    await expect(page.getByText(/Confidence unavailable/i)).toBeVisible();

    // Live Ops keeps synthetic surge testing isolated out of live telemetry
    await expect(
      page.getByRole('button', { name: 'Simulate 30-Day Monsoon Surge' })
    ).toBeHidden();

    // Switch to 2001 Demo profile via single header control, then trigger 30-Day Monsoon Surge Test
    await page.getByRole('button', { name: /2001 Cloudburst Demo \(150mm\)/i }).click();
    await page.getByRole('button', { name: 'Simulate 30-Day Monsoon Surge' }).click();
    await expect(page.getByText(/Advance Flood Watch:/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /Viewing Day \+/i })).toBeVisible();

    // Toggle Safe Zones overlay on the map
    await page.getByRole('button', { name: 'Show Safe Zones on Map' }).click();
    await expect(page.getByRole('button', { name: 'Safe Zones: ON' })).toBeVisible();

    // Navigate to Predictions and verify 30-Day Extended Flood Outlook panel
    await page.goto('/prediction');
    await expect(
      page.getByRole('heading', {
        name: /30-Day Extended Flood Outlook/i,
      })
    ).toBeVisible();
  });

  test('two-mode switch, comparison label, budget ROI slider, and equity pass banner', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');

    await expect(
      page.getByRole('heading', { name: 'Mitigation Simulation & Investment Effectiveness' })
    ).toBeVisible();
    await expect(
      page.getByText('Moderate rainfall: 12% area reduction. Severe cloudburst: 39% area reduction.')
    ).toBeVisible();
    await expect(page.getByText('50 mm Flood Cutoff')).toBeVisible();

    // Switch to 2001 Cloudburst Demo via single header control (620mm/10hr, threshold_mm=150) at default PKR 200M
    await page.getByRole('button', { name: /2001 Cloudburst Demo \(150mm\)/i }).click();
    await expect(page.getByText('150 mm Severe Cutoff')).toBeVisible();
    await expect(page.getByText('2001 Cloudburst Archive')).toBeVisible();
    await expect(page.getByText('23 Jul 2001 09:00 PKT').first()).toBeVisible();
    await expect(page.getByText('Saturated · 0.44 m³/m³').first()).toBeVisible();
    await expect(page.getByText(/\/ 200M/)).toBeVisible();
    // Wait until real clipped basin 2001 Demo result arrives (Exposed ~236-237 baseline vs synthetic 43988)
    await expect(page.getByText(/Exposed: 23[0-9] →/)).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText('Population Protected')).toBeVisible();
    await expect(page.getByText('Road Corridors Protected:')).toBeVisible();
    await expect(page.getByText('Critical Facilities Protected:')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Open Full Report' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Download Report (CSV)' })).toBeVisible();
    await expect(page.getByText('Equity Pass: No downstream risk transfer.')).toBeVisible();

    // Money Slide budget slider presets dynamically update ROI
    const slider = page.getByLabel('Dashboard Budget Slider');
    await expect(slider).toBeVisible();
    const areaText200 = await page.locator('text=/-[0-9.]+%/').first().innerText();

    await page.getByRole('button', { name: '50M', exact: true }).click();
    await expect(page.getByText(/\/ 50M/)).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/\b9 Sites\b|\b([5-9]|1[0-2]) Sites\b/)).toBeVisible({
      timeout: 25_000,
    });
    const areaText50 = await page.locator('text=/-[0-9.]+%/').first().innerText();
    expect(areaText50).not.toEqual(areaText200);
  });

  test('2001 historic weather date and time sliders replay conditions and warnings', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');

    await page.getByRole('button', { name: /2001 Cloudburst Demo/i }).click();
    await expect(page.getByLabel('2001 Date Slider')).toBeVisible();
    await expect(page.getByLabel('2001 Time Slider')).toBeVisible();

    // Scrub 2001 Date/Time to 16 Jul (Dry) -> treats 16 Jul 2001 as dry live weather (0 Sites, Standby)
    await page.getByRole('button', { name: '16 Jul (Dry)' }).click();
    await expect(page.getByText('16 Jul 2001 09:00 PKT').first()).toBeVisible();
    await expect(page.getByText('0 Sites')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('No flood risk — no solution needed')).toBeVisible();

    // Scrub 2001 Date/Time to 22 Jul 18:00 PKT (Pre-Storm approaching) -> early warning active
    await page.getByRole('button', { name: '22 Jul (Pre-Storm)' }).click();
    await expect(page.getByText('22 Jul 2001 18:00 PKT').first()).toBeVisible();
    await expect(page.getByText('Action Required')).toBeVisible({ timeout: 10_000 });

    // Return to 23 Jul Cloudburst Peak
    await page.getByRole('button', { name: '23 Jul (620mm Peak)' }).click();
    await expect(page.getByText('23 Jul 2001 09:00 PKT').first()).toBeVisible();
    await expect(page.getByText(/Exposed: 23[0-9] →/)).toBeVisible({ timeout: 30_000 });
  });

  test('zero flood risk day proposes zero mitigation sites', async ({ page }) => {
    const nowSec = Math.floor(Date.now() / 1000);
    const hourlyTimes = Array.from({ length: 19 * 24 }, (_, i) => nowSec - 3 * 86400 + i * 3600);
    const hourlyZeros = hourlyTimes.map(() => 0);
    const dailyTimes = Array.from({ length: 19 }, (_, i) => nowSec - 3 * 86400 + i * 86400);
    const dailyZeros = dailyTimes.map(() => 0);
    const ensembleDailyTimes = Array.from({ length: 35 }, (_, i) => nowSec + i * 86400);
    const ensembleDailyZeros = ensembleDailyTimes.map(() => 0);

    await page.route('**/api/forecast', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          source: 'MOCK_DRY',
          soil_moisture_0_to_1cm: 0.16,
          antecedent_wetness: 'dry',
          peak_6h_total_mm: 0.0,
          peak_6h_rate_mm_per_hr: 0.0,
          peak_6h_window_start: null,
          total_72h_mm: 0.0,
          peak_1h_mm_per_hr: 0.0,
        }),
      });
    });

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
            precipitation: hourlyZeros,
            precipitation_probability: hourlyZeros,
            temperature_2m: hourlyTimes.map(() => 28),
            relative_humidity_2m: hourlyTimes.map(() => 35),
            wind_speed_10m: hourlyTimes.map(() => 6),
            weather_code: hourlyZeros,
            soil_moisture_0_to_1cm: hourlyTimes.map(() => 0.16),
            soil_moisture_1_to_3cm: hourlyTimes.map(() => 0.17),
            soil_moisture_3_to_9cm: hourlyTimes.map(() => 0.18),
          },
          daily: {
            time: dailyTimes,
            precipitation_sum: dailyZeros,
            precipitation_probability_max: dailyZeros,
            temperature_2m_max: dailyTimes.map(() => 34),
            temperature_2m_min: dailyTimes.map(() => 21),
            weather_code: dailyZeros,
          },
        }),
      });
    });

    await page.route('https://ensemble-api.open-meteo.com/v1/ensemble**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          daily: {
            time: ensembleDailyTimes,
            precipitation_sum_member01: ensembleDailyZeros,
            precipitation_sum_member02: ensembleDailyZeros,
          },
        }),
      });
    });

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');

    await expect(page.getByText('0 Sites')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('No flood risk — no solution needed')).toBeVisible();
    await expect(
      page.getByText('No Flood Risk Modeled: Mitigation solutions are not required under current conditions.')
    ).toBeVisible();
  });

  test('satellite tile {z}/{y}/{x} order, incomplete ensemble disclosure, and engine/URL switching races', async ({
    page,
  }) => {
    const satelliteUrls: string[] = [];
    await page.route('https://server.arcgisonline.com/**', async (route) => {
      satelliteUrls.push(route.request().url());
      await route.fulfill({ status: 200, contentType: 'image/png', body: Buffer.from('') });
    });

    // Incomplete ensemble (16d forecast ok, ensemble-api fails) must never display "30-Day Status Clear"
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

    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/');

    // Safe Zones panel carries explicit screening-level disclaimer
    await expect(page.getByText(/Screening Disclaimer:/i)).toBeVisible();
    await expect(page.getByText('Incomplete 30-Day Coverage:')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('30-Day Status Clear:')).toBeHidden();

    // Switch to Satellite basemap and assert {z}/{y}/{x} coordinates (y ~ 3281..3283 before x ~ 5757..5759)
    await page.getByRole('button', { name: 'Satellite' }).click();
    await expect.poll(() => satelliteUrls.length, { timeout: 10_000 }).toBeGreaterThan(0);
    expect(satelliteUrls.some((u) => /\/tile\/13\/328\d\/575\d$/.test(u))).toBe(true);
    expect(satelliteUrls.some((u) => /\/tile\/13\/575\d\/328\d$/.test(u))).toBe(false);

    // Forecast horizon switch updates active UI state cleanly
    await page.getByRole('button', { name: '48h', exact: true }).click();
    await expect(page.getByRole('button', { name: '48h', exact: true })).toHaveClass(/bg-\[#173C79\]/);

    // Verify manual engine mode selection is NOT overridden by healthy backend check
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
    await expect(page.getByText('Demonstration Emergency Tier Simulation Toggle')).toBeVisible();
    await page.getByRole('button', { name: /In-Browser Mode/i }).click();
    await page.getByLabel('Server Connection Address').fill('http://127.0.0.1:49991');
    await page.getByRole('button', { name: 'Check Server Connection' }).click();
    await expect(page.getByText('System Status: Healthy')).toBeVisible({ timeout: 8000 });
    // Connected Analytics Server must NOT auto-activate over manually picked In-Browser Mode
    await expect(
      page.getByRole('button', { name: /In-Browser Mode/i }).locator('svg')
    ).toBeVisible();

    // Rapid optimizer configuration changes in /reports must not leave Run button stuck loading
    await page.goto('/reports');
    await page.getByRole('button', { name: /2001 Demo/i }).click();
    await page.getByRole('button', { name: 'Run Budget Optimization' }).click();
    await expect(page.getByRole('button', { name: 'Run Budget Optimization' })).toBeEnabled({
      timeout: 15_000,
    });
  });
});

# FloodForgeAI — Municipal Flood & Environmental Monitoring Frontend

A light-mode municipal GIS and hydrological decision-support portal for the **Nullah Lai Basin (Rawalpindi–Islamabad, EPSG:32643)**.

## Key Modules

1. **Dashboard (`/`)**: Three-column municipal monitoring layout with 3-day/5-day weather forecasts (Open-Meteo), environmental conditions, water monitoring, interactive green geographical map with clickable station popups, flood-risk index, monitoring statistics, and active alerts.
2. **Live Monitoring (`/monitoring`)**: Real-time weather telemetry, 12 monitoring station status rows, data source health, and system telemetry log.
3. **Flood Risk Map (`/map`)**: Multi-layer 30 m GIS explorer with Flood Risk, Rainfall Distribution, Elevation, and Population overlays plus vector/station controls.
4. **Predictions (`/prediction`)**: Hourly precipitation & probability forecasts, 7-day antecedent wetness ($API_7$), and deterministic D8 Cloudburst Scenario Simulator.
5. **Reports (`/reports`)**: Tabbed Municipal Reports hub covering Mitigation Portfolio Optimization (`/optimizer`), Zone Equity & Risk-Transfer Audit (`/equity`), and Model & Data Diagnostics (`/health`).
6. **Settings (`/settings`)**: Compute engine selector (`local` vs. external Python REST API via `VITE_API_BASE_URL`), agency Emergency tier gate, and weather cache management.

## Development & QA Commands

```bash
cd frontend
npm install
cp .env.example .env
npm run typecheck
npm run build
npm run test:e2e
```

## Hosting & Environment Variables

- `VITE_API_BASE_URL` (optional, default `http://localhost:8000`)
- `VITE_DEFAULT_ENGINE_MODE` (`local` or `api`, default `local`)
- `VITE_OPEN_METEO_URL` (optional override, default `https://api.open-meteo.com/v1/forecast`)

A `vercel.json` SPA rewrite and security header configuration is included for zero-config static deployment.

## Scientific & Governance Notice

All spatial flood outputs are **30 m screening-level D8 runoff proxies**, not validated street-level hydraulic depths or official river-stage forecasts. River water temperature is marked `Data unavailable` where sensor telemetry is absent. Verify operational decisions against official PMD and NDMA bulletins.

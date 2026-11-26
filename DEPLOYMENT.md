# FloodForgeAI — $0 Deployment, QA & Operations Guide

## 1. Architecture & Runtime Overview

- **Frontend (`frontend/`)**: React 19 + TypeScript + Vite 6 + Tailwind CSS v4 + Leaflet + Recharts.
  - Runs completely client-side by default (`VITE_DEFAULT_ENGINE_MODE=local`), including the 30 m EPSG:32643 D8 screening engine, Pareto mitigation optimizer, zone equity audit, and live Open-Meteo API weather fetching.
  - **Zero paid backend, database, or auth server required** for the core portal.
  - Optional Python REST backend (`VITE_API_BASE_URL`) can be connected via **Settings** (`/settings`) if an external FastAPI server is hosted separately.

---

## 2. $0 Hosting Comparison & Eligibility

### Option A — Vercel Hobby Plan ($0/month, Recommended for Hackathon / Non-Commercial / Prototype)
- **Eligibility Notice:** Vercel Hobby is **strictly non-commercial** (personal, academic, hackathon, or non-monetized prototypes). If FloodForgeAI is deployed for commercial revenue or paid municipal contracting, use **Cloudflare Pages Free** instead (or upgrade to Vercel Pro).
- **Quotas & Behavior When Exceeded:**
  - Fast Data Transfer (Bandwidth): **100 GB / month**
  - Fast Origin Transfer: **10 GB / month**
  - CDN Requests: **1,000,000 / month**
  - Serverless Function Invocations: **1,000,000 / month** (unused in static SPA mode)
  - Deployments: **100 / day**, max **45 min** build time, 1 concurrent build
  - **Limit behavior:** Projects exceeding monthly Hobby quotas are **automatically paused** until the next 30-day cycle resets (no surprise overage charges).
- **Included Config:** `frontend/vercel.json` configures SPA rewrites (`/(.*) -> /index.html`) so direct URL visits and page refreshes on `/monitoring`, `/map`, `/prediction`, `/reports`, `/settings` work without 404s, and sets `X-Content-Type-Options`, `X-Frame-Options`, and `Referrer-Policy` headers.

### Option B — Cloudflare Pages Free ($0/month, Alternative for Public/Commercial Static Hosting)
- **Quotas:**
  - Bandwidth & Static Requests: **Unlimited** on the Free plan
  - Builds: **500 builds / month**, max **20 min** build time, 1 concurrent build
  - Max file size: **25 MiB** per asset (current bundle chunks are all < 500 kB)
  - Dynamic Pages Functions (if added later): **100,000 requests / day**
- **SPA Routing:** Add a `frontend/public/_redirects` rule `/* /index.html 200` if deploying on Cloudflare Pages instead of Vercel.

### External API Dependencies ($0)
- **Open-Meteo Weather API (`https://api.open-meteo.com/v1/forecast`)**: Free non-commercial public API; automatically cached in browser `localStorage` (`30 min` TTL) and falls back cleanly to `SYNTHETIC_DEMO` when unreachable or rate-limited.
- **OpenStreetMap / Esri World Imagery Tiles**: Public client-side map tiles; the map falls back cleanly to FloodForgeAI's light-green vector & land-cover base (`#DCEAD5`) if tiles are blocked or offline.

---

## 3. Environment Variables

Copy `frontend/.env.example` to `frontend/.env` locally (never commit `.env`):

```ini
VITE_API_BASE_URL=http://localhost:8000
VITE_DEFAULT_ENGINE_MODE=local
VITE_OPEN_METEO_URL=https://api.open-meteo.com/v1/forecast
```

---

## 4. Reproducible QA, Build & Deploy Commands

### Local Verification & E2E Tests
```bash
cd frontend
npm ci
npm run typecheck
npm run build
npm run test:e2e
```

### Deploy Preview & Production to Vercel ($0 Hobby)
1. Authenticate once with your Vercel account:
   ```bash
   cd frontend
   npx vercel login
   ```
2. Deploy a preview URL and test end-to-end:
   ```bash
   npx vercel
   ```
3. Promote to production on a free `*.vercel.app` subdomain:
   ```bash
   npx vercel --prod
   ```
   *(Or connect the GitHub repository in the Vercel dashboard with **Root Directory** = `frontend`, **Framework Preset** = `Vite`, **Build Command** = `npm run build`, **Output Directory** = `dist`.)*

### Update, Redeploy & Rollback
- **Update & Redeploy:** Commit changes to Git (`git push`) for automatic Vercel Git deployments, or run `cd frontend && npm run build && npx vercel --prod`.
- **Rollback (Vercel):** In Vercel Dashboard → Project → Deployments → select previous healthy deployment → **Promote to Production** (or `npx vercel rollback`).
- **Rollback (Git):** `git revert <commit-sha>` and push/redeploy.

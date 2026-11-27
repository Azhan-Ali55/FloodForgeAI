# FloodForgeAI — $0 Deployment, Provisioning & Operations Guide

## 1. Architecture & Runtime Overview

- **Frontend (`frontend/`)**: React 19 + TypeScript + Vite 6 + Tailwind CSS v4 + Leaflet + Recharts.
  - Supports **Connected Mode** (`Python FastAPI / D8Simulator` when `VITE_API_BASE_URL` points to a hosted backend) and **In-Browser Screening Mode** (client-side 30 m D8 parity engine + bundled `public/real_twin_200x200.json` digital twin).
  - Non-local production builds **never** silently fall back to `http://localhost:8000` if `VITE_API_BASE_URL` is unset; they operate explicitly in local screening mode until a remote backend URL is configured.
- **Backend (`src/floodforge/`)**: FastAPI + Uvicorn + Pydantic v2 + NumPy D8 simulator.
  - Exposes `/api/live` (liveness), `/api/ready` (raster readiness), `/api/health`, `/api/twin`, `/api/forecast`, `/api/simulate`, and `/api/optimize`.

---

## 2. Dataset Provisioning (Backend)

Large `.npy` rasters under `data/processed/clipped/` are gitignored by default to keep Git history lightweight. On any clean clone or container build, provision them from the tracked canonical `frontend/public/real_twin_200x200.json` archive before starting the Python API:

```bash
python scripts/provision_twin_from_json.py
```

Required output files:

- `dem_filled.npy` (`200x200`, finite floats in metres)
- `f_imp.npy` (`200x200`, normalized `[0, 1]`)
- `buildings.npy`, `population.npy`, `roads.npy`, `zones_adm3.npy`
- Optional `facilities_hospital.npy`, `facilities_school.npy`, `metadata.json`

Override default repo paths via environment variables:
- `FLOODFORGE_CONFIG_PATH` (default: `configs/pilot.yaml`)
- `FLOODFORGE_DATA_DIR` (default: `data/processed/clipped`)

If rasters are missing or contain `NaN`/`Inf`, `/api/ready` and `/api/health` intentionally fail with HTTP `503` (`error_category: dataset_unavailable`) rather than serving fabricated zero data.

---

## 3. Environment Variables

### Frontend (`frontend/.env.example`)
Public build-time variables only (never store private keys in `VITE_*`):
- `VITE_API_BASE_URL` — Public HTTPS URL of your deployed FastAPI backend (leave blank for standalone in-browser demo mode on Vercel)
- `VITE_DEFAULT_ENGINE_MODE` — `local` or `api`
- `VITE_OPEN_METEO_URL` — Optional Open-Meteo endpoint override

### Backend (Server-Only Environment)
- `FLOODFORGE_CORS_ORIGINS` — Comma-separated allowed origins (e.g. `https://your-app.vercel.app`)
- `FLOODFORGE_CORS_ORIGIN_REGEX` — Optional preview origin regex (e.g. `https://floodforge.*\.vercel\.app`)
- `FLOODFORGE_CONFIG_PATH` — Custom YAML config path
- `FLOODFORGE_DATA_DIR` — Custom clipped raster directory path
- `FLOODFORGE_LOG_LEVEL` — `INFO` / `WARNING` / `DEBUG`

---

## 4. $0 Hosting Comparison & Eligibility

### Frontend: Vercel Hobby ($0/month, non-commercial/academic) or Cloudflare Pages Free
- **Vercel Settings:** Root Directory = `frontend`, Framework = `Vite`, Build Command = `npm run build`, Output Directory = `dist`.
- `frontend/vercel.json` handles SPA client routing rewrites (`/(.*) -> /index.html`) and security headers (`X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`).
- **Important Note:** If deploying the frontend on Vercel *without* hosting the Python backend, the portal runs transparently as an in-browser screening deployment (`Local Simulation Engine Active`), not a server-backed deployment.

### Backend Hosting Requirements
- Python `>=3.10`, ~256–512 MB RAM recommended (`numpy` + `200x200` D8 routing + `optimize` multi-budget sweep ~3.9s worst-case).
- Suitable free/low-cost Python ASGI platforms: Render Free Web Service, Railway, or Docker on Fly.io / VM with `uvicorn floodforge.api:app --app-dir src --host 0.0.0.0 --port $PORT`. Note that Render/free tiers sleep on idle (cold start delay).

---

## 5. Verification Commands

```bash
# Backend regression tests (unit + ASGI contracts)
pytest -v

# Frontend typecheck, security audit, build & Playwright E2E
cd frontend
npm ci
npm run typecheck
npm audit --omit=dev
npm run build
npm run test:e2e
```

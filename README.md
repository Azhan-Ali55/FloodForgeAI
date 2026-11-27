# FloodForgeAI

**AI-Powered Flood Mitigation & Urban Resilience Decision-Support Platform (Nullah Lai Basin, Islamabad–Rawalpindi)**

## Overview & Scientific Scope

FloodForgeAI models **30 m D8 hydrological runoff accumulation screening** and **greedy equity-audited mitigation portfolio planning** across a 200 × 200 grid (`EPSG:32643`, 6 km × 6 km Nullah Lai pilot corridor).

- **Simulation Engine:** Deterministic D8 topological flow routing (`src/floodforge/simulator.py` and in-browser parity engine `frontend/src/engine/simulator.ts`).
- **Weather Feeds:** Live Open-Meteo precipitation, forecast probability, and soil moisture (`Asia/Karachi`), paired with an explicit July 2001 Cloudburst Replay mode (`620 mm / 10h`) and labeled synthetic stress-test mode.
- **ML & Emergency Notice:** Outputs are **screening-level hydrological runoff indices**, not calibrated hydraulic flood depths or official flood forecasts. No trained supervised ML flood predictor is loaded yet; operational warnings must be cross-verified against PMD & NDMA bulletins.

---

## Local Development Setup

### 1. Python Backend (`FastAPI + NumPy + D8Simulator`)

Requires Python `>=3.10` and clipped geospatial rasters in `data/processed/clipped/` (or `FLOODFORGE_DATA_DIR`).

```bash
python -m venv .venv
# Windows: .venv\Scripts\activate  |  Linux/macOS: source .venv/bin/activate
pip install -r requirements.txt
pip install -e . --no-deps

# Start API server
python -m uvicorn floodforge.api:app --app-dir src --host 127.0.0.1 --port 8000
```

Endpoints: `GET /api/live`, `GET /api/ready`, `GET /api/health`, `GET /api/twin`, `GET /api/forecast`, `POST /api/simulate`, `POST /api/optimize`.

### 2. React + TypeScript Frontend (`Vite`)

```bash
cd frontend
cp .env.example .env
npm ci
npm run dev
```

Open `http://127.0.0.1:5173`.

---

## Verification Commands

```bash
# Backend unit & ASGI contract tests
pytest -v

# Frontend typecheck, production build, and Playwright E2E suite
cd frontend
npm run typecheck
npm run build
npm run test:e2e
```

See [DEPLOYMENT.md](DEPLOYMENT.md) for environment variables, geospatial data provisioning notes, and $0 static/backend hosting setup.

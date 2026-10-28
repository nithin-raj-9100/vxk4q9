# Wind Forecast Desk

Decision support for a GB utility's day-ahead power buying team. It shows the **latest national wind forecast available at the auction cutoff**, puts a **calibrated uncertainty range** around it, and **measures how accurate those forecasts were** across the January 2026 pilot.

- **Live app:** https://vxk4q9.vercel.app
- **Repository:** https://github.com/nithin-raj-9100/vxk4q9
- **Stack:** React + TypeScript (Vite, Recharts) · Python 3.12 (FastAPI) · Docker · Vercel (container runtime)
- **Data:** Elexon BMRS [FUELHH](https://bmrs.elexon.co.uk/api-documentation/endpoint/datasets/FUELHH/stream) (`fuelType=WIND` actuals) and [WINDFOR](https://bmrs.elexon.co.uk/api-documentation/endpoint/datasets/WINDFOR/stream) (wind forecasts). No other data is used.

## Quick start

### Docker (recommended)

Requires Docker with Compose.

```bash
docker compose up --build
# open http://localhost:8000
```

The same root `Dockerfile` is what Vercel builds and runs in production.

### Local development

Prerequisites: [uv](https://docs.astral.sh/uv/) and Node 22+.

```bash
# backend → http://localhost:8000 (API docs at /docs)
cd backend
uv sync
uv run uvicorn app.main:app --reload --port 8000

# frontend → http://localhost:5173 (proxies /api to :8000)
cd frontend
npm install
npm run dev
```

### Tests and linting

```bash
cd backend && uv run pytest && uv run ruff check . && uv run ruff format --check .
cd frontend && npm test && npm run lint && npm run build
```

CI (`.github/workflows/ci.yml`) runs all of the above, then builds the Docker image and smoke-tests `/api/health`.

### Refreshing the data snapshot

```bash
cd backend && uv run python scripts/fetch_snapshot.py
```

## What the app does

### 1. Decision desk

Pick a **decision day** (1–31 Jan 2026) and a **cutoff time**. The default is 09:20 UK, the gate closure of the EPEX GB day-ahead auction; there is a one-click preset for N2EX at 09:50, or any custom time. For the following delivery day the desk shows:

- **Which forecast run was actually available** at the cutoff (the latest `publishTime` ≤ cutoff), and how old it was.
- **Raw forecast**, a **bias-adjusted (expected) forecast**, and a **P10–P90 range**, hourly and as daily energy (GWh).
- **Actuals in hindsight** (toggleable) to sanity-check the call.
- **Forecast evolution:** every run that covered the delivery day, with the one used for the decision highlighted.

### 2. Forecast accuracy

For the same cutoff, across all 31 decisions (744 delivery hours):

- MAE, RMSE, bias, WAPE, and P10/P90 of the hourly error.
- An **out-of-sample backtest** of the decision desk itself: raw vs bias-adjusted error, and P10–P90 hit rate.
- Daily energy error, error vs **forecast lead time** (with the decision window highlighted), error distribution, error by hour of day, and a daily table.

### Key findings (09:20 cutoff)

| | |
|---|---|
| Hourly MAE of the forecast used for the decision | 2.0 GW (WAPE 18%) |
| Bias (actual − forecast) | **−1.7 GW**: wind came in below forecast on 27 of 31 days |
| Bias-adjusted forecast, out-of-sample | MAE 2.1 → **1.4 GW (−31%)**, closer on 21 of 27 days |
| P10–P90 range hit rate, out-of-sample | **79.6%** (target 80%) |
| MAE at day-ahead lead times (≈15–39 h) vs 0–6 h | ~2.0 GW vs 1.8 GW: waiting for later runs gains little |

The persistent over-forecast is consistent with FUELHH being *metered* output, which is net of curtailment and constraint actions, whereas WINDFOR forecasts available wind. For a buyer, that systematic gap is the most valuable thing the pilot surfaced.

## Methodology and assumptions

| Topic | Choice | Why |
|---|---|---|
| Scope | Decision days 1–31 Jan 2026, so delivery days 2 Jan – 1 Feb | "Purchase decisions made in January". |
| Delivery day | UK-local 00:00–24:00, built in `Europe/London` (23/25-hour days handled) | Matches how the team thinks about "tomorrow". |
| Forecast selection | Latest WINDFOR run with `publishTime ≤ cutoff` | The only forecast the team could actually have traded on. No look-ahead. |
| Resolution alignment | WINDFOR is hourly and FUELHH half-hourly, so an hour's actual is the mean of its two settlement periods | Both are MW, so the mean is the hour's average power and hourly MW sums directly to MWh. |
| Error sign | `error = actual − forecast`; negative = less wind than forecast = more to buy | Reads naturally for a buyer. |
| Uncertainty band | Empirical P10/P50/P90 of past hourly errors, using **only delivery days fully settled before the decision** (expanding window) | Honest out-of-sample band. With fewer than 3 settled days (1–3 Jan) it falls back to the pooled January sample, and the UI labels it as such. |
| Bias-adjusted forecast | Forecast + rolling median (P50) error, floored at 0 | Simple, explainable, validated by the backtest. |
| Lead-time analysis | Every January run, every hour 0–72 h ahead, 6 h buckets | Shows whether waiting for later runs would help. |
| Data access | Snapshot of the Elexon API stored in `backend/data/` (≈1.8 MB) | Historical data doesn't change. This gives instant responses, no rate-limit or availability risk in a demo, and reproducible results. `scripts/fetch_snapshot.py` regenerates it. |

## Architecture

```
Browser (React SPA)
   │  /api/*  JSON
   ▼
FastAPI (app.main) ── analysis.py (pure functions) ── dataset.py (in-memory, loaded once)
                                                          ▲
                                         backend/data/*.json ← scripts/fetch_snapshot.py ← Elexon BMRS
```

One Docker image: a Node stage builds the SPA, and a Python stage serves both the API and the static files. The **same image runs locally and in production**. `vercel.json` declares a single Vercel *service* whose entrypoint is the root `Dockerfile`, so Vercel builds it with its [Container Runtime](https://vercel.com/docs/functions/runtimes/container), pushes it to the Vercel Container Registry, and routes all traffic to it. The container listens on `$PORT`, defaulting to 80.

> Without the explicit `services` entry, Vercel auto-detects `frontend/` (Vite) and `backend/` (Python) and builds them natively, bypassing Docker.

The production container scales to zero after about 5 minutes idle, so the first request after a pause takes a few seconds (cold start).

### Repository layout

```
.
├── Dockerfile                 # multi-stage: build React → serve with FastAPI (local + Vercel)
├── docker-compose.yml         # local one-command run on :8000
├── vercel.json                # deploys the root Dockerfile as a Vercel container service
├── .github/workflows/ci.yml   # lint, test, build, docker smoke test
├── backend/
│   ├── pyproject.toml, uv.lock
│   ├── app/
│   │   ├── main.py            # FastAPI routes + SPA static serving
│   │   ├── analysis.py        # forecast selection, error metrics, bands, backtest, lead-time profile
│   │   ├── dataset.py         # loads snapshot, hourly actual alignment, run lookup
│   │   ├── elexon.py          # Elexon BMRS stream client (FUELHH, WINDFOR)
│   │   └── config.py          # scope dates, default cutoff, timezone
│   ├── data/                  # actuals.json, forecasts.json (Elexon snapshot)
│   ├── scripts/fetch_snapshot.py
│   └── tests/                 # unit tests (synthetic data) + API tests (snapshot)
└── frontend/
    ├── src/
    │   ├── App.tsx            # header, tabs, filters (state synced to URL)
    │   ├── views/DecisionView.tsx
    │   ├── views/AccuracyView.tsx
    │   ├── components/ui.tsx  # stat tile, card, legend, tooltip
    │   ├── api.ts             # typed API contracts + endpoint builders
    │   ├── useFetch.ts        # URL-keyed fetch hook (keeps last render while refetching)
    │   └── format.ts          # GW/GWh/UK-time formatting, axis ticks
    └── vite.config.ts         # dev proxy, vitest config
```

### API

| Endpoint | Description |
|---|---|
| `GET /api/health` | Liveness |
| `GET /api/meta` | Scope, default cutoff, snapshot info |
| `GET /api/decision?day=2026-01-15&cutoff=09:20` | Forecast used, hourly forecast/expected/P10/P90/actual, daily energy, band basis |
| `GET /api/accuracy?cutoff=09:20` | Overall metrics, backtest, daily, by hour, by lead time, histogram |
| `GET /api/vintages?deliveryDay=2026-01-16` | All forecast runs covering a delivery day, plus actuals |

Interactive OpenAPI docs are at `/docs`.

## Development practices

- **Pure, tested core:** all domain logic lives in `analysis.py` as pure functions over an immutable dataset. Unit tests use small synthetic datasets for exact assertions (forecast selection at the cutoff boundary, DST days, no-look-ahead band, missing data). API tests run against the real snapshot.
- **No hidden hindsight:** the band and backtest only use information available at decision time, and there is a test for it.
- **Typed contracts:** the TypeScript interfaces in `api.ts` mirror the API responses. FastAPI validates query parameters (date range, `HH:MM` cutoff).
- **Lint and format:** ruff (backend) and oxlint plus `tsc` (frontend), enforced in CI.
- **Accessible charts:** colour palette validated for colour-vision deficiency in light and dark modes, legends on every multi-series chart, tooltips plus table views, and light/dark themes.
- **Reproducible:** pinned lockfiles (`uv.lock`, `package-lock.json`) and a single Docker image for dev parity and production.

## Possible next steps

- Scheduled ingestion (e.g. a Vercel cron or daemon) to keep the snapshot live, with the snapshot kept as a fallback.
- Error bands conditioned on forecast level and lead time (errors grow with wind output).
- Add demand forecasts (out of scope here) to show residual demand, i.e. the volume to buy, directly.
- Add the embedded (distribution-connected) wind estimate to explain more of the bias.

## AI tools used

This project was built with the help of **Claude Code** (Anthropic), an AI coding assistant. It was used for scaffolding, implementing the backend and frontend, writing tests and documentation, and researching domain facts such as auction gate-closure times. All analysis results were verified against the data, and design decisions were reviewed by me.

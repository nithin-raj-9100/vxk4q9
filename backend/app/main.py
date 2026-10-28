import os
from datetime import date, time, timedelta
from pathlib import Path

from fastapi import FastAPI, HTTPException, Query
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from . import analysis
from .config import DECISION_FROM, DECISION_TO, DEFAULT_CUTOFF
from .dataset import get_dataset

app = FastAPI(title="Wind Forecast Desk API", version="1.0.0")

CUTOFF_PATTERN = r"^([01]\d|2[0-3]):[0-5]\d$"


def parse_cutoff(value: str) -> time:
    return time.fromisoformat(value)


def check_decision_day(day: date) -> None:
    if not DECISION_FROM <= day <= DECISION_TO:
        raise HTTPException(422, f"decision day must be between {DECISION_FROM} and {DECISION_TO}")


@app.get("/api/health")
def health() -> dict:
    return {"status": "ok"}


@app.get("/api/meta")
def meta() -> dict:
    ds = get_dataset()
    return {
        "decisionFrom": DECISION_FROM.isoformat(),
        "decisionTo": DECISION_TO.isoformat(),
        "defaultCutoff": DEFAULT_CUTOFF.strftime("%H:%M"),
        "dataFetchedAt": ds.fetched_at,
        "forecastRuns": len(ds.publish_times),
        "actualPeriods": len(ds.actuals),
    }


@app.get("/api/decision")
def decision(
    day: date = Query(..., description="Decision day (UK local), delivery is the following day"),
    cutoff: str = Query(DEFAULT_CUTOFF.strftime("%H:%M"), pattern=CUTOFF_PATTERN),
) -> dict:
    check_decision_day(day)
    return analysis.decision_view(get_dataset(), day, parse_cutoff(cutoff))


@app.get("/api/accuracy")
def accuracy(cutoff: str = Query(DEFAULT_CUTOFF.strftime("%H:%M"), pattern=CUTOFF_PATTERN)) -> dict:
    return analysis.accuracy_view(get_dataset(), parse_cutoff(cutoff))


@app.get("/api/vintages")
def vintages(delivery_day: date = Query(..., alias="deliveryDay")) -> dict:
    check_decision_day(delivery_day - timedelta(days=1))
    return analysis.vintages_view(get_dataset(), delivery_day)


STATIC_DIR = Path(os.environ.get("STATIC_DIR", Path(__file__).resolve().parents[2] / "frontend" / "dist"))

if STATIC_DIR.is_dir():
    app.mount("/assets", StaticFiles(directory=STATIC_DIR / "assets"), name="assets")

    @app.get("/{path:path}", include_in_schema=False)
    def spa(path: str) -> FileResponse:
        candidate = STATIC_DIR / path
        if path and candidate.is_file() and STATIC_DIR in candidate.resolve().parents:
            return FileResponse(candidate)
        return FileResponse(STATIC_DIR / "index.html")

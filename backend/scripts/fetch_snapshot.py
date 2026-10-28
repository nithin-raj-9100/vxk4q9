"""Download the January 2026 wind actuals and forecasts from Elexon BMRS into backend/data/."""

import json
import sys
from datetime import UTC, datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.config import ACTUALS_FROM, ACTUALS_TO, DATA_DIR, FORECAST_PUBLISH_FROM, FORECAST_PUBLISH_TO
from app.elexon import fetch_wind_actuals, fetch_wind_forecasts


def main() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    actuals = fetch_wind_actuals(ACTUALS_FROM, ACTUALS_TO)
    forecasts = fetch_wind_forecasts(FORECAST_PUBLISH_FROM, FORECAST_PUBLISH_TO)
    fetched_at = datetime.now(UTC).strftime("%Y-%m-%dT%H:%M:%SZ")
    for name, rows in (("actuals", actuals), ("forecasts", forecasts)):
        payload = {"source": "Elexon BMRS", "fetchedAt": fetched_at, "rows": rows}
        (DATA_DIR / f"{name}.json").write_text(json.dumps(payload, separators=(",", ":")))
        print(f"{name}: {len(rows)} rows")


if __name__ == "__main__":
    main()

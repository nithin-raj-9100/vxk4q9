from datetime import UTC, date, datetime, time
from pathlib import Path
from zoneinfo import ZoneInfo

UK = ZoneInfo("Europe/London")

DATA_DIR = Path(__file__).resolve().parents[1] / "data"

DECISION_FROM = date(2026, 1, 1)
DECISION_TO = date(2026, 1, 31)

DEFAULT_CUTOFF = time(9, 20)

FORECAST_PUBLISH_FROM = datetime(2025, 12, 31, tzinfo=UTC)
FORECAST_PUBLISH_TO = datetime(2026, 2, 1, tzinfo=UTC)
ACTUALS_FROM = date(2025, 12, 31)
ACTUALS_TO = date(2026, 2, 3)

MIN_HISTORY_DAYS = 3

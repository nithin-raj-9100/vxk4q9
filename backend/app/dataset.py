import bisect
import json
from dataclasses import dataclass
from datetime import datetime, timedelta
from functools import lru_cache
from pathlib import Path

from .config import DATA_DIR

HOUR = timedelta(hours=1)
HALF_HOUR = timedelta(minutes=30)


def parse_utc(value: str) -> datetime:
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


@dataclass(frozen=True)
class WindDataset:
    actuals: dict[datetime, float]
    forecasts: dict[datetime, dict[datetime, float]]
    publish_times: list[datetime]
    fetched_at: str

    def hourly_actual(self, start: datetime) -> float | None:
        """WINDFOR is hourly, FUELHH half-hourly: an hour's actual is the mean of its two settlement periods."""
        first, second = self.actuals.get(start), self.actuals.get(start + HALF_HOUR)
        if first is None or second is None:
            return None
        return (first + second) / 2

    def latest_publish_before(self, instant: datetime) -> datetime | None:
        idx = bisect.bisect_right(self.publish_times, instant)
        return self.publish_times[idx - 1] if idx else None


def load_dataset(data_dir: Path = DATA_DIR) -> WindDataset:
    actual_payload = json.loads((data_dir / "actuals.json").read_text())
    forecast_payload = json.loads((data_dir / "forecasts.json").read_text())

    actuals = {parse_utc(r["startTime"]): float(r["generation"]) for r in actual_payload["rows"]}
    forecasts: dict[datetime, dict[datetime, float]] = {}
    for r in forecast_payload["rows"]:
        forecasts.setdefault(parse_utc(r["publishTime"]), {})[parse_utc(r["startTime"])] = float(r["generation"])

    return WindDataset(
        actuals=actuals,
        forecasts=forecasts,
        publish_times=sorted(forecasts),
        fetched_at=forecast_payload["fetchedAt"],
    )


@lru_cache(maxsize=1)
def get_dataset() -> WindDataset:
    return load_dataset()

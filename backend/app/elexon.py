import json
import urllib.parse
import urllib.request
from datetime import date, datetime, timedelta

BASE_URL = "https://data.elexon.co.uk/bmrs/api/v1/datasets"


def _get(dataset: str, params: dict) -> list[dict]:
    url = f"{BASE_URL}/{dataset}/stream?{urllib.parse.urlencode(params)}"
    with urllib.request.urlopen(url, timeout=60) as resp:
        return json.load(resp)


def fetch_wind_actuals(settlement_from: date, settlement_to: date) -> list[dict]:
    rows = _get(
        "FUELHH",
        {
            "settlementDateFrom": settlement_from.isoformat(),
            "settlementDateTo": settlement_to.isoformat(),
            "fuelType": "WIND",
        },
    )
    return sorted(
        ({"startTime": r["startTime"], "generation": r["generation"]} for r in rows),
        key=lambda r: r["startTime"],
    )


def fetch_wind_forecasts(
    publish_from: datetime, publish_to: datetime, chunk: timedelta = timedelta(days=7)
) -> list[dict]:
    rows: list[dict] = []
    cursor = publish_from
    while cursor < publish_to:
        end = min(cursor + chunk, publish_to)
        rows += _get(
            "WINDFOR",
            {
                "publishDateTimeFrom": cursor.strftime("%Y-%m-%dT%H:%M:%SZ"),
                "publishDateTimeTo": end.strftime("%Y-%m-%dT%H:%M:%SZ"),
            },
        )
        cursor = end
    unique = {(r["publishTime"], r["startTime"]): r["generation"] for r in rows}
    return [{"publishTime": p, "startTime": s, "generation": g} for (p, s), g in sorted(unique.items())]

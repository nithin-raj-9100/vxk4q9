import math
from dataclasses import dataclass
from datetime import UTC, date, datetime, time, timedelta

from .config import DECISION_FROM, DECISION_TO, MIN_HISTORY_DAYS, UK
from .dataset import HOUR, WindDataset

LEAD_TIME_BUCKET_HOURS = 6
MAX_LEAD_TIME_HOURS = 72
HISTOGRAM_BIN_MW = 500


@dataclass(frozen=True)
class HourPoint:
    start: datetime
    forecast: float | None
    actual: float | None
    lead_hours: float

    @property
    def error(self) -> float | None:
        if self.forecast is None or self.actual is None:
            return None
        return self.actual - self.forecast


@dataclass(frozen=True)
class Decision:
    decision_day: date
    decision_instant: datetime
    delivery_day: date
    publish_time: datetime | None
    points: list[HourPoint]

    def errors(self) -> list[float]:
        return [p.error for p in self.points if p.error is not None]


def to_utc(day: date, at: time) -> datetime:
    return datetime.combine(day, at, tzinfo=UK).astimezone(UTC)


def delivery_hours(day: date) -> list[datetime]:
    """UK-local delivery day as UTC hour starts; 23 or 25 hours on clock-change days."""
    start, end = to_utc(day, time(0)), to_utc(day + timedelta(days=1), time(0))
    hours = []
    while start < end:
        hours.append(start)
        start += HOUR
    return hours


def decision_days() -> list[date]:
    return [DECISION_FROM + timedelta(days=i) for i in range((DECISION_TO - DECISION_FROM).days + 1)]


def build_decision(ds: WindDataset, decision_day: date, cutoff: time) -> Decision:
    instant = to_utc(decision_day, cutoff)
    publish = ds.latest_publish_before(instant)
    values = ds.forecasts.get(publish, {}) if publish else {}
    delivery_day = decision_day + timedelta(days=1)
    points = [
        HourPoint(
            start=h,
            forecast=values.get(h),
            actual=ds.hourly_actual(h),
            lead_hours=(h - publish).total_seconds() / 3600 if publish else math.nan,
        )
        for h in delivery_hours(delivery_day)
    ]
    return Decision(decision_day, instant, delivery_day, publish, points)


def quantile(values: list[float], q: float) -> float | None:
    if not values:
        return None
    ordered = sorted(values)
    pos = (len(ordered) - 1) * q
    lo, hi = math.floor(pos), math.ceil(pos)
    return ordered[lo] + (ordered[hi] - ordered[lo]) * (pos - lo)


def error_metrics(errors: list[float], actuals: list[float]) -> dict:
    if not errors:
        return {"count": 0}
    n = len(errors)
    abs_errors = [abs(e) for e in errors]
    return {
        "count": n,
        "maeMw": sum(abs_errors) / n,
        "rmseMw": math.sqrt(sum(e * e for e in errors) / n),
        "biasMw": sum(errors) / n,
        "wapePct": 100 * sum(abs_errors) / sum(actuals) if sum(actuals) else None,
        "p10Mw": quantile(errors, 0.1),
        "p50Mw": quantile(errors, 0.5),
        "p90Mw": quantile(errors, 0.9),
        "maxAbsMw": max(abs_errors),
    }


def paired(points: list[HourPoint]) -> tuple[list[float], list[float]]:
    pairs = [(p.error, p.actual) for p in points if p.error is not None]
    return [e for e, _ in pairs], [a for _, a in pairs]


def error_band(ds: WindDataset, decision: Decision, cutoff: time) -> dict:
    """P10/P90 of past errors, using only delivery days fully settled before this decision is taken (no look-ahead)."""
    history = [
        build_decision(ds, d, cutoff)
        for d in decision_days()
        if to_utc(d + timedelta(days=2), time(0)) <= decision.decision_instant
    ]
    errors = [e for h in history for e in h.errors()]
    basis = "rolling"
    if len(history) < MIN_HISTORY_DAYS:
        errors = [e for d in decision_days() for e in build_decision(ds, d, cutoff).errors()]
        basis = "pooled"
    return {
        "basis": basis,
        "historyDays": len(history),
        "p10Mw": quantile(errors, 0.1),
        "p50Mw": quantile(errors, 0.5),
        "p90Mw": quantile(errors, 0.9),
    }


def shifted(forecast: float | None, offset: float | None) -> float | None:
    if forecast is None or offset is None:
        return None
    return max(0.0, forecast + offset)


def energy(hourly_mw) -> float | None:
    """Hourly MW sums to MWh; any unknown hour makes the daily total unknown."""
    values = list(hourly_mw)
    return None if any(v is None for v in values) else sum(values)


def iso(dt: datetime | None) -> str | None:
    return dt.astimezone(UTC).strftime("%Y-%m-%dT%H:%M:%SZ") if dt else None


def decision_view(ds: WindDataset, decision_day: date, cutoff: time) -> dict:
    decision = build_decision(ds, decision_day, cutoff)
    band = error_band(ds, decision, cutoff)
    hours = []
    for p in decision.points:
        hours.append(
            {
                "startTime": iso(p.start),
                "forecastMw": p.forecast,
                "actualMw": p.actual,
                "errorMw": p.error,
                "leadHours": None if math.isnan(p.lead_hours) else p.lead_hours,
                "lowMw": shifted(p.forecast, band["p10Mw"]),
                "expectedMw": shifted(p.forecast, band["p50Mw"]),
                "highMw": shifted(p.forecast, band["p90Mw"]),
            }
        )
    covered = [h for h in hours if h["forecastMw"] is not None]
    settled = [h for h in covered if h["actualMw"] is not None]
    errors, actuals = paired(decision.points)
    return {
        "decisionDay": decision.decision_day.isoformat(),
        "decisionTime": iso(decision.decision_instant),
        "deliveryDay": decision.delivery_day.isoformat(),
        "forecastPublishTime": iso(decision.publish_time),
        "forecastAgeMinutes": (decision.decision_instant - decision.publish_time).total_seconds() / 60
        if decision.publish_time
        else None,
        "hoursCovered": len(covered),
        "hoursInDay": len(hours),
        "band": band,
        "energy": {
            "forecastMwh": sum(h["forecastMw"] for h in covered),
            "lowMwh": energy(h["lowMw"] for h in covered),
            "expectedMwh": energy(h["expectedMw"] for h in covered),
            "highMwh": energy(h["highMw"] for h in covered),
            "actualMwh": sum(h["actualMw"] for h in settled) if len(settled) == len(hours) else None,
        },
        "metrics": error_metrics(errors, actuals),
        "hours": hours,
    }


def lead_time_profile(ds: WindDataset, decision_from: datetime, decision_to: datetime) -> list[dict]:
    buckets: dict[int, list[tuple[float, float]]] = {}
    for publish in ds.publish_times:
        if not decision_from <= publish < decision_to:
            continue
        for start, forecast in ds.forecasts[publish].items():
            lead = (start - publish).total_seconds() / 3600
            actual = ds.hourly_actual(start)
            if lead < 0 or lead >= MAX_LEAD_TIME_HOURS or actual is None:
                continue
            buckets.setdefault(int(lead // LEAD_TIME_BUCKET_HOURS), []).append((actual - forecast, actual))
    profile = []
    for b in sorted(buckets):
        errors = [e for e, _ in buckets[b]]
        actuals = [a for _, a in buckets[b]]
        profile.append(
            {
                "fromHours": b * LEAD_TIME_BUCKET_HOURS,
                "toHours": (b + 1) * LEAD_TIME_BUCKET_HOURS,
                **error_metrics(errors, actuals),
            }
        )
    return profile


def histogram(errors: list[float]) -> list[dict]:
    counts: dict[int, int] = {}
    for e in errors:
        b = math.floor(e / HISTOGRAM_BIN_MW)
        counts[b] = counts.get(b, 0) + 1
    if not counts:
        return []
    return [
        {"fromMw": b * HISTOGRAM_BIN_MW, "toMw": (b + 1) * HISTOGRAM_BIN_MW, "count": counts.get(b, 0)}
        for b in range(min(counts), max(counts) + 1)
    ]


def backtest(ds: WindDataset, cutoff: time) -> dict:
    """Replays every decision with a rolling band, scoring the raw and bias-adjusted forecasts out-of-sample."""
    raw, adjusted, covered, days_better, days = [], [], 0, 0, 0
    for day in decision_days():
        view = decision_view(ds, day, cutoff)
        if view["band"]["basis"] != "rolling":
            continue
        scored = [h for h in view["hours"] if h["actualMw"] is not None and h["forecastMw"] is not None]
        raw += [abs(h["actualMw"] - h["forecastMw"]) for h in scored]
        adjusted += [abs(h["actualMw"] - h["expectedMw"]) for h in scored]
        covered += sum(h["lowMw"] <= h["actualMw"] <= h["highMw"] for h in scored)
        energy = view["energy"]
        if energy["actualMwh"] is not None:
            days += 1
            days_better += abs(energy["actualMwh"] - energy["expectedMwh"]) < abs(
                energy["actualMwh"] - energy["forecastMwh"]
            )
    if not raw:
        return {"hours": 0}
    return {
        "hours": len(raw),
        "days": days,
        "rawMaeMw": sum(raw) / len(raw),
        "adjustedMaeMw": sum(adjusted) / len(adjusted),
        "bandCoveragePct": 100 * covered / len(raw),
        "daysAdjustedBetter": days_better,
    }


def accuracy_view(ds: WindDataset, cutoff: time) -> dict:
    decisions = [build_decision(ds, d, cutoff) for d in decision_days()]
    all_points = [p for d in decisions for p in d.points]
    errors, actuals = paired(all_points)

    daily = []
    for d in decisions:
        day_errors, day_actuals = paired(d.points)
        covered = [p for p in d.points if p.forecast is not None]
        complete = all(p.actual is not None for p in d.points)
        daily.append(
            {
                "decisionDay": d.decision_day.isoformat(),
                "deliveryDay": d.delivery_day.isoformat(),
                "forecastPublishTime": iso(d.publish_time),
                "forecastMwh": sum(p.forecast for p in covered),
                "actualMwh": sum(p.actual for p in d.points) if complete else None,
                **error_metrics(day_errors, day_actuals),
            }
        )

    by_hour: dict[int, list[HourPoint]] = {}
    for p in all_points:
        by_hour.setdefault(p.start.astimezone(UK).hour, []).append(p)
    hourly = [{"hour": h, **error_metrics(*paired(by_hour[h]))} for h in sorted(by_hour)]

    first_instant = to_utc(DECISION_FROM, time(0))
    last_instant = to_utc(DECISION_TO + timedelta(days=1), time(0))
    return {
        "cutoff": cutoff.strftime("%H:%M"),
        "overall": error_metrics(errors, actuals),
        "daily": daily,
        "byHourOfDay": hourly,
        "byLeadTime": lead_time_profile(ds, first_instant, last_instant),
        "errorHistogram": histogram(errors),
        "backtest": backtest(ds, cutoff),
    }


def vintages_view(ds: WindDataset, delivery_day: date) -> dict:
    hours = delivery_hours(delivery_day)
    window_start = hours[0] - timedelta(days=3)
    runs = []
    for publish in ds.publish_times:
        if not window_start <= publish < hours[-1] + HOUR:
            continue
        values = ds.forecasts[publish]
        if not any(h in values for h in hours):
            continue
        runs.append(
            {
                "publishTime": iso(publish),
                "values": [values.get(h) for h in hours],
            }
        )
    return {
        "deliveryDay": delivery_day.isoformat(),
        "hours": [iso(h) for h in hours],
        "actualMw": [ds.hourly_actual(h) for h in hours],
        "runs": runs,
    }

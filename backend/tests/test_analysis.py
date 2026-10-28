from datetime import UTC, date, datetime, time, timedelta

import pytest

from app import analysis
from app.dataset import HALF_HOUR, HOUR, WindDataset


def utc(*args: int) -> datetime:
    return datetime(*args, tzinfo=UTC)


def make_dataset(forecasts: dict[datetime, dict[datetime, float]], actual_mw: float = 1000.0) -> WindDataset:
    start, end = utc(2025, 12, 31), utc(2026, 2, 3)
    actuals = {}
    t = start
    while t < end:
        actuals[t] = actual_mw
        t += HALF_HOUR
    return WindDataset(actuals=actuals, forecasts=forecasts, publish_times=sorted(forecasts), fetched_at="test")


def flat_run(publish: datetime, mw: float, hours: int = 72) -> dict[datetime, float]:
    first_hour = publish.replace(minute=0)
    return {first_hour + HOUR * i: mw for i in range(-6, hours)}


def test_picks_latest_forecast_published_before_cutoff():
    runs = {
        utc(2026, 1, 10, 7, 30): flat_run(utc(2026, 1, 10, 7, 30), 900),
        utc(2026, 1, 10, 9, 30): flat_run(utc(2026, 1, 10, 9, 30), 1100),
    }
    ds = make_dataset(runs)

    before = analysis.build_decision(ds, date(2026, 1, 10), time(9, 20))
    after = analysis.build_decision(ds, date(2026, 1, 10), time(9, 30))

    assert before.publish_time == utc(2026, 1, 10, 7, 30)
    assert after.publish_time == utc(2026, 1, 10, 9, 30)
    assert before.delivery_day == date(2026, 1, 11)


def test_decision_covers_next_uk_day_with_lead_times():
    publish = utc(2026, 1, 10, 7, 30)
    decision = analysis.build_decision(make_dataset({publish: flat_run(publish, 900)}), date(2026, 1, 10), time(9, 20))

    assert len(decision.points) == 24
    assert decision.points[0].start == utc(2026, 1, 11, 0)
    assert decision.points[0].lead_hours == pytest.approx(16.5)
    assert decision.errors() == [100.0] * 24


def test_hourly_actual_averages_two_settlement_periods():
    ds = make_dataset({})
    ds.actuals[utc(2026, 1, 5, 3, 30)] = 2000.0
    assert ds.hourly_actual(utc(2026, 1, 5, 3)) == 1500.0


def test_hourly_actual_missing_period_is_none():
    ds = make_dataset({})
    del ds.actuals[utc(2026, 1, 5, 3, 30)]
    assert ds.hourly_actual(utc(2026, 1, 5, 3)) is None


def test_delivery_hours_handles_clock_changes():
    assert len(analysis.delivery_hours(date(2026, 3, 29))) == 23
    assert len(analysis.delivery_hours(date(2026, 10, 25))) == 25
    assert analysis.delivery_hours(date(2026, 7, 1))[0] == utc(2026, 6, 30, 23)


def test_error_metrics():
    m = analysis.error_metrics([100.0, -300.0], [1000.0, 1000.0])
    assert m["maeMw"] == 200.0
    assert m["biasMw"] == -100.0
    assert m["rmseMw"] == pytest.approx((50000) ** 0.5)
    assert m["wapePct"] == 20.0


def test_error_band_only_uses_settled_history():
    runs = {}
    for d in range(31):
        publish = utc(2025, 12, 31, 7, 30) + timedelta(days=d)
        runs[publish] = flat_run(publish, 900 if d < 12 else 500)
    ds = make_dataset(runs)

    decision = analysis.build_decision(ds, date(2026, 1, 12), time(9, 20))
    band = analysis.error_band(ds, decision, time(9, 20))

    assert band["basis"] == "rolling"
    assert band["historyDays"] == 10
    assert band["p90Mw"] == 100.0


def test_error_band_falls_back_to_pooled_without_history():
    publish = utc(2026, 1, 1, 7, 30)
    ds = make_dataset({publish: flat_run(publish, 900)})
    decision = analysis.build_decision(ds, date(2026, 1, 1), time(9, 20))
    assert analysis.error_band(ds, decision, time(9, 20))["basis"] == "pooled"


def test_missing_forecast_hours_are_reported_not_invented():
    publish = utc(2026, 1, 10, 7, 30)
    ds = make_dataset({publish: flat_run(publish, 900, hours=30)})
    view = analysis.decision_view(ds, date(2026, 1, 10), time(9, 20))
    assert view["hoursCovered"] < view["hoursInDay"]
    assert view["hours"][-1]["forecastMw"] is None


def test_backtest_rewards_bias_correction_on_biased_forecast():
    runs = {}
    for d in range(31):
        publish = utc(2025, 12, 31, 7, 30) + timedelta(days=d)
        runs[publish] = flat_run(publish, 1500)
    result = analysis.backtest(make_dataset(runs), time(9, 20))

    assert result["rawMaeMw"] == 500.0
    assert result["adjustedMaeMw"] == 0.0
    assert result["bandCoveragePct"] == 100.0

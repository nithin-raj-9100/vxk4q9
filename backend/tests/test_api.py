from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_meta():
    body = client.get("/api/meta").json()
    assert body["decisionFrom"] == "2026-01-01"
    assert body["defaultCutoff"] == "09:20"


def test_decision_uses_snapshot():
    body = client.get("/api/decision", params={"day": "2026-01-15"}).json()
    assert body["deliveryDay"] == "2026-01-16"
    assert body["forecastPublishTime"] <= body["decisionTime"]
    assert body["hoursCovered"] == 24


def test_decision_rejects_out_of_scope_day():
    assert client.get("/api/decision", params={"day": "2026-02-05"}).status_code == 422


def test_decision_rejects_bad_cutoff():
    assert client.get("/api/decision", params={"day": "2026-01-15", "cutoff": "25:00"}).status_code == 422


def test_accuracy_covers_every_decision_day():
    body = client.get("/api/accuracy").json()
    assert len(body["daily"]) == 31
    assert body["overall"]["count"] == 31 * 24


def test_vintages():
    body = client.get("/api/vintages", params={"deliveryDay": "2026-01-16"}).json()
    assert len(body["hours"]) == 24
    assert len(body["runs"]) > 5

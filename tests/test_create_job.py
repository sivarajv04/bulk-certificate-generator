"""Creating a generation job."""
from app.core.config import settings

API = "/api/v1/certificate-jobs"


def test_create_job_returns_202_and_job_details(client, job_payload):
    resp = client.post(API, json=job_payload([{"name": "Asha Rao", "email": "asha@example.com"}, {"name": "Ravi Kumar"}]))

    assert resp.status_code == 202
    body = resp.json()
    assert body["total_count"] == 2
    assert body["status"] == "PENDING"  # state at creation time; generation runs after
    assert body["status_url"] == f"{API}/{body['job_id']}"


def test_job_is_processed_in_background(client, job_payload):
    job_id = client.post(API, json=job_payload([{"name": "Asha Rao"}, {"name": "Ravi Kumar"}])).json()["job_id"]

    status = client.get(f"{API}/{job_id}").json()
    assert status["status"] == "COMPLETED"
    assert status["success_count"] == 2
    assert status["failed_count"] == 0
    assert status["completed_at"] is not None


def test_empty_recipient_list_is_rejected(client, job_payload):
    assert client.post(API, json=job_payload([])).status_code == 422


def test_missing_required_fields_are_rejected(client, job_payload):
    payload = job_payload([{"name": "Asha"}])
    del payload["event_name"]
    assert client.post(API, json=payload).status_code == 422


def test_too_many_recipients_is_rejected(client, job_payload, monkeypatch):
    monkeypatch.setattr(settings, "max_recipients", 2)
    resp = client.post(API, json=job_payload([{"name": n} for n in ("A", "B", "C")]))
    assert resp.status_code == 422
    assert "Too many recipients" in resp.json()["detail"]


def test_unprintable_job_text_is_rejected(client, job_payload):
    resp = client.post(API, json=job_payload([{"name": "Asha"}], event_name="வணக்கம்"))
    assert resp.status_code == 422

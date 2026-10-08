"""Job status/progress and failure isolation."""
from datetime import date


from app.models import Job
from app.services import generator, job_service
from app.services.processor import process_job

API = "/api/v1/certificate-jobs"


def test_status_before_processing_shows_zero_progress(db):
    job = job_service.create_job(
        db, title="T", event_name="E", issuer="I", issue_date=date(2026, 10, 8),
        recipients=[("Asha", None), ("Ravi", None)],
    )
    assert job.status == "PENDING"
    assert (job.success_count, job.failed_count) == (0, 0)
    assert job_service.job_progress_percent(job) == 0.0


def test_status_endpoint_reports_progress_fields(client, job_payload):
    job_id = client.post(API, json=job_payload([{"name": "Asha"}, {"name": "Ravi"}, {"name": ""}])).json()["job_id"]
    body = client.get(f"{API}/{job_id}").json()

    assert body["total_count"] == 3
    assert body["success_count"] == 2
    assert body["failed_count"] == 1
    assert body["pending_count"] == 0
    assert body["progress_percent"] == 100.0
    assert body["started_at"] and body["completed_at"]
    assert body["download_all_url"] == f"{API}/{job_id}/download"


def test_unknown_job_returns_404(client):
    assert client.get(f"{API}/does-not-exist").status_code == 404
    assert client.get(f"{API}/does-not-exist/certificates").status_code == 404


def _fail_for(monkeypatch, bad_name):
    real = generator.generate_certificate_pdf

    def flaky(data):
        if data.recipient_name == bad_name:
            raise RuntimeError("renderer exploded")
        return real(data)

    monkeypatch.setattr(generator, "generate_certificate_pdf", flaky)


def test_one_failed_certificate_does_not_stop_the_others(client, job_payload, monkeypatch):
    _fail_for(monkeypatch, "Bad Apple")
    names = ["Asha", "Bad Apple", "Ravi", "Meena"]
    job_id = client.post(API, json=job_payload([{"name": n} for n in names])).json()["job_id"]

    status = client.get(f"{API}/{job_id}").json()
    assert status["status"] == "COMPLETED_WITH_ERRORS"
    assert (status["success_count"], status["failed_count"]) == (3, 1)

    items = client.get(f"{API}/{job_id}/certificates").json()["items"]
    by_name = {i["recipient_name"]: i for i in items}
    assert by_name["Bad Apple"]["status"] == "FAILED"
    assert "renderer exploded" in by_name["Bad Apple"]["error"]
    assert by_name["Bad Apple"]["download_url"] is None
    assert all(by_name[n]["status"] == "SUCCESS" for n in ("Asha", "Ravi", "Meena"))


def test_job_where_every_certificate_fails_is_marked_failed(client, job_payload, monkeypatch):
    monkeypatch.setattr(generator, "generate_certificate_pdf", lambda data: (_ for _ in ()).throw(RuntimeError("boom")))
    job_id = client.post(API, json=job_payload([{"name": "A"}, {"name": "B"}])).json()["job_id"]

    status = client.get(f"{API}/{job_id}").json()
    assert status["status"] == "FAILED"
    assert status["failed_count"] == 2


def test_processing_a_finished_job_again_does_nothing(client, job_payload, db):
    job_id = client.post(API, json=job_payload([{"name": "Asha"}])).json()["job_id"]
    process_job(job_id)  # second run must be a no-op
    db.expire_all()
    job = db.get(Job, job_id)
    assert job.success_count == 1
    assert job.status == "COMPLETED"

"""Startup recovery, safe storage, health check."""
from datetime import date

import pytest

from app.models import Job
from app.services import job_service
from app.services.processor import recover_unfinished_jobs
from app.services.storage import LocalStorage


def test_unfinished_jobs_are_resumed(db):
    job = job_service.create_job(
        db, title="T", event_name="E", issuer="I", issue_date=date(2026, 10, 8),
        recipients=[("Asha", None), ("Ravi", None)],
    )
    assert job.status == "PENDING"  # simulates a server that died before processing

    assert recover_unfinished_jobs() == [job.id]

    db.expire_all()
    job = db.get(Job, job.id)
    assert job.status == "COMPLETED"
    assert job.success_count == 2


def test_recovery_ignores_finished_jobs(client, job_payload):
    client.post("/api/v1/certificate-jobs", json=job_payload([{"name": "Asha"}]))
    assert recover_unfinished_jobs() == []


def test_storage_rejects_path_traversal(tmp_path):
    storage = LocalStorage(tmp_path)
    with pytest.raises(ValueError):
        storage.resolve("../outside.pdf")


def test_storage_save_is_atomic_and_readable(tmp_path):
    storage = LocalStorage(tmp_path)
    key = storage.save("job-1", "item-1", b"%PDF-test")
    assert storage.resolve(key).read_bytes() == b"%PDF-test"
    assert not list(tmp_path.rglob("*.tmp"))


def test_health(client):
    assert client.get("/health").json() == {"status": "ok"}

import os
import shutil
import tempfile
from pathlib import Path

# Point the app at a throwaway database and storage folder BEFORE importing it.
_TMP = Path(tempfile.mkdtemp(prefix="certgen-tests-"))
os.environ["DATABASE_URL"] = f"sqlite:///{_TMP / 'test.db'}"
os.environ["STORAGE_DIR"] = str(_TMP / "storage")
os.environ["RECOVER_ON_STARTUP"] = "false"
os.environ["LOG_LEVEL"] = "WARNING"

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app.core.config import settings  # noqa: E402
from app.db.base import Base  # noqa: E402
from app.db.session import SessionLocal, engine  # noqa: E402
from app.main import app  # noqa: E402


@pytest.fixture(autouse=True)
def clean_state():
    """Fresh tables and an empty storage folder for every test."""
    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    shutil.rmtree(settings.storage_dir, ignore_errors=True)
    settings.storage_dir.mkdir(parents=True, exist_ok=True)
    yield


@pytest.fixture
def client():
    # TestClient waits for background tasks, so by the time a POST returns
    # the job has been fully processed.
    with TestClient(app) as c:
        yield c


@pytest.fixture
def db():
    with SessionLocal() as session:
        yield session


@pytest.fixture
def job_payload():
    def _make(recipients, **overrides):
        payload = {
            "title": "Certificate of Participation",
            "event_name": "Python Backend Workshop 2026",
            "issuer": "Aereo Academy",
            "issue_date": "2026-10-08",
            "recipients": recipients,
        }
        payload.update(overrides)
        return payload

    return _make

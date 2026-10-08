"""Database engine and session factory."""
from collections.abc import Iterator
from pathlib import Path

from sqlalchemy import create_engine, event
from sqlalchemy.engine import Engine, make_url
from sqlalchemy.orm import Session, sessionmaker

from app.core.config import settings


def _build_engine(url: str) -> Engine:
    parsed = make_url(url)
    kwargs: dict = {"pool_pre_ping": True}
    is_sqlite = parsed.get_backend_name() == "sqlite"
    if is_sqlite:
        if parsed.database and parsed.database != ":memory:":
            Path(parsed.database).parent.mkdir(parents=True, exist_ok=True)
        # Background jobs use their own sessions from other threads.
        kwargs["connect_args"] = {"check_same_thread": False, "timeout": 30}

    eng = create_engine(url, **kwargs)

    if is_sqlite:
        @event.listens_for(eng, "connect")
        def _enable_fk(dbapi_conn, _record):  # pragma: no cover - trivial
            cursor = dbapi_conn.cursor()
            cursor.execute("PRAGMA foreign_keys=ON")
            cursor.close()

    return eng


engine = _build_engine(settings.database_url)
SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


def get_db() -> Iterator[Session]:
    """FastAPI dependency: one session per request."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

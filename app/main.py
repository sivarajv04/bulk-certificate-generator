"""Application entry point."""
import threading
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

import app.models  # noqa: F401  (registers tables on Base.metadata)
from app.api import certificates, health, jobs
from app.core.config import settings
from app.core.logging import configure_logging, get_logger
from app.db.base import Base
from app.db.session import engine
from app.services.processor import recover_unfinished_jobs

API_PREFIX = "/api/v1"


def create_app() -> FastAPI:
    configure_logging()
    logger = get_logger(__name__)

    @asynccontextmanager
    async def lifespan(_app: FastAPI):
        settings.storage_dir.mkdir(parents=True, exist_ok=True)
        if settings.auto_create_tables:
            Base.metadata.create_all(engine)
        if settings.recover_on_startup:
            # Resume anything a previous run left unfinished, without blocking startup.
            threading.Thread(target=recover_unfinished_jobs, daemon=True, name="job-recovery").start()
        logger.info("app_started", database=engine.url.render_as_string(hide_password=True))
        yield

    application = FastAPI(
        title=settings.app_name,
        version="0.1.0",
        description="Submit a list of recipients, get PDF certificates generated in the background.",
        lifespan=lifespan,
    )

    application.add_middleware(
        CORSMiddleware,
        allow_origins=[origin.strip() for origin in settings.cors_origins.split(",") if origin.strip()],
        allow_credentials=False,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    application.include_router(health.router)
    application.include_router(jobs.router, prefix=API_PREFIX)
    application.include_router(certificates.router, prefix=API_PREFIX)
    return application


app = create_app()

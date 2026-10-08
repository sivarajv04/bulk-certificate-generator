"""Request and response models."""
from datetime import date, datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.models import ItemStatus
from app.services.fonts import unsupported_characters


class RecipientIn(BaseModel):
    """Deliberately lenient: per-recipient problems are reported per item
    (as FAILED rows), not as a 422 for the whole request."""

    model_config = ConfigDict(extra="ignore")
    name: Any = None
    email: Any = None


class JobCreate(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    title: str = Field(min_length=1, max_length=80, examples=["Certificate of Participation"])
    event_name: str = Field(min_length=1, max_length=150, examples=["Python Backend Workshop 2026"])
    issuer: str = Field(min_length=1, max_length=80, examples=["Aereo Academy"])
    issue_date: date
    recipients: list[RecipientIn] = Field(min_length=1)

    @field_validator("title", "event_name", "issuer")
    @classmethod
    def _printable(cls, value: str) -> str:
        bad = unsupported_characters(value)
        if bad:
            raise ValueError(f"contains characters the certificate font cannot print: {' '.join(bad[:5])}")
        return value


class JobCreatedResponse(BaseModel):
    job_id: str
    status: str
    total_count: int
    status_url: str


class JobStatusResponse(BaseModel):
    job_id: str
    title: str
    event_name: str
    issuer: str
    issue_date: date
    status: str
    total_count: int
    success_count: int
    failed_count: int
    pending_count: int
    progress_percent: float
    created_at: datetime
    started_at: datetime | None
    completed_at: datetime | None
    certificates_url: str
    download_all_url: str | None  # set once at least one certificate exists


class ItemOut(BaseModel):
    id: str
    certificate_number: str | None
    recipient_name: str
    email: str | None
    status: ItemStatus
    error: str | None
    download_url: str | None


class ItemPage(BaseModel):
    page: int
    page_size: int
    total: int
    items: list[ItemOut]

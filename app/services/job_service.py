"""Creating and querying jobs."""
from datetime import UTC, date, datetime
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.logging import get_logger
from app.models import ItemStatus, Job, JobItem, JobStatus
from app.services.validation import RecipientValidationError, validate_recipient

logger = get_logger(__name__)


def format_certificate_number(item_id: int, year: int | None = None) -> str:
    """e.g. CERT-2026-000123. Built from the item's unique database id, so it is
    unique and race-free without needing a database sequence."""
    year = year or datetime.now(UTC).year
    return f"{settings.certificate_prefix}-{year}-{item_id:06d}"


def _raw_text(value: Any, limit: int) -> str | None:
    if value is None:
        return None
    return str(value)[:limit]


def create_job(
    db: Session,
    *,
    title: str,
    event_name: str,
    issuer: str,
    issue_date: date,
    recipients: list[tuple[Any, Any]],
) -> Job:
    """Validate every recipient, store everything, and return the new job.

    Valid recipients become PENDING items (and get a certificate number).
    Invalid ones are stored as FAILED with the reason, so the status API can
    report exactly what was wrong without rejecting the whole request.
    """
    now = datetime.now(UTC)
    job = Job(title=title, event_name=event_name, issuer=issuer, issue_date=issue_date)
    db.add(job)

    failed = 0
    for raw_name, raw_email in recipients:
        try:
            valid = validate_recipient(raw_name, raw_email, settings.max_name_length)
        except RecipientValidationError as exc:
            failed += 1
            job.items.append(
                JobItem(
                    recipient_name=_raw_text(raw_name, 255) or "",
                    email=_raw_text(raw_email, 320),
                    status=ItemStatus.FAILED.value,
                    error_message=str(exc),
                    completed_at=now,
                )
            )
        else:
            job.items.append(
                JobItem(recipient_name=valid.name, email=valid.email, status=ItemStatus.PENDING.value)
            )

    job.total_count = len(job.items)
    job.failed_count = failed
    db.flush()  # assigns integer ids to the items

    for item in job.items:
        if item.status == ItemStatus.PENDING.value:
            item.certificate_number = format_certificate_number(item.id, now.year)

    if failed == job.total_count:
        job.status = JobStatus.FAILED.value
        job.completed_at = now
    db.commit()

    logger.info(
        "job_created",
        job_id=job.id,
        total=job.total_count,
        invalid=failed,
        status=job.status,
    )
    return job


def get_job(db: Session, job_id: str) -> Job | None:
    return db.get(Job, job_id)


def get_item_by_uid(db: Session, uid: str) -> JobItem | None:
    return db.scalar(select(JobItem).where(JobItem.uid == uid))


def list_items(
    db: Session, job_id: str, *, status: str | None, page: int, page_size: int
) -> tuple[list[JobItem], int]:
    query = select(JobItem).where(JobItem.job_id == job_id)
    count_query = select(func.count()).select_from(JobItem).where(JobItem.job_id == job_id)
    if status:
        query = query.where(JobItem.status == status)
        count_query = count_query.where(JobItem.status == status)
    total = db.scalar(count_query) or 0
    items = db.scalars(
        query.order_by(JobItem.id).offset((page - 1) * page_size).limit(page_size)
    ).all()
    return list(items), total


def job_progress_percent(job: Job) -> float:
    if job.total_count == 0:
        return 100.0
    done = job.success_count + job.failed_count
    return round(done / job.total_count * 100, 1)

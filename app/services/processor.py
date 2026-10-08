"""Background processing of a job.

`process_job` is the only place certificates are generated. It owns its own DB
session (it runs outside the request), commits after every item so progress is
visible live, and isolates failures per item. It only touches PENDING items, so
running it again on a half-finished job safely resumes the remaining work.
"""
from datetime import UTC, datetime

from sqlalchemy import select

from app.core.logging import get_logger
from app.db.session import SessionLocal
from app.models import ItemStatus, Job, JobItem, JobStatus
from app.services import generator
from app.services.storage import get_storage

logger = get_logger(__name__)


def _short_error(exc: Exception) -> str:
    return f"{type(exc).__name__}: {exc}"[:500]


def _final_status(job: Job) -> str:
    if job.success_count == job.total_count:
        return JobStatus.COMPLETED.value
    if job.success_count == 0:
        return JobStatus.FAILED.value
    return JobStatus.COMPLETED_WITH_ERRORS.value


def process_job(job_id: str) -> None:
    log = logger.bind(job_id=job_id)
    storage = get_storage()

    try:
        with SessionLocal() as db:
            job = db.get(Job, job_id)
            if job is None:
                log.warning("job_not_found")
                return
            if job.status not in (JobStatus.PENDING.value, JobStatus.PROCESSING.value):
                log.info("job_already_finished", status=job.status)
                return

            job.status = JobStatus.PROCESSING.value
            job.started_at = job.started_at or datetime.now(UTC)
            db.commit()
            log.info("job_started", total=job.total_count)

            pending_ids = db.scalars(
                select(JobItem.id)
                .where(JobItem.job_id == job_id, JobItem.status == ItemStatus.PENDING.value)
                .order_by(JobItem.id)
            ).all()

            for item_id in pending_ids:
                item = db.get(JobItem, item_id)
                try:
                    pdf = generator.generate_certificate_pdf(
                        generator.CertificateData(
                            recipient_name=item.recipient_name,
                            certificate_number=item.certificate_number,
                            title=job.title,
                            event_name=job.event_name,
                            issuer=job.issuer,
                            issue_date=job.issue_date,
                        )
                    )
                    key = storage.save(job.id, item.uid, pdf)
                except Exception as exc:  # one bad certificate must not stop the job
                    db.rollback()
                    item = db.get(JobItem, item_id)
                    item.status = ItemStatus.FAILED.value
                    item.error_message = _short_error(exc)
                    item.completed_at = datetime.now(UTC)
                    job.failed_count += 1
                    log.warning(
                        "certificate_failed",
                        certificate_number=item.certificate_number,
                        error=item.error_message,
                    )
                else:
                    item.status = ItemStatus.SUCCESS.value
                    item.file_path = key
                    item.completed_at = datetime.now(UTC)
                    job.success_count += 1
                db.commit()

            job.status = _final_status(job)
            job.completed_at = datetime.now(UTC)
            db.commit()
            log.info(
                "job_completed",
                status=job.status,
                success=job.success_count,
                failed=job.failed_count,
            )
    except Exception:
        # Unexpected infrastructure failure (e.g. DB down). The job stays
        # PROCESSING and is picked up again by recover_unfinished_jobs().
        log.exception("job_processing_crashed")
        raise


def recover_unfinished_jobs() -> list[str]:
    """Resume jobs left PENDING/PROCESSING (e.g. the server restarted mid-job)."""
    with SessionLocal() as db:
        job_ids = db.scalars(
            select(Job.id)
            .where(Job.status.in_([JobStatus.PENDING.value, JobStatus.PROCESSING.value]))
            .order_by(Job.created_at)
        ).all()
    for job_id in job_ids:
        logger.info("job_recovering", job_id=job_id)
        try:
            process_job(job_id)
        except Exception:  # keep recovering the rest
            continue
    return list(job_ids)

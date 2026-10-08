"""Certificate job endpoints."""
import os
import re
import tempfile
import zipfile

from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, HTTPException, Query, Request, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy import select
from sqlalchemy.orm import Session
from starlette.background import BackgroundTask

from app.core.config import settings
from app.db.session import get_db
from app.models import ItemStatus, JobItem, JobStatus
from app.schemas.job import ItemOut, ItemPage, JobCreate, JobCreatedResponse, JobStatusResponse
from app.services import job_service
from app.services.importer import parse_recipient_file
from app.services.processor import process_job
from app.services.storage import get_storage

router = APIRouter(prefix="/certificate-jobs", tags=["certificate jobs"])


def _item_out(request: Request, item: JobItem) -> ItemOut:
    url = None
    if item.status == ItemStatus.SUCCESS.value:
        url = request.app.url_path_for("download_certificate", item_uid=item.uid)
    return ItemOut(
        id=item.uid,
        certificate_number=item.certificate_number,
        recipient_name=item.recipient_name,
        email=item.email,
        status=item.status,
        error=item.error_message,
        download_url=str(url) if url else None,
    )


def _require_job(db: Session, job_id: str):
    job = job_service.get_job(db, job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Job not found")
    return job


def _preview_row(row):
    return {
        "row_number": row.row_number,
        "values": [None if value is None else str(value) for value in row.values],
        "name": row.name,
        "email": row.email,
        "valid": row.valid,
        "error": row.error,
    }


@router.post("/import-preview", name="preview_recipient_import")
async def preview_recipient_import(
    file: UploadFile = File(...),
    name_column: int | None = Form(None),
    email_column: int | None = Form(None),
):
    """Parse a CSV/XLSX recipient list, validate every row, and return a preview.

    No database job is created by this endpoint. The frontend can use the returned
    valid recipients to call the normal bulk job endpoint after the user reviews
    the mapping and validation results.
    """
    data = await file.read()
    try:
        headers, detected_name, detected_email, rows = parse_recipient_file(
            filename=file.filename or "",
            data=data,
            name_column=name_column,
            email_column=email_column,
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    seen_names: set[str] = set()
    duplicate_rows: set[int] = set()
    for row in rows:
        if row.valid and row.name:
            key = row.name.casefold()
            if key in seen_names:
                duplicate_rows.add(row.row_number)
            seen_names.add(key)

    valid_rows = [row for row in rows if row.valid]
    recipients = [
        {"name": row.name, **({"email": row.email} if row.email else {})}
        for row in valid_rows
    ]

    return {
        "filename": file.filename,
        "columns": [{"index": i, "name": header} for i, header in enumerate(headers)],
        "name_column": detected_name,
        "email_column": detected_email,
        "name_column_required": detected_name is None,
        "total_rows": len(rows),
        "valid_count": len(valid_rows),
        "invalid_count": len(rows) - len(valid_rows),
        "duplicate_count": len(duplicate_rows),
        "recipients": recipients,
        "rows": [
            {**_preview_row(row), "duplicate": row.row_number in duplicate_rows}
            for row in rows
        ],
    }


@router.post("", response_model=JobCreatedResponse, status_code=202)
def create_certificate_job(
    payload: JobCreate,
    background_tasks: BackgroundTasks,
    request: Request,
    db: Session = Depends(get_db),
):
    """Submit a bulk request. Returns immediately (202); generation runs in the
    background. Poll `status_url` for progress."""
    if len(payload.recipients) > settings.max_recipients:
        raise HTTPException(
            status_code=422,
            detail=f"Too many recipients: {len(payload.recipients)} (maximum {settings.max_recipients} per request)",
        )

    job = job_service.create_job(
        db,
        title=payload.title,
        event_name=payload.event_name,
        issuer=payload.issuer,
        issue_date=payload.issue_date,
        recipients=[(r.name, r.email) for r in payload.recipients],
    )
    if job.status == JobStatus.PENDING.value:
        background_tasks.add_task(process_job, job.id)

    return JobCreatedResponse(
        job_id=job.id,
        status=job.status,
        total_count=job.total_count,
        status_url=str(request.app.url_path_for("get_certificate_job", job_id=job.id)),
    )


@router.get("/{job_id}", response_model=JobStatusResponse, name="get_certificate_job")
def get_certificate_job(job_id: str, request: Request, db: Session = Depends(get_db)):
    job = _require_job(db, job_id)
    return JobStatusResponse(
        job_id=job.id,
        title=job.title,
        event_name=job.event_name,
        issuer=job.issuer,
        issue_date=job.issue_date,
        status=job.status,
        total_count=job.total_count,
        success_count=job.success_count,
        failed_count=job.failed_count,
        pending_count=job.total_count - job.success_count - job.failed_count,
        progress_percent=job_service.job_progress_percent(job),
        created_at=job.created_at,
        started_at=job.started_at,
        completed_at=job.completed_at,
        certificates_url=str(request.app.url_path_for("list_job_certificates", job_id=job.id)),
        download_all_url=(
            str(request.app.url_path_for("download_job_zip", job_id=job.id))
            if job.success_count > 0
            else None
        ),
    )


@router.get("/{job_id}/certificates", response_model=ItemPage, name="list_job_certificates")
def list_job_certificates(
    job_id: str,
    request: Request,
    status: ItemStatus | None = Query(None, description="Filter by item status"),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=100),
    db: Session = Depends(get_db),
):
    """Every recipient in the job with its result, so failures are easy to find."""
    _require_job(db, job_id)
    items, total = job_service.list_items(
        db, job_id, status=status.value if status else None, page=page, page_size=page_size
    )
    return ItemPage(
        page=page,
        page_size=page_size,
        total=total,
        items=[_item_out(request, i) for i in items],
    )


def _safe_filename(text: str) -> str:
    return re.sub(r"[^A-Za-z0-9]+", "_", text).strip("_")[:40] or "certificate"


@router.get("/{job_id}/download", name="download_job_zip")
def download_job_zip(job_id: str, db: Session = Depends(get_db)):
    """All successfully generated certificates of a job as one ZIP."""
    _require_job(db, job_id)
    items = db.scalars(
        select(JobItem)
        .where(JobItem.job_id == job_id, JobItem.status == ItemStatus.SUCCESS.value)
        .order_by(JobItem.id)
    ).all()
    if not items:
        raise HTTPException(status_code=409, detail="No certificates have been generated for this job yet")

    storage = get_storage()
    # Build on disk, not in memory: a 1000-certificate ZIP can be tens of MB.
    fd, tmp_path = tempfile.mkstemp(suffix=".zip")
    os.close(fd)
    try:
        with zipfile.ZipFile(tmp_path, "w", zipfile.ZIP_STORED) as zf:
            for item in items:
                arcname = f"{item.certificate_number}_{_safe_filename(item.recipient_name)}.pdf"
                zf.write(storage.resolve(item.file_path), arcname=arcname)
    except Exception:
        os.unlink(tmp_path)
        raise

    return FileResponse(
        tmp_path,
        media_type="application/zip",
        filename=f"certificates_{job_id}.zip",
        background=BackgroundTask(os.unlink, tmp_path),
    )

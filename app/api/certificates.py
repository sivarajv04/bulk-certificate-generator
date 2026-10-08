"""Single-certificate endpoints."""
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models import ItemStatus
from app.services import job_service
from app.services.storage import get_storage

router = APIRouter(prefix="/certificates", tags=["certificates"])


@router.get("/{item_uid}/download", name="download_certificate")
def download_certificate(item_uid: str, db: Session = Depends(get_db)):
    item = job_service.get_item_by_uid(db, item_uid)
    if item is None:
        raise HTTPException(status_code=404, detail="Certificate not found")
    if item.status == ItemStatus.FAILED.value:
        raise HTTPException(status_code=409, detail=f"Certificate generation failed: {item.error_message}")
    if item.status != ItemStatus.SUCCESS.value:
        raise HTTPException(status_code=409, detail="Certificate is not ready yet")

    path = get_storage().resolve(item.file_path)
    if not path.exists():
        raise HTTPException(status_code=404, detail="Certificate file is missing")
    return FileResponse(path, media_type="application/pdf", filename=f"{item.certificate_number}.pdf")

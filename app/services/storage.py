"""File storage behind a small interface so S3 or similar can replace local disk later."""
import os
from pathlib import Path
from typing import Protocol

from app.core.config import settings


class StorageBackend(Protocol):
    def save(self, job_id: str, item_uid: str, data: bytes) -> str: ...
    def resolve(self, key: str) -> Path: ...


class LocalStorage:
    def __init__(self, base_dir: Path):
        self.base_dir = Path(base_dir)

    def save(self, job_id: str, item_uid: str, data: bytes) -> str:
        """Write atomically (temp file + rename) and return the storage key.

        Keys are built only from server-generated UUIDs, never user input.
        """
        key = f"{job_id}/{item_uid}.pdf"
        target = self.resolve(key)
        target.parent.mkdir(parents=True, exist_ok=True)
        tmp = target.with_name(target.name + ".tmp")
        tmp.write_bytes(data)
        os.replace(tmp, target)
        return key

    def resolve(self, key: str) -> Path:
        base = self.base_dir.resolve()
        path = (base / key).resolve()
        if base not in path.parents:
            raise ValueError("invalid storage key")
        return path


def get_storage() -> LocalStorage:
    return LocalStorage(settings.storage_dir)

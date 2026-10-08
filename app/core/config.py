"""Application settings, loaded from environment variables or a .env file."""
from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    app_name: str = "Bulk Certificate Generator"

    # Defaults to SQLite so the app runs with zero setup.
    # For PostgreSQL use e.g. postgresql+psycopg://user:pass@localhost:5432/certgen
    database_url: str = "sqlite:///./data/certgen.db"
    storage_dir: Path = Path("./data/storage")

    max_recipients: int = 1000
    max_import_file_bytes: int = 5 * 1024 * 1024
    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173"
    max_name_length: int = 100
    certificate_prefix: str = "CERT"

    auto_create_tables: bool = True
    recover_on_startup: bool = True

    log_json: bool = False
    log_level: str = "INFO"


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()

"""Per-recipient validation.

Problems with one recipient never reject the whole request: the recipient is
stored as a FAILED item with a human-readable reason instead.
"""
import re
import unicodedata
from dataclasses import dataclass
from typing import Any

from app.services.fonts import unsupported_characters

_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
MAX_EMAIL_LENGTH = 254


class RecipientValidationError(ValueError):
    """Raised with a message that is safe to show to the API client."""


@dataclass(frozen=True)
class ValidatedRecipient:
    name: str
    email: str | None


def validate_name(raw: Any, max_length: int) -> str:
    if raw is None:
        raise RecipientValidationError("name is required")
    if not isinstance(raw, str):
        raise RecipientValidationError("name must be text")

    name = " ".join(raw.split())  # trim and collapse any run of whitespace
    if not name:
        raise RecipientValidationError("name is required")
    if len(name) > max_length:
        raise RecipientValidationError(f"name is too long (max {max_length} characters)")
    if any(unicodedata.category(ch).startswith("C") for ch in name):
        raise RecipientValidationError("name contains control or non-printable characters")

    bad = unsupported_characters(name)
    if bad:
        shown = " ".join(bad[:5])
        raise RecipientValidationError(f"name contains characters the certificate font cannot print: {shown}")
    return name


def validate_email(raw: Any) -> str | None:
    if raw is None:
        return None
    if not isinstance(raw, str):
        raise RecipientValidationError("email must be text")
    email = raw.strip()
    if not email:
        return None
    if len(email) > MAX_EMAIL_LENGTH or not _EMAIL_RE.match(email):
        raise RecipientValidationError("email is not a valid address")
    return email


def validate_recipient(raw_name: Any, raw_email: Any, max_name_length: int) -> ValidatedRecipient:
    return ValidatedRecipient(
        name=validate_name(raw_name, max_name_length),
        email=validate_email(raw_email),
    )

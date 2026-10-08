"""Certificate generation."""
import io
from datetime import date

import pytest
from pypdf import PdfReader

from app.services.generator import CertificateData, GenerationError, generate_certificate_pdf


def _data(**overrides):
    base = dict(
        recipient_name="Asha Rao",
        certificate_number="CERT-2026-000042",
        title="Certificate of Participation",
        event_name="Python Backend Workshop 2026",
        issuer="Aereo Academy",
        issue_date=date(2026, 10, 8),
    )
    base.update(overrides)
    return CertificateData(**base)


def _text(pdf_bytes: bytes) -> str:
    return PdfReader(io.BytesIO(pdf_bytes)).pages[0].extract_text()


def test_generates_a_valid_single_page_pdf():
    pdf = generate_certificate_pdf(_data())
    assert pdf.startswith(b"%PDF")
    assert len(PdfReader(io.BytesIO(pdf)).pages) == 1


def test_certificate_contains_name_number_and_details():
    text = _text(generate_certificate_pdf(_data()))
    assert "Asha Rao" in text
    assert "CERT-2026-000042" in text
    assert "Python Backend Workshop 2026" in text
    assert "08 October 2026" in text
    assert "Aereo Academy" in text


def test_accented_names_render():
    assert "José Núñez" in _text(generate_certificate_pdf(_data(recipient_name="José Núñez")))


def test_long_names_shrink_to_fit():
    name = "Alexandria Catherine Montgomery-Featherstonehaugh"
    assert name in _text(generate_certificate_pdf(_data(recipient_name=name)))


def test_name_that_cannot_fit_fails_instead_of_being_truncated():
    with pytest.raises(GenerationError, match="does not fit"):
        generate_certificate_pdf(_data(recipient_name="W" * 100))


def test_unsupported_characters_fail_clearly():
    with pytest.raises(GenerationError, match="unsupported characters"):
        generate_certificate_pdf(_data(recipient_name="வணக்கம்"))

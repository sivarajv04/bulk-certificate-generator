"""Certificate PDF rendering (ReportLab). One predefined template: "classic"."""
import io
from dataclasses import dataclass
from datetime import date

from reportlab.lib.colors import HexColor
from reportlab.lib.pagesizes import A4, landscape
from reportlab.pdfgen import canvas

from app.services.fonts import (
    FONT_BOLD,
    FONT_REGULAR,
    fit_font_size,
    register_fonts,
    text_width,
    unsupported_characters,
)

PAGE_W, PAGE_H = landscape(A4)
CONTENT_W = PAGE_W - 160  # keeps text clear of the double border

NAVY = HexColor("#1f3a5f")
GOLD = HexColor("#b8913b")
GREY = HexColor("#555555")
BLACK = HexColor("#111111")


class GenerationError(Exception):
    """A single certificate could not be generated."""


@dataclass(frozen=True)
class CertificateData:
    recipient_name: str
    certificate_number: str
    title: str
    event_name: str
    issuer: str
    issue_date: date


def _draw_centered(
    c: canvas.Canvas,
    text: str,
    *,
    font: str,
    max_size: float,
    min_size: float,
    y: float,
    max_width: float = CONTENT_W,
    x: float = PAGE_W / 2,
    color=BLACK,
    allow_truncate: bool = False,
) -> float:
    """Draw centered text shrunk to fit. Returns the drawn text width.

    Recipient names must never be altered, so truncation is opt-in and only
    used for job-level text such as the event name.
    """
    size = fit_font_size(text, font, max_size, min_size, max_width)
    if size is None:
        if not allow_truncate:
            raise GenerationError(f"text does not fit on the certificate: {text[:40]!r}")
        size = min_size
        while len(text) > 1 and text_width(text + "…", font, size) > max_width:
            text = text[:-1]
        text = text.rstrip() + "…"
    c.setFont(font, size)
    c.setFillColor(color)
    c.drawCentredString(x, y, text)
    return text_width(text, font, size)


def generate_certificate_pdf(data: CertificateData) -> bytes:
    register_fonts()

    for label, text in (
        ("name", data.recipient_name),
        ("title", data.title),
        ("event", data.event_name),
        ("issuer", data.issuer),
    ):
        bad = unsupported_characters(text)
        if bad:
            raise GenerationError(f"{label} contains unsupported characters: {' '.join(bad[:5])}")

    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=(PAGE_W, PAGE_H))
    c.setTitle(f"{data.title} - {data.certificate_number}")
    c.setAuthor(data.issuer)
    c.setSubject(data.event_name)

    # Double border
    c.setStrokeColor(NAVY)
    c.setLineWidth(3)
    c.rect(20, 20, PAGE_W - 40, PAGE_H - 40)
    c.setStrokeColor(GOLD)
    c.setLineWidth(1)
    c.rect(30, 30, PAGE_W - 60, PAGE_H - 60)

    _draw_centered(c, data.title, font=FONT_BOLD, max_size=34, min_size=18, y=PAGE_H - 110,
                   color=NAVY, allow_truncate=True)
    _draw_centered(c, "This is to certify that", font=FONT_REGULAR, max_size=16, min_size=16,
                   y=PAGE_H - 170, color=GREY)

    name_w = _draw_centered(c, data.recipient_name, font=FONT_BOLD, max_size=44, min_size=10,
                            y=PAGE_H - 240, color=BLACK)
    c.setStrokeColor(GOLD)
    c.setLineWidth(1)
    line_half = max(name_w, 260) / 2 + 20
    c.line(PAGE_W / 2 - line_half, PAGE_H - 252, PAGE_W / 2 + line_half, PAGE_H - 252)

    _draw_centered(c, "has successfully participated in", font=FONT_REGULAR, max_size=16, min_size=16,
                   y=PAGE_H - 295, color=GREY)
    _draw_centered(c, data.event_name, font=FONT_BOLD, max_size=26, min_size=14, y=PAGE_H - 340,
                   color=NAVY, allow_truncate=True)
    _draw_centered(c, f"Issued on {data.issue_date.strftime('%d %B %Y')}", font=FONT_REGULAR,
                   max_size=14, min_size=14, y=PAGE_H - 385, color=GREY)

    # Signature block (right) and certificate number (left)
    sig_x = PAGE_W - 170
    c.setStrokeColor(GREY)
    c.setLineWidth(0.8)
    c.line(sig_x - 100, 110, sig_x + 100, 110)
    _draw_centered(c, data.issuer, font=FONT_REGULAR, max_size=13, min_size=9, y=92, x=sig_x,
                   max_width=200, color=BLACK, allow_truncate=True)
    _draw_centered(c, "Issuer", font=FONT_REGULAR, max_size=10, min_size=10, y=77, x=sig_x,
                   max_width=200, color=GREY)

    c.setFont(FONT_REGULAR, 12)
    c.setFillColor(GREY)
    c.drawString(60, 62, f"Certificate No: {data.certificate_number}")

    c.showPage()
    c.save()
    return buf.getvalue()

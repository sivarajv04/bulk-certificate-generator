"""Font registration and text-measurement helpers for certificate rendering.

DejaVu Sans is bundled so the app works on any machine (no system fonts needed).
It covers Latin (incl. accented), Greek and Cyrillic. Scripts it does not cover
(e.g. Tamil, Devanagari) are rejected up front instead of rendering as empty boxes.
"""
import threading
from pathlib import Path

from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont

FONT_REGULAR = "DejaVuSans"
FONT_BOLD = "DejaVuSans-Bold"

_FONT_DIR = Path(__file__).resolve().parent.parent / "assets" / "fonts"
_lock = threading.Lock()
_registered = False


def register_fonts() -> None:
    global _registered
    if _registered:
        return
    with _lock:
        if _registered:
            return
        pdfmetrics.registerFont(TTFont(FONT_REGULAR, str(_FONT_DIR / "DejaVuSans.ttf")))
        pdfmetrics.registerFont(TTFont(FONT_BOLD, str(_FONT_DIR / "DejaVuSans-Bold.ttf")))
        _registered = True


def unsupported_characters(text: str) -> list[str]:
    """Characters in `text` that the certificate font cannot draw (unique, in order)."""
    register_fonts()
    glyphs = pdfmetrics.getFont(FONT_REGULAR).face.charToGlyph
    bold_glyphs = pdfmetrics.getFont(FONT_BOLD).face.charToGlyph
    missing: list[str] = []
    for ch in text:
        if (ord(ch) not in glyphs or ord(ch) not in bold_glyphs) and ch not in missing:
            missing.append(ch)
    return missing


def text_width(text: str, font: str, size: float) -> float:
    register_fonts()
    return pdfmetrics.stringWidth(text, font, size)


def fit_font_size(text: str, font: str, max_size: float, min_size: float, max_width: float) -> float | None:
    """Largest size in [min_size, max_size] at which `text` fits `max_width`, else None."""
    size = max_size
    while size >= min_size:
        if text_width(text, font, size) <= max_width:
            return size
        size -= 1
    return None

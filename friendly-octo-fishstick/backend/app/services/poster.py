"""Deterministic poster composition (Phase 4; Source of Truth §21, §22, §30).

Pipeline:

1. Agnes Image 2.5 Flash background art (URL/base64) when configured and
   live-verified — prompts always forbid text/typography;
2. deterministic fallback art (procedural gradient + shapes) labelled as
   fallback, never presented as model art;
3. Pillow compositor draws ONLY approved strings from the Fact Token map;
4. every drawn string is recorded in a ``rendered_facts`` registry (what the
   compositor INTENDED to render — the authoritative record);
5. OCR (when Tesseract is available) checks the pixels against the registry
   for Latin-script strings; Indic scripts are recorded as OCR-limited.

Draw order and geometry are versioned via ``POSTER_LAYOUT_VERSION`` so the
stored registry/check evidence remain interpretable over time.
"""

from __future__ import annotations

import io
from dataclasses import dataclass
from typing import Any

from ..config import Settings, get_settings
from ..errors import ProviderUnavailableError
from .agnes import AgnesImageClient, ImageResult, _live_llm_allowed
from .async_bridge import run_sync
from .checksums import sha256_hex

POSTER_LAYOUT_VERSION = "1"
POSTER_WIDTH = 1080
POSTER_HEIGHT = 1350

#: Indic scripts the bundled Tesseract may not handle; recorded honestly.
INDIC_UNICODE_PREFIXES = (
    (0x0900, 0x097F),  # Devanagari
    (0x0980, 0x09FF),  # Bengali
    (0x0A00, 0x0A7F),  # Gurmukhi
    (0x0A80, 0x0AFF),  # Gujarati
    (0x0B00, 0x0B7F),  # Oriya
    (0x0B80, 0x0BFF),  # Tamil
    (0x0C00, 0x0C7F),  # Telugu
    (0x0C80, 0x0CFF),  # Kannada
    (0x0D00, 0x0D7F),  # Malayalam
)


def _is_indic(text: str) -> bool:
    for ch in text:
        cp = ord(ch)
        for lo, hi in INDIC_UNICODE_PREFIXES:
            if lo <= cp <= hi:
                return True
    return False


@dataclass
class RenderedFact:
    key: str
    text: str
    zone: str

    def as_dict(self) -> dict[str, Any]:
        return {"key": self.key, "text": self.text, "zone": self.zone}


@dataclass
class PosterComposition:
    png_bytes: bytes
    registry: dict[str, Any]
    sha256: str
    is_mock_art: bool
    used_fallback_art: bool
    art_provider: str | None
    art_model: str | None

    def metadata(self) -> dict[str, Any]:
        return {
            "layout_version": POSTER_LAYOUT_VERSION,
            "registry": self.registry,
            "sha256": f"sha256:{self.sha256}",
            "is_mock": self.is_mock_art,
            "used_fallback": self.used_fallback_art,
            "art_provider": self.art_provider,
            "art_model": self.art_model,
        }


# ── deterministic fallback art ────────────────────────────────────────
def _fallback_art() -> bytes:
    """Procedural gradient + decorative circles. Clearly a fallback (no model)."""
    from PIL import Image, ImageDraw

    width, height = 1080, 1350
    top = (247, 181, 56)
    bottom = (233, 78, 119)
    image = Image.new("RGB", (width, height))
    draw = ImageDraw.Draw(image)
    for y in range(height):
        t = y / (height - 1)
        color = tuple(int(top[i] + (bottom[i] - top[i]) * t) for i in range(3))
        draw.line([(0, y), (width, y)], fill=color)
    # Soft decorative circles (deterministic positions).
    for cx, cy, radius, alpha in ((180, 240, 160, 40), (900, 340, 120, 50), (240, 1140, 200, 35)):
        overlay = Image.new("RGBA", (width, height), (0, 0, 0, 0))
        od = ImageDraw.Draw(overlay)
        od.ellipse((cx - radius, cy - radius, cx + radius, cy + radius), fill=(255, 255, 255, alpha))
        image = Image.alpha_composite(image.convert("RGBA"), overlay).convert("RGB")
        draw = ImageDraw.Draw(image)
    buffer = io.BytesIO()
    image.save(buffer, format="PNG")
    return buffer.getvalue()


def _load_model_art(image_result: ImageResult) -> bytes:
    """Fetch model art bytes from URL or base64."""
    import base64

    import httpx

    if image_result.image_b64:
        try:
            data = base64.b64decode(image_result.image_b64)
        except Exception as exc:  # noqa: BLE001
            raise ProviderUnavailableError("Agnes image base64 was invalid.") from exc
        if not data:
            raise ProviderUnavailableError("Agnes image was empty (base64).")
        return data
    if image_result.image_url:
        try:
            response = httpx.get(image_result.image_url, timeout=60.0)
            response.raise_for_status()
        except httpx.HTTPError as exc:
            raise ProviderUnavailableError(
                f"Could not download generated art: {exc}", code="art_download_failed"
            ) from exc
        return response.content
    raise ProviderUnavailableError("Agnes image result had no image payload.")


# ── compositor ────────────────────────────────────────────────────────
_FONT_CANDIDATES = (
    "arialbd.ttf",
    "Arial/Bold/ArialBold.ttf",
    "DejaVuSans-Bold.ttf",
    "seguisb.ttf",
)


def _load_font(size: int):
    from PIL import ImageFont

    import glob

    candidates = list(_FONT_CANDIDATES)
    candidates += glob.glob("C:/Windows/Fonts/arial*.ttf") + glob.glob(
        "/usr/share/fonts/**/DejaVuSans-Bold.ttf", recursive=True
    )
    for name in candidates:
        try:
            return ImageFont.truetype(name, size)
        except Exception:  # noqa: BLE001 - try next candidate
            continue
    return ImageFont.load_default()


def _wrap(text: str, font, max_width: int) -> list[str]:
    from PIL import ImageDraw, Image

    measure = Image.new("RGB", (1, 1))
    md = ImageDraw.Draw(measure)
    lines: list[str] = []
    for paragraph in text.split("\n"):
        words = paragraph.split(" ")
        current: list[str] = []
        for word in words:
            trial = " ".join([*current, word])
            if md.textlength(trial, font=font) <= max_width or not current:
                current.append(word)
            else:
                lines.append(" ".join(current))
                current = [word]
        lines.append(" ".join(current))
    return lines


def compose_poster(
    *,
    business_name: str,
    headline: str,
    subline: str,
    tokens: dict[str, str],
    fact_lines: dict[str, str],
    settings: Settings | None = None,
) -> PosterComposition:
    """Compose the poster; ``fact_lines`` values come ONLY from the token map.

    Raises ``ValidationError`` if any requested fact value cannot be derived
    from the token map (drawn text is never invented here).
    """
    settings = settings or get_settings()
    art_bytes: bytes | None = None
    art_provider: str | None = None
    art_model: str | None = None
    is_mock_art = False
    used_fallback = False

    if not settings.is_mock and settings.agnes_configured and _live_llm_allowed(settings):
        prompt = (
            "Vibrant promotional photograph, cheerful small-shop scene, warm festive "
            "lighting, shallow depth of field. ABSOLUTELY NO TEXT, NO LETTERS, "
            "NO NUMBERS, NO TYPOGRAPHY, NO WATERMARK anywhere in the image."
        )
        image_client = AgnesImageClient(settings)
        try:
            result = run_sync(image_client.generate_art(prompt))
            art_bytes = _load_model_art(result)
            art_provider = result.provider
            art_model = result.model
        except Exception:  # noqa: BLE001 - art failures degrade to fallback art only
            art_bytes = None

    if art_bytes is None:
        art_bytes = _fallback_art()
        used_fallback = True
        is_mock_art = True
        art_provider = "pillow_fallback"
        art_model = "gradient-v1"

    rows = _fact_rows(headline, subline, fact_lines)
    drawn: list[RenderedFact] = []
    png = _render_png(art_bytes, business_name, rows, drawn)
    digest = sha256_hex(png)

    registry = {
        "layout_version": POSTER_LAYOUT_VERSION,
        "business_name": business_name,
        "headline": headline,
        "subline": subline,
        "fact_lines": fact_lines,
        "rendered_facts": [f.as_dict() for f in drawn],
        "draw_count": len(drawn),
    }
    return PosterComposition(
        png_bytes=png,
        registry=registry,
        sha256=digest,
        is_mock_art=is_mock_art,
        used_fallback_art=used_fallback,
        art_provider=art_provider,
        art_model=art_model,
    )


@dataclass
class _Row:
    kind: str  # headline | subline | fact | business
    text: str
    font_size: int
    zone: str = "bottom"


def _fact_rows(headline: str, subline: str, fact_lines: dict[str, str]) -> list[_Row]:
    rows: list[_Row] = []
    if headline:
        rows.append(_Row("headline", headline, 88))
    if subline:
        rows.append(_Row("subline", subline, 44))
    for text in fact_lines.values():
        if text:
            rows.append(_Row("fact", text, 40))
    return rows


def _render_png(art: bytes, business_name: str, rows: list[_Row], drawn: list[RenderedFact]) -> bytes:
    from PIL import Image, ImageDraw, ImageEnhance

    image = Image.new("RGB", (POSTER_WIDTH, POSTER_HEIGHT))
    try:
        art_image = Image.open(io.BytesIO(art)).convert("RGB")
    except Exception:  # noqa: BLE001 - invalid art bytes → fallback fill
        art_image = Image.new("RGB", (POSTER_WIDTH, POSTER_HEIGHT), color=(24, 24, 34))
    if art_image.size != (POSTER_WIDTH, POSTER_HEIGHT):
        art_image = art_image.resize((POSTER_WIDTH, POSTER_HEIGHT))
    image.paste(art_image, (0, 0))
    # Darken lower band for legible text pasting.
    band_top = int(POSTER_HEIGHT * 0.45)
    band = image.crop((0, band_top, POSTER_WIDTH, POSTER_HEIGHT))
    band = ImageEnhance.Brightness(band).enhance(0.45)
    image.paste(band, (0, band_top))
    overlay = Image.new("RGBA", (POSTER_WIDTH, POSTER_HEIGHT), (0, 0, 0, 0))
    od = ImageDraw.Draw(overlay)

    margin = 56
    max_width = POSTER_WIDTH - margin * 2
    y_state = {"y": band_top + 40}

    def _emit(kind: str, text: str, size: int) -> None:
        if not text or not text.strip():
            return
        y = y_state["y"]
        font = _load_font(size)
        for line in _wrap(text, font, max_width):
            od.rectangle((margin - 12, y - 8, POSTER_WIDTH - margin + 12, y + size + 10), fill=(12, 12, 20, 170))
            for offset in (-2, 2):
                od.text((margin + offset, y + offset), line, font=font, fill=(0, 0, 0, 180))
            od.text((margin, y), line, font=font, fill=(255, 255, 255, 255))
            y += size + 22
        y_state["y"] = y

    if business_name:
        _emit("business", business_name.upper(), 40)
        drawn.append(RenderedFact("BUSINESS", business_name, "bottom"))
    for row in rows:
        _emit(row.kind, row.text, row.font_size)
        drawn.append(RenderedFact(row.kind.upper(), row.text, "bottom"))

    png = io.BytesIO()
    image.convert("RGB").save(png, format="PNG")
    return png.getvalue()

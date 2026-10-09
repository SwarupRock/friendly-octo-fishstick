"""Sarvam AI clients: Saaras v4 STT + voice cloning (Phases 5A/5B).

Documented contract (re-check against https://docs.sarvam.ai before live use):

- STT:         POST {base}/speech-to-text  — multipart ``file``, ``model``
               (``saaras:v4``); auth header ``api-subscription-key``;
               synchronous endpoint is for quick (<30 s) requests.
- Voice create POST {base}/voices/create   — multipart ``file``, ``name``,
               reference ``language``; response ``data.voice_id`` + text.
- Voice clone  POST {base}/voices/clone    — multipart ``text``,
               ``language_code`` and exactly one of ``voice_id``/``ref_audio``;
               text max 1 000 chars; JSON response with base64 ``audio`` and
               ``request_id``.

Live clients are gated behind configuration AND the deliberate
``TITAN_SARVAM_INTERFACE_VERIFIED=1`` toggle. Offline mode uses deterministic
mocks labelled ``is_mock=True`` — never impersonating the provider.
"""

from __future__ import annotations

import abc
import base64
import hashlib
from dataclasses import dataclass
from typing import Any

import httpx

from ..config import Settings, get_settings
from ..errors import ProviderUnavailableError
from .gateway import ProviderError, with_retry

SARVAM_VERIFY_KEY = "TITAN_SARVAM_INTERFACE_VERIFIED"

SUPPORTED_LANGUAGES: dict[str, str] = {
    "English": "en-IN",
    "Hindi": "hi-IN",
    "Kannada": "kn-IN",
    "Tamil": "ta-IN",
    "Telugu": "te-IN",
}
LANGUAGE_NAME_BY_CODE = {code: name for name, code in SUPPORTED_LANGUAGES.items()}

MAX_CLONE_TEXT_CHARS = 1000  # documented request limit; sentence-split above this


def sarvam_live_allowed(settings: Settings) -> bool:
    import os

    return bool(settings.sarvam_configured and os.environ.get(SARVAM_VERIFY_KEY) == "1")


def _headers(settings: Settings) -> dict[str, str]:
    return {"api-subscription-key": settings.sarvam_api_key or ""}


def _base_url(settings: Settings) -> str:
    return (settings.sarvam_api_base or "https://api.sarvam.ai").rstrip("/")


@dataclass
class STTSarvamResult:
    transcript: str
    language_code: str | None
    request_id: str | None
    confidence: float | None = None


class STTSarvamClient(abc.ABC):
    @abc.abstractmethod
    async def transcribe(self, audio: bytes, *, mime: str | None, language_hint: str | None) -> STTSarvamResult:
        ...


class SarvamSTT(STTSarvamClient):
    """Saaras v4 STT client (POST /speech-to-text)."""

    name = "sarvam_saaras"

    def __init__(self, settings: Settings) -> None:
        self._settings = settings

    async def transcribe(self, audio: bytes, *, mime: str | None, language_hint: str | None) -> STTSarvamResult:
        settings = self._settings
        url = f"{_base_url(settings)}/speech-to-text"
        files = {"file": ("audio", audio, mime or "audio/webm")}
        data = {"model": settings.sarvam_stt_model}
        if language_hint:
            data["language_code"] = language_hint

        async def _call() -> dict[str, Any]:
            async with httpx.AsyncClient(timeout=60.0) as client:
                response = await client.post(url, headers=_headers(settings), files=files, data=data)
            if response.status_code in (401, 403):
                raise ProviderError("Sarvam rejected the API key.", provider=self.name, retryable=False)
            if response.status_code == 429:
                raise ProviderError("Sarvam rate limit reached.", provider=self.name, retryable=True, status_code=429)
            if response.status_code >= 500:
                raise ProviderError(f"Sarvam server error ({response.status_code}).", provider=self.name, retryable=True)
            if response.status_code >= 400:
                raise ProviderError(f"Sarvam request rejected ({response.status_code}).", provider=self.name, retryable=False)
            return response.json()

        body = await with_retry(
            _call, provider=self.name, max_retries=2, backoff_base=0.5, timeout=60.0, breaker=None
        )
        return STTSarvamResult(
            transcript=str(body.get("transcript") or ""),
            language_code=body.get("language_code"),
            request_id=body.get("request_id"),
            confidence=None,
        )


class MockSarvamSTT(STTSarvamClient):
    """Deterministic mock transcript with a fake-but-honest request id."""

    name = "mock_stt"

    DEFAULT_TEXT = (
        "Mock transcript: 20% off cold coffee this Saturday and Sunday, "
        "4 PM to 8 PM at our cafe for college students."
    )

    async def transcribe(self, audio: bytes, *, mime: str | None, language_hint: str | None) -> STTSarvamResult:
        digest = hashlib.sha256(b"mock-stt" + audio).hexdigest()[:16]
        return STTSarvamResult(
            transcript=self.DEFAULT_TEXT,
            language_code=language_hint or "en-IN",
            request_id=f"mock-{digest}",
            confidence=0.99,
        )


@dataclass
class VoiceCreateResult:
    voice_id: str
    request_id: str | None
    reference_text: str | None = None


@dataclass
class VoiceCloneResult:
    audio: bytes
    request_id: str | None


class VoiceCloneClient(abc.ABC):
    @abc.abstractmethod
    async def create_voice(self, audio: bytes, *, name: str, language: str, mime: str | None = None) -> VoiceCreateResult:
        ...

    @abc.abstractmethod
    async def clone_speech(self, text: str, *, language_code: str, voice_id: str) -> VoiceCloneResult:
        ...


class SarvamVoiceClone(VoiceCloneClient):
    name = "sarvam_voice"

    def __init__(self, settings: Settings) -> None:
        self._settings = settings

    async def create_voice(self, audio: bytes, *, name: str, language: str, mime: str | None = None) -> VoiceCreateResult:
        settings = self._settings
        url = f"{_base_url(settings)}/voices/create"
        files = {"file": ("reference", audio, mime or "audio/wav")}
        data = {"name": name, "language": language}

        async def _call() -> dict[str, Any]:
            async with httpx.AsyncClient(timeout=120.0) as client:
                response = await client.post(url, headers=_headers(settings), files=files, data=data)
            if response.status_code >= 400:
                raise ProviderError(
                    f"Sarvam voice create failed ({response.status_code}).",
                    provider=self.name,
                    retryable=response.status_code == 429,
                    status_code=response.status_code,
                )
            return response.json()

        body = await with_retry(
            _call, provider=self.name, max_retries=1, backoff_base=1.0, timeout=120.0
        )
        data = body.get("data") or {}
        voice_id = data.get("voice_id") or body.get("voice_id")
        if not voice_id:
            raise ProviderUnavailableError(
                "Sarvam voice create returned no voice_id.",
                code="voice_create_bad_response",
            )
        return VoiceCreateResult(
            voice_id=str(voice_id),
            request_id=data.get("request_id") or body.get("request_id"),
            reference_text=data.get("reference_text"),
        )

    async def clone_speech(self, text: str, *, language_code: str, voice_id: str) -> VoiceCloneResult:
        settings = self._settings
        url = f"{_base_url(settings)}/voices/clone"
        data = {"text": text, "language_code": language_code, "voice_id": voice_id}

        async def _call() -> dict[str, Any]:
            async with httpx.AsyncClient(timeout=120.0) as client:
                response = await client.post(url, headers=_headers(settings), data=data)
            if response.status_code >= 400:
                raise ProviderError(
                    f"Sarvam speech clone failed ({response.status_code}).",
                    provider=self.name,
                    retryable=response.status_code in (429,) or response.status_code >= 500,
                    status_code=response.status_code,
                )
            return response.json()

        body = await with_retry(
            _call, provider=self.name, max_retries=1, backoff_base=1.0, timeout=120.0
        )
        audio_b64 = body.get("audio")
        if not audio_b64:
            raise ProviderUnavailableError(
                "Sarvam clone response contained no audio.",
                code="voice_clone_bad_response",
            )
        try:
            audio = base64.b64decode(audio_b64)
        except Exception as exc:  # noqa: BLE001
            raise ProviderUnavailableError(
                "Sarvam clone audio was not valid base64.", code="voice_clone_bad_audio"
            ) from exc
        if not audio:
            raise ProviderUnavailableError("Sarvam clone audio was empty.", code="voice_clone_empty")
        return VoiceCloneResult(audio=audio, request_id=body.get("request_id"))


class MockVoiceClone(VoiceCloneClient):
    """Deterministic offline voice provider: generates a tiny labelled WAV."""

    name = "mock_voice"

    @staticmethod
    def _wav(seconds: float = 1.0) -> bytes:
        import io
        import struct
        import wave

        rate = 8000
        samples = int(rate * seconds)
        buffer = io.BytesIO()
        with wave.open(buffer, "wb") as w:
            w.setnchannels(1)
            w.setsampwidth(2)
            w.setframerate(rate)
            frames = b"".join(
                struct.pack("<h", int(3000 * 0.2 * (i % rate) / rate)) for i in range(samples)
            )
            w.writeframes(frames)
        return buffer.getvalue()

    async def create_voice(self, audio: bytes, *, name: str, language: str, mime: str | None = None) -> VoiceCreateResult:
        digest = hashlib.sha256(audio).hexdigest()[:16]
        return VoiceCreateResult(voice_id=f"mock-voice-{digest}", request_id=f"mock-create-{digest}")

    async def clone_speech(self, text: str, *, language_code: str, voice_id: str) -> VoiceCloneResult:
        digest = hashlib.sha256(text.encode("utf-8")).hexdigest()[:16]
        duration = min(6.0, 0.15 + len(text) * 0.02)
        return VoiceCloneResult(audio=self._wav(duration), request_id=f"mock-clone-{digest}")


def get_stt_sarvam(settings: Settings | None = None) -> STTSarvamClient:
    settings = settings or get_settings()
    if settings.is_mock or not settings.sarvam_configured or not sarvam_live_allowed(settings):
        return MockSarvamSTT()
    return SarvamSTT(settings)


def get_voice_clone(settings: Settings | None = None, *, profile_is_mock: bool | None = None) -> VoiceCloneClient:
    settings = settings or get_settings()
    if settings.is_mock or profile_is_mock or not settings.sarvam_configured or not sarvam_live_allowed(settings):
        return MockVoiceClone()
    return SarvamVoiceClone(settings)


def split_for_clone(text: str, limit: int = MAX_CLONE_TEXT_CHARS) -> list[str]:
    """Deterministic sentence-boundary split honouring the request text limit."""
    if len(text) <= limit:
        return [text]
    import re

    sentences = re.split(r"(?<=[.!?।])\s+", text)
    chunks: list[str] = []
    current = ""
    for sentence in sentences:
        if not sentence:
            continue
        if len(sentence) > limit:
            # Hard-split very long sentences at word boundaries.
            words = sentence.split(" ")
            for word in words:
                candidate = f"{current} {word}".strip()
                if len(candidate) > limit and current:
                    chunks.append(current)
                    current = word
                else:
                    current = candidate
        else:
            candidate = f"{current} {sentence}".strip()
            if len(candidate) > limit and current:
                chunks.append(current)
                current = sentence
            else:
                current = candidate
    if current:
        chunks.append(current)
    return chunks or [text[:limit]]


__all__ = [
    "SUPPORTED_LANGUAGES",
    "LANGUAGE_NAME_BY_CODE",
    "MAX_CLONE_TEXT_CHARS",
    "SARVAM_VERIFY_KEY",
    "SarvamSTT",
    "MockSarvamSTT",
    "SarvamVoiceClone",
    "MockVoiceClone",
    "get_stt_sarvam",
    "get_voice_clone",
    "split_for_clone",
    "sarvam_live_allowed",
]

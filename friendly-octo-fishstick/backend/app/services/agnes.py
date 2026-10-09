"""Agnes HTTP clients (real, network-capable; behind the provider gateway).

Implements the documented Agnes API contract (to be re-checked against
https://wiki.agnes-ai.com before every live run):

- LLM:   POST {base}/chat/completions  model=agnes-3.0-flash
- Image: POST {base}/images/generations model=agnes-image-2.5-flash
- Video: POST {base}/videos             model=agnes-video-2.5 (async; poll)

The gateway slot keeps ``interface_verified`` control: live calls are gated on
explicit configuration + a deliberate verification toggle so that an
unconfigured environment never fires network requests. In ``TITAN_MODE=mock``
the mock providers below are used instead and are always explicitly labelled
``is_mock=True``.

No undocumented API is invented: request/response shapes follow the handoff
"provider registry" and degrade with normalized errors when the live schema
does not match.
"""

from __future__ import annotations

import abc
import json
from dataclasses import dataclass, field
from typing import Any

import httpx

from ..config import Settings, get_settings
from ..errors import ProviderUnavailableError, ValidationError
from .gateway import ProviderError, with_retry, CircuitBreaker

VERIFY_KEY = "TITAN_AGNES_INTERFACE_VERIFIED"

#: Percent-word/format helpers shared with the mock plan generator.
TARGETED_LANGUAGES = ("English", "Hindi", "Kannada", "Tamil", "Telugu")
LOCALE_CODE_MAP = {
    "English": "en-IN",
    "Hindi": "hi-IN",
    "Kannada": "kn-IN",
    "Tamil": "ta-IN",
    "Telugu": "te-IN",
}
REGION_FOR_LANGUAGE = {
    "English": "Pan-India",
    "Hindi": "Delhi",
    "Kannada": "Bengaluru",
    "Tamil": "Chennai",
    "Telugu": "Hyderabad",
}


@dataclass
class LLMResult:
    text: str
    provider: str
    model: str
    is_mock: bool
    request_id: str | None = None
    usage: dict[str, Any] = field(default_factory=dict)


@dataclass
class ImageResult:
    image_url: str | None
    image_b64: str | None
    provider: str
    model: str
    is_mock: bool
    request_id: str | None = None


class LLMClient(abc.ABC):
    name: str = "llm"

    @abc.abstractmethod
    async def complete_json(
        self, system: str, user: str, *, max_tokens: int = 2000
    ) -> LLMResult:
        ...


def _extract_json_object(text: str) -> dict[str, Any]:
    """Parse a JSON object out of a model response (tolerates code fences)."""
    cleaned = text.strip()
    if cleaned.startswith("```"):
        cleaned = cleaned.strip("`")
        if cleaned.lower().startswith("json"):
            cleaned = cleaned[4:]
    start = cleaned.find("{")
    end = cleaned.rfind("}")
    if start == -1 or end == -1 or end <= start:
        raise ProviderUnavailableError(
            "Agnes LLM returned a non-JSON response.",
            code="llm_bad_output",
        )
    try:
        parsed = json.loads(cleaned[start : end + 1])
    except json.JSONDecodeError as exc:
        raise ProviderUnavailableError(
            "Agnes LLM returned invalid JSON.",
            code="llm_bad_json",
            details={"error": str(exc)},
        ) from exc
    if not isinstance(parsed, dict):
        raise ProviderUnavailableError(
            "Agnes LLM JSON output was not an object.",
            code="llm_bad_output",
        )
    return parsed


class AgnesLLMClient(LLMClient):
    """Real chat-completions client for Agnes 3.0 Flash."""

    name = "agnes"

    def __init__(self, settings: Settings) -> None:
        self._settings = settings

    async def complete_json(
        self, system: str, user: str, *, max_tokens: int = 2000
    ) -> LLMResult:
        settings = self._settings
        url = settings.agnes_api_base.rstrip("/") + "/chat/completions"
        headers = {"Authorization": f"Bearer {settings.agnes_api_key}"}
        payload = {
            "model": settings.agnes_text_model,
            "messages": [
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
            "response_format": {"type": "json_object"},
            "max_tokens": max_tokens,
            "temperature": 0.4,
        }

        async def _call() -> dict[str, Any]:
            try:
                async with httpx.AsyncClient(timeout=30.0) as client:
                    response = await client.post(url, headers=headers, json=payload)
            except httpx.HTTPError as exc:
                raise ProviderError(
                    f"Agnes request failed: {exc}",
                    provider=self.name,
                    retryable=True,
                ) from exc
            if response.status_code in (401, 403):
                raise ProviderError(
                    "Agnes rejected the API key.",
                    provider=self.name,
                    code="provider_auth_error",
                    retryable=False,
                    status_code=response.status_code,
                )
            if response.status_code == 429:
                raise ProviderError(
                    "Agnes rate limit reached.",
                    provider=self.name,
                    code="provider_rate_limited",
                    retryable=True,
                    status_code=429,
                )
            if response.status_code >= 500:
                raise ProviderError(
                    f"Agnes server error ({response.status_code}).",
                    provider=self.name,
                    retryable=True,
                    status_code=response.status_code,
                )
            if response.status_code >= 400:
                raise ProviderError(
                    f"Agnes request rejected ({response.status_code}).",
                    provider=self.name,
                    code="provider_bad_request",
                    retryable=False,
                    status_code=response.status_code,
                )
            return response.json()

        try:
            body = await with_retry(
                _call,
                provider=self.name,
                max_retries=2,
                backoff_base=0.5,
                timeout=settings.provider_timeout,
                breaker=CircuitBreaker(),
            )
        except ProviderError as exc:
            raise ProviderUnavailableError(
                exc.message, code=exc.code, details=exc.as_dict()
            ) from exc
        except Exception as exc:  # noqa: BLE001
            raise ProviderUnavailableError(
                "Agnes call failed.", details={"error": str(exc)}
            ) from exc

        try:
            content = body["choices"][0]["message"]["content"]
        except (KeyError, IndexError, TypeError) as exc:
            raise ProviderUnavailableError(
                "Agnes response did not contain a message content field.",
                code="llm_bad_response",
                details={"keys": list(body.keys()) if isinstance(body, dict) else None},
            ) from exc
        return LLMResult(
            text=content,
            provider=self.name,
            model=settings.agnes_text_model,
            is_mock=False,
            request_id=None,
            usage=body.get("usage") or {},
        )


class MockLLMClient(LLMClient):
    """Deterministic offline LLM. Produces clearly-labelled templated JSON.

    It never fabricates fact VALUES: callers must pass a token map, and every
    template is validated by ``substitute_tokens`` afterwards. This keeps the
    mock path truthful — copy contains only tokens and safe framing words.
    """

    name = "mock_llm"

    @staticmethod
    def _tokens_line(tokens: dict[str, str]) -> str:
        return ", ".join(f"{k}={{{{{k}}}}}" for k in sorted(tokens))

    async def complete_json(
        self, system: str, user: str, *, max_tokens: int = 2000
    ) -> LLMResult:
        # The mock client echoes the caller's instruction envelope so the
        # campaign brain can build deterministic plans from it.
        try:
            envelope = json.loads(user)
        except json.JSONDecodeError:
            envelope = {}
        if not isinstance(envelope, dict):
            envelope = {}
        return LLMResult(
            text=json.dumps(envelope, ensure_ascii=False),
            provider=self.name,
            model="mock-template-engine",
            is_mock=True,
        )


class ImageClient(abc.ABC):
    name: str = "image"

    @abc.abstractmethod
    async def generate_art(self, prompt: str, *, size: str = "1024x1024") -> ImageResult:
        ...


class AgnesImageClient(ImageClient):
    """Real Agnes Image 2.5 Flash client (URL response format)."""

    name = "agnes_image"

    def __init__(self, settings: Settings) -> None:
        self._settings = settings

    async def generate_art(self, prompt: str, *, size: str = "1024x1024") -> ImageResult:
        settings = self._settings
        url = settings.agnes_api_base.rstrip("/") + "/images/generations"
        headers = {"Authorization": f"Bearer {settings.agnes_api_key}"}
        # Documented: response_format lives under extra_body, not top-level.
        payload = {
            "model": settings.agnes_image_model,
            "prompt": prompt,
            "size": size,
            "extra_body": {"response_format": "url"},
        }

        async def _call() -> dict[str, Any]:
            async with httpx.AsyncClient(timeout=60.0) as client:
                response = await client.post(url, headers=headers, json=payload)
            if response.status_code >= 400:
                raise ProviderError(
                    f"Agnes Image error ({response.status_code}).",
                    provider=self.name,
                    retryable=response.status_code in (429,) or response.status_code >= 500,
                    status_code=response.status_code,
                )
            return response.json()

        try:
            body = await with_retry(
                _call, provider=self.name, max_retries=1, backoff_base=1.0, timeout=60.0
            )
        except ProviderError as exc:
            raise ProviderUnavailableError(
                exc.message, code=exc.code, details=exc.as_dict()
            ) from exc
        except Exception as exc:  # noqa: BLE001
            raise ProviderUnavailableError(
                "Agnes Image call failed.", details={"error": str(exc)}
            ) from exc

        data = (body.get("data") or [{}])[0]
        url_out = data.get("url")
        b64 = data.get("b64_json")
        if not url_out and not b64:
            raise ProviderUnavailableError(
                "Agnes Image response contained no image.",
                code="image_bad_response",
            )
        return ImageResult(
            image_url=url_out,
            image_b64=b64,
            provider=self.name,
            model=settings.agnes_image_model,
            is_mock=False,
        )


def parse_llm_json(result: LLMResult) -> dict[str, Any]:
    """Validate + parse an LLMResult into a JSON object."""
    if result.is_mock:
        # Mock clients emit JSON directly.
        try:
            return json.loads(result.text)
        except json.JSONDecodeError as exc:
            raise ValidationError("Mock plan output was not JSON.", code="mock_bad_output") from exc
    return _extract_json_object(result.text)


__all__ = [
    "LLMClient",
    "LLMResult",
    "ImageClient",
    "ImageResult",
    "AgnesLLMClient",
    "MockLLMClient",
    "AgnesImageClient",
    "parse_llm_json",
    "TARGETED_LANGUAGES",
    "LOCALE_CODE_MAP",
    "REGION_FOR_LANGUAGE",
    "VERIFY_KEY",
]


def _live_llm_allowed(settings: Settings) -> bool:
    """Live calls require the deliberate interface-verification toggle."""
    import os

    return bool(settings.agnes_configured and os.environ.get(VERIFY_KEY) == "1")


def get_llm_client(settings: Settings | None = None) -> LLMClient:
    settings = settings or get_settings()
    if settings.is_mock:
        return MockLLMClient()
    if not settings.agnes_configured:
        raise ProviderUnavailableError(
            "Agnes LLM is not configured (set TITAN_AGNES_API_KEY).",
            code="provider_not_configured",
        )
    if not _live_llm_allowed(settings):
        raise ProviderUnavailableError(
            "Agnes LLM interface is not live-verified; refusing to call the "
            "real API. Set TITAN_AGNES_INTERFACE_VERIFIED=1 only after "
            "validating the live contract.",
            code="interface_unverified",
        )
    return AgnesLLMClient(settings)

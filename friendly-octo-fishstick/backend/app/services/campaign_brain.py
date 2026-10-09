"""Campaign brain: plan + copywriter + localization specs (Source of Truth §13, §18, §19, handoff Phase 3).

One structured generation produces the campaign plan:

- strategy (creative Level 2)
- per-channel TokenizedCopy (tokens only, never literal fact values)
- a tokenized voice script template
- poster briefs (art prompts with NO TEXT requested, plus overlay guidance)
- one LocalizationSpec per requested language (idiom/tone/pacing, no claims)

The token map (Phase 2) is the only source of literal fact values; ``substitute_tokens``
does the deterministic substitution and fails closed on unknown/unresolved tokens
(``TokenError``). The plan persists ``fact_hash``/``fact_sheet_id`` provenance.
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from typing import Any

from sqlalchemy.orm import Session

from ..config import Settings, get_settings
from ..errors import ConflictError, ProviderUnavailableError, ValidationError
from ..models import Campaign, CampaignPlanRecord, FactSheetRecord, FactSheetStatus
from .agnes import (
    LOCALE_CODE_MAP,
    REGION_FOR_LANGUAGE,
    TARGETED_LANGUAGES,
    LLMResult,
    get_llm_client,
)
from .async_bridge import run_sync
from .fact_engine import substitute_tokens, validate_template

CHANNELS = (
    "instagram",
    "facebook",
    "x",
    "whatsapp",
    "poster_headline",
    "poster_subline",
    "reel_script",
    "voice_script",
)

_COPY_SYSTEM = (
    "You are Titan's campaign copywriter. You receive a locked FACT TOKEN MAP; "
    "you MUST NOT write literal numbers, percentages, prices, dates, times, days, "
    "quantities or conditions. Use ONLY the provided {{TOKENS}} exactly as given. "
    "Never invent offers, scarcity, guarantees, awards or claims. "
    "Return strict JSON only."
)

COPY_SCHEMA = {
    "strategy": {"angle": "short creative angle", "rationale": "1-2 sentences"},
    "copy_templates": {
        "instagram": "caption using {{TOKENS}} only",
        "facebook": "caption using {{TOKENS}} only",
        "x": "one short line, <= 280 chars, {{TOKENS}} only",
        "whatsapp": "broadcast-style message, {{TOKENS}} only",
        "poster_headline": "short headline, {{TOKENS}} only",
        "poster_subline": "supporting line, {{TOKENS}} only",
        "reel_script": "3-5 scene lines, {{TOKENS}} only",
        "voice_script": "20-40s narration, {{TOKENS}} only",
    },
    "poster_briefs": [
        {
            "art_prompt": "NO TEXT, NO LETTERS, NO NUMBERS, NO TYPOGRAPHY, NO WATERMARK; describe scene/mood only",
            "overlay_layout": "top|center|bottom emphasis guidance",
        }
    ],
    "localization": [
        {
            "language": "one of the campaign languages",
            "region": "city/region for idiom",
            "audience": "audience framing",
            "tone": ["friendly", "local"],
            "delivery": {"pace": "medium", "warmth": "high", "formality": "low"},
            "avoid": ["literal translation", "forced slang"],
            "copy_templates": {"instagram": "{{TOKENS}} version", "voice_script": "{{TOKENS}} version"},
        }
    ],
}


@dataclass
class TokenizedCopy:
    channel: str
    template: str
    language: str = "English"

    def as_dict(self) -> dict[str, Any]:
        return {"channel": self.channel, "template": self.template, "language": self.language}


@dataclass
class LocalizationSpec:
    language: str
    locale: str
    region: str
    audience: str
    tone: list[str] = field(default_factory=list)
    delivery: dict[str, Any] = field(default_factory=dict)
    avoid: list[str] = field(default_factory=list)
    copy_templates: dict[str, str] = field(default_factory=dict)

    def as_dict(self) -> dict[str, Any]:
        return {
            "language": self.language,
            "locale": self.locale,
            "region": self.region,
            "audience": self.audience,
            "tone": list(self.tone),
            "delivery": dict(self.delivery),
            "avoid": list(self.avoid),
            "copy_templates": dict(self.copy_templates),
        }


@dataclass
class CampaignPlan:
    campaign_id: int
    fact_sheet_id: int
    fact_hash: str
    version: int
    strategy: dict[str, Any]
    copy: dict[str, TokenizedCopy]  # per-channel master copy
    localization: list[LocalizationSpec]
    poster_briefs: list[dict[str, Any]]
    is_mock: bool
    provider: str
    model: str | None = None
    id: int | None = None
    created_at: Any = None

    def as_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "campaign_id": self.campaign_id,
            "fact_sheet_id": self.fact_sheet_id,
            "fact_hash": self.fact_hash,
            "version": self.version,
            "strategy": self.strategy,
            "copy": {ch: c.as_dict() for ch, c in self.copy.items()},
            "localization": [loc.as_dict() for loc in self.localization],
            "poster_briefs": self.poster_briefs,
            "is_mock": self.is_mock,
            "provider": self.provider,
            "model": self.model,
            "created_at": str(self.created_at) if self.created_at else None,
        }


def substitute_copy(
    copy: dict[str, TokenizedCopy], tokens: dict[str, str], localization: list[LocalizationSpec] | None = None
) -> dict[str, Any]:
    """Deterministic substitution for master + localized templates."""
    out: dict[str, Any] = {"master": {}, "localized": {}}
    for channel, item in copy.items():
        out["master"][channel] = substitute_tokens(item.template, tokens)
    for loc in localization or []:
        localized: dict[str, str] = {}
        for channel, template in loc.copy_templates.items():
            localized[channel] = substitute_tokens(template, tokens)
        out["localized"][loc.language] = localized
    return out


# ── prompt assembly ───────────────────────────────────────────────────
def build_plan_prompt(sheet_payload: dict[str, Any], tokens: dict[str, str], languages: list[str], *, max_copy: int) -> tuple[str, str]:
    token_lines = "\n".join(f"{name} = {{{{{name}}}}}" for name in sorted(tokens))
    envelope = {
        "locked_fact_tokens": tokens,
        "available_token_names": sorted(tokens),
        "languages": languages,
        "schema": COPY_SCHEMA,
        "constraints": [
            "Use ONLY {{TOKENS}} for any number/percent/price/day/time/date/quantity/condition.",
            "Never write literal fact values; never invent claims, scarcity or guarantees.",
            "Art prompts must forbid text/typography.",
            f"At most {max_copy} entries per channel list; exactly one per language for localization.",
        ],
        "business": sheet_payload.get("business"),
        "offer_shape": {k: ("<token>" if v is not None else None) for k, v in (sheet_payload.get("offer") or {}).items()},
    }
    user = json.dumps(envelope, ensure_ascii=False)
    system = _COPY_SYSTEM + "\nToken map:\n" + token_lines
    return system, user


# ── mock plan generation (deterministic, token-safe) ──────────────────
def _mock_plan(
    campaign_id: int,
    sheet: FactSheetRecord,
    tokens: dict[str, str],
    languages: list[str],
    *,
    business_name: str | None,
) -> dict[str, Any]:
    """Deterministic offline campaign plan.

    Templates contain ONLY {{TOKEN}} names and structural words. A token name is
    included in a template only when it exists in the lock-time token map, so
    substitution always succeeds and no fact value is ever written by template
    construction. Templates contain no digits at all.
    """
    has = {
        name: name in tokens
        for name in ("PRODUCT", "DISCOUNT", "PRICE", "DAYS", "WINDOW", "AUDIENCE", "CONDITIONS", "LOCATION")
    }

    # Conditional segments (token names, never values).
    days_a = " {{DAYS}}" if has.get("DAYS") else ""
    days_p = "{{DAYS}}" if has.get("DAYS") else ""
    days_v = "{{DAYS}}" if has.get("DAYS") else "then"
    window_a = ", {{WINDOW}}" if has.get("WINDOW") else ""
    window_p = " {{WINDOW}}" if has.get("WINDOW") else ""
    window_v = " between {{WINDOW}}" if has.get("WINDOW") else ""
    audience_a = " Just for {{AUDIENCE}}." if has.get("AUDIENCE") else ""
    audience_v = ", just for {{AUDIENCE}}" if has.get("AUDIENCE") else ""
    audience_s = "{{AUDIENCE}}" if has.get("AUDIENCE") else "local"
    location_p = " at {{LOCATION}}" if has.get("LOCATION") else ""
    location_a = "{{LOCATION}}" if has.get("LOCATION") else ""
    conditions_v = ". {{CONDITIONS}}" if has.get("CONDITIONS") else ""
    conditions_a = " Note: {{CONDITIONS}}." if has.get("CONDITIONS") else ""

    offer = "{{DISCOUNT}} off {{PRODUCT}}" if has.get("DISCOUNT") else "Special offer on {{PRODUCT}}"

    instagram = (
        "{{PRODUCT}} is calling!\n"
        f"{offer}"
        f"{days_a}{window_a}."
        f"{audience_a}"
    )
    facebook = (
        f"{offer}"
        f"{window_p}."
        f"{audience_a}"
        f"{location_a and ' Visit us at {{LOCATION}}.'}"
    )
    x_line = f"{offer} — {days_p}{window_p}"
    whatsapp = (
        f"Hello! {offer}{audience_a}"
        f"\n{days_p}{window_p}{location_p}{conditions_a}"
        "\nReply to know more!"
    )
    poster_headline = offer
    poster_subline = f"{days_p}{window_p}"
    reel_script = (
        "Scene 1: {{PRODUCT}} on display.\n"
        "Scene 2: Sign shows the offer.\n"
        f"Scene 3: Happy {audience_s} customers.\n"
        f"Scene 4: End card — {days_p}{window_p}{location_p}."
    )
    voice_script = (
        f"Hi! Enjoy {offer}"
        f"{audience_v}{window_v}{conditions_v}."
        f" See you {days_v}!"
    )

    art_prompt = (
        "Vibrant promotional photograph of a cheerful small-shop counter scene, "
        "warm festive lighting, shallow depth of field. Absolutely NO TEXT, "
        "NO LETTERS, NO NUMBERS, NO TYPOGRAPHY, NO WATERMARK anywhere in the image."
    )

    localization: list[dict[str, Any]] = []
    for language in languages:
        localization.append(
            {
                "language": language,
                "locale": LOCALE_CODE_MAP.get(language, "en-IN"),
                "region": REGION_FOR_LANGUAGE.get(language, "Local"),
                "audience": tokens.get("AUDIENCE", "local customers"),
                "tone": ["friendly", "local", "conversational"],
                "delivery": {"pace": "medium", "warmth": "high", "formality": "low"},
                "avoid": ["textbook wording", "literal translation", "forced slang"],
                "copy_templates": {
                    "instagram": instagram,
                    "whatsapp": whatsapp,
                    "voice_script": voice_script,
                    "poster_headline": poster_headline,
                    "poster_subline": poster_subline,
                },
            }
        )

    return {
        "strategy": {
            "angle": "Neighbourhood offer push (deterministic mock template)",
            "rationale": "Offline mock campaign brain: token-safe templates, no fact values embedded.",
        },
        "copy_templates": {
            "instagram": instagram,
            "facebook": facebook,
            "x": x_line,
            "whatsapp": whatsapp,
            "poster_headline": poster_headline,
            "poster_subline": poster_subline,
            "reel_script": reel_script,
            "voice_script": voice_script,
        },
        "poster_briefs": [{"art_prompt": art_prompt, "overlay_layout": "bottom-anchored fact strip"}],
        "localization": localization,
    }


# ── persistence ───────────────────────────────────────────────────────
class PlanError(ValidationError):
    pass


def get_locked_sheet(db: Session, campaign_id: int) -> FactSheetRecord:
    sheet = (
        db.query(FactSheetRecord)
        .filter(FactSheetRecord.campaign_id == campaign_id, FactSheetRecord.status == FactSheetStatus.LOCKED)
        .order_by(FactSheetRecord.version.desc())
        .first()
    )
    if sheet is None:
        raise ConflictError(
            "Campaign facts are not locked. Lock the FactSheet before generating a plan.",
            code="facts_not_locked",
        )
    return sheet


def generate_plan(db: Session, campaign: Campaign, settings: Settings | None = None) -> tuple[CampaignPlan, dict[str, Any]]:
    """Generate + persist a CampaignPlan for a locked campaign.

    Returns ``(plan, substituted_copy)``. The plan never contains literal fact
    values — only tokens; substitution happens deterministically at render time.
    """
    settings = settings or get_settings()
    sheet = get_locked_sheet(db, campaign.id)
    tokens: dict[str, str] = json.loads(sheet.tokens_json or "{}")
    languages = [str(l) for l in (json.loads(sheet.facts_json or "{}").get("languages")) or []]
    languages = [l for l in languages if l] or [TARGETED_LANGUAGES[0]]

    existing = (
        db.query(CampaignPlanRecord)
        .filter(CampaignPlanRecord.campaign_id == campaign.id, CampaignPlanRecord.fact_sheet_id == sheet.id)
        .order_by(CampaignPlanRecord.version.desc())
        .first()
    )
    if    existing is not None:
        plan = _plan_from_record(existing, tokens)
        return plan, substitute_copy(plan.copy, tokens, plan.localization)

    if settings.is_mock:
        raw = _mock_plan(campaign.id, sheet, tokens, languages, business_name=_business_name(sheet))
        plan = _plan_from_raw(
            campaign, sheet, raw, is_mock=True, provider="mock_llm", model="mock-template-engine"
        )
    else:
        system, user = build_plan_prompt(
            canonical_payload_from_sheet(sheet), tokens, languages, max_copy=settings.max_copy_variants
        )
        try:
            client = get_llm_client(settings)
            result: LLMResult = run_sync(client.complete_json(system, user))
            parsed = parse_plan_json(result.text)
            plan = _plan_from_raw(
                campaign, sheet, parsed, is_mock=result.is_mock, provider=result.provider, model=result.model
            )
        except ProviderUnavailableError:
            # Live provider unavailable → deterministic mock plan, explicitly labelled.
            raw = _mock_plan(campaign.id, sheet, tokens, languages, business_name=_business_name(sheet))
            plan = _plan_from_raw(
                campaign, sheet, raw, is_mock=True, provider="mock_llm", model="mock-template-engine"
            )

    record = CampaignPlanRecord(
        campaign_id=campaign.id,
        fact_sheet_id=sheet.id,
        fact_hash=sheet.fact_hash or "",
        version=_next_plan_version(db, campaign.id),
        plan_json=json.dumps(plan.as_dict(), ensure_ascii=False),
    )
    db.add(record)
    db.flush()
    plan.id = record.id
    plan.created_at = record.created_at
    audit_plan(db, campaign.id, record.id, plan.is_mock)
    substituted = substitute_copy(plan.copy, tokens, plan.localization)
    return plan, substituted


def parse_plan_json(text: str) -> dict[str, Any]:
    """Parse a live-model JSON envelope into a raw plan dict."""
    from .agnes import parse_llm_json

    return parse_llm_json(LLMResult(text=text, provider="parse", model="parse", is_mock=False))


def canonical_payload_from_sheet(sheet: FactSheetRecord) -> dict[str, Any]:
    return json.loads(sheet.facts_json or "{}")


def _business_name(sheet: FactSheetRecord) -> str | None:
    payload = canonical_payload_from_sheet(sheet)
    return (payload.get("business") or {}).get("name")


def _next_plan_version(db: Session, campaign_id: int) -> int:
    from sqlalchemy import func

    current = db.query(func.max(CampaignPlanRecord.version)).filter(CampaignPlanRecord.campaign_id == campaign_id).scalar()
    return (current or 0) + 1


def audit_plan(db: Session, campaign_id: int, plan_id: int, is_mock: bool) -> None:
    from ..models import AuditEvent

    db.add(
        AuditEvent(
            campaign_id=campaign_id,
            event_type="plan.created",
            payload_json=json.dumps({"plan_id": plan_id, "is_mock": is_mock}),
        )
    )


def _plan_from_record(record: CampaignPlanRecord, tokens: dict[str, str]) -> CampaignPlan:
    data = json.loads(record.plan_json)
    return _plan_from_dict(record.campaign_id, record.fact_sheet_id, record.fact_hash, record.version, data, record)


def _plan_from_raw(
    campaign: Campaign,
    sheet: FactSheetRecord,
    raw: dict[str, Any],
    *,
    is_mock: bool,
    provider: str,
    model: str | None,
) -> CampaignPlan:
    return _plan_from_dict(campaign.id, sheet.id, sheet.fact_hash or "", 0, raw, None, is_mock=is_mock, provider=provider, model=model)


def _plan_from_dict(
    campaign_id: int,
    fact_sheet_id: int,
    fact_hash: str,
    version: int,
    data: dict[str, Any],
    record: CampaignPlanRecord | None,
    *,
    is_mock: bool = False,
    provider: str = "unknown",
    model: str | None = None,
) -> CampaignPlan:
    # Persisted plans serialize `copy` (channel → TokenizedCopy dict); raw
    # model envelopes use `copy_templates` (channel → template string).
    copy_templates = data.get("copy_templates") or data.get("copy") or {}
    copy: dict[str, TokenizedCopy] = {}
    for channel, value in copy_templates.items():
        # Accept both stored shapes: plain template strings (raw model output)
        # and the serialized TokenizedCopy dicts (persisted plan JSON).
        if isinstance(value, dict) and isinstance(value.get("template"), str):
            template = value["template"]
        elif isinstance(value, str):
            template = value
        else:
            continue
        if channel not in CHANNELS or not template.strip():
            continue
        copy[channel] = TokenizedCopy(channel=channel, template=template)

    localization: list[LocalizationSpec] = []
    for item in data.get("localization") or []:
        if not isinstance(item, dict):
            continue
        language = str(item.get("language") or "").strip()
        if not language:
            continue
        templates = {
            ch: str(t)
            for ch, t in (item.get("copy_templates") or {}).items()
            if isinstance(t, str) and t.strip()
        }
        localization.append(
            LocalizationSpec(
                language=language,
                locale=str(item.get("locale") or LOCALE_CODE_MAP.get(language, "en-IN")),
                region=str(item.get("region") or ""),
                audience=str(item.get("audience") or ""),
                tone=[str(t) for t in item.get("tone") or []],
                delivery=dict(item.get("delivery") or {}),
                avoid=[str(a) for a in item.get("avoid") or []],
                copy_templates=templates,
            )
        )

    briefs = [b for b in (data.get("poster_briefs") or []) if isinstance(b, dict) and b.get("art_prompt")]

    strategy = data.get("strategy") if isinstance(data.get("strategy"), dict) else {}
    plan = CampaignPlan(
        campaign_id=campaign_id,
        fact_sheet_id=fact_sheet_id,
        fact_hash=fact_hash,
        version=version or 1,
        strategy=strategy or {"angle": "local offer", "rationale": "default"},
        copy=copy,
        localization=localization,
        poster_briefs=briefs,
        is_mock=is_mock,
        provider=provider,
        model=model,
    )
    if record is not None:
        plan.id = record.id
        plan.created_at = record.created_at
    return plan


def get_plan_record(db: Session, campaign_id: int) -> CampaignPlanRecord | None:
    return (
        db.query(CampaignPlanRecord)
        .filter(CampaignPlanRecord.campaign_id == campaign_id)
        .order_by(CampaignPlanRecord.version.desc())
        .first()
    )


__all__ = [
    "CampaignPlan",
    "TokenizedCopy",
    "LocalizationSpec",
    "CHANNELS",
    "generate_plan",
    "get_locked_sheet",
    "get_plan_record",
    "substitute_copy",
    "validate_template",
]

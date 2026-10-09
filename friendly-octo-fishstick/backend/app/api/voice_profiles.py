"""Voice endpoints (Phases 5A/5B)."""

from __future__ import annotations

import base64
import binascii

from fastapi import APIRouter, Depends
from fastapi.responses import Response
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from ..db import get_db
from ..errors import ValidationError
from ..models import Campaign
from ..services.voice_service import (
    create_voice_profile,
    delete_profile,
    generate_localized_voice,
    get_owned_profile,
    list_profiles,
    serialize_profile,
)
from ..services.assets_service import serialize_asset

router = APIRouter(tags=["voice"])

SUPPORTED = ["English", "Hindi", "Kannada", "Tamil", "Telugu"]


class ProfileCreate(BaseModel):
    owner_uid: str = Field(min_length=1, max_length=128)
    display_name: str = Field(min_length=1, max_length=128)
    consent_confirmed: bool
    consent_record: dict | None = None
    reference_audio_b64: str | None = None
    reference_audio_mime: str | None = Field(default=None, max_length=128)
    reference_transcript: str | None = None
    campaign_id: int | None = None
    shop_id: int | None = None


class VoiceGenerateRequest(BaseModel):
    profile_id: int
    owner_uid: str = Field(min_length=1, max_length=128)
    language: str


@router.post("/voice-profiles", response_model=dict, status_code=201)
def create_profile(payload: ProfileCreate, db: Session = Depends(get_db)) -> dict:
    audio: bytes | None = None
    if payload.reference_audio_b64:
        try:
            audio = base64.b64decode(payload.reference_audio_b64, validate=True)
        except (binascii.Error, ValueError) as exc:
            raise ValidationError("'reference_audio_b64' is not valid base64.", code="invalid_audio") from exc
    record = create_voice_profile(
        db,
        owner_uid=payload.owner_uid,
        display_name=payload.display_name,
        consent_confirmed=payload.consent_confirmed,
        consent_record=payload.consent_record,
        reference_audio=audio,
        reference_mime=payload.reference_audio_mime,
        reference_transcript=payload.reference_transcript,
        campaign_id=payload.campaign_id,
        shop_id=payload.shop_id,
    )
    db.commit()
    return serialize_profile(record)


@router.get("/voice-profiles", response_model=list[dict])
def get_profiles(owner_uid: str, db: Session = Depends(get_db)) -> list[dict]:
    return [serialize_profile(p) for p in list_profiles(db, owner_uid)]


@router.get("/voice-profiles/{profile_id}", response_model=dict)
def get_profile(profile_id: int, owner_uid: str, db: Session = Depends(get_db)) -> dict:
    return serialize_profile(get_owned_profile(db, profile_id, owner_uid))


@router.delete("/voice-profiles/{profile_id}", status_code=204)
def remove_profile(profile_id: int, owner_uid: str, db: Session = Depends(get_db)) -> Response:
    delete_profile(db, profile_id, owner_uid)
    db.commit()
    return Response(status_code=204)


@router.post("/campaigns/{campaign_id}/voice", response_model=dict, status_code=201)
def generate_voice(campaign_id: int, payload: VoiceGenerateRequest, db: Session = Depends(get_db)) -> dict:
    campaign = db.get(Campaign, campaign_id)
    if campaign is None:
        from ..errors import NotFoundError

        raise NotFoundError(f"Campaign {campaign_id} was not found.")
    record = generate_localized_voice(
        db,
        campaign_id=campaign_id,
        profile_id=payload.profile_id,
        owner_uid=payload.owner_uid,
        language=payload.language,
    )
    db.commit()
    return serialize_asset(record)

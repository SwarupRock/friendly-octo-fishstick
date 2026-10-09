"""Publisher endpoints (Phase 8)."""

from __future__ import annotations

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from ..db import get_db
from ..errors import NotFoundError
from ..models import Campaign
from ..services import publisher_service

router = APIRouter(prefix="/campaigns", tags=["publishing"])


class PrepareRequest(BaseModel):
    asset_id: int
    platform: str = Field(pattern="^(instagram|facebook|x|whatsapp|sandbox)$")
    media_kind: str = Field(pattern="^(image|video|text)$")
    owner_uid: str = Field(min_length=1, max_length=128)


@router.get("/{campaign_id}/publish/capabilities")
def capabilities(campaign_id: int, db: Session = Depends(get_db)) -> dict:
    _require_campaign(db, campaign_id)
    return publisher_service.list_actions(db, campaign_id)


@router.post("/{campaign_id}/publish/prepare", status_code=201, response_model=dict)
def prepare(campaign_id: int, payload: PrepareRequest, db: Session = Depends(get_db)) -> dict:
    _require_campaign(db, campaign_id)
    record = publisher_service.prepare(
        db,
        campaign_id=campaign_id,
        asset_id=payload.asset_id,
        platform=payload.platform,
        media_kind=payload.media_kind,
        owner_uid=payload.owner_uid,
    )
    db.commit()
    return record


@router.post("/publish/{publish_id}/approve", response_model=dict)
def approve(publish_id: int, db: Session = Depends(get_db)) -> dict:
    record = publisher_service.approve(db, publish_id)
    db.commit()
    return record


@router.post("/publish/{publish_id}/execute", response_model=dict)
def execute(publish_id: int, db: Session = Depends(get_db)) -> dict:
    record = publisher_service.execute(db, publish_id)
    db.commit()
    return record


@router.get("/{campaign_id}/publish/export")
def export_campaign(campaign_id: int, db: Session = Depends(get_db)) -> dict:
    _require_campaign(db, campaign_id)
    return publisher_service.export_package(db, campaign_id)


def _require_campaign(db: Session, campaign_id: int) -> None:
    campaign = db.get(Campaign, campaign_id)
    if campaign is None:
        raise NotFoundError(f"Campaign {campaign_id} was not found.")

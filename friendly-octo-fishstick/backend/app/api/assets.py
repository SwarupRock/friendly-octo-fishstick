"""Asset endpoints (Phase 4): poster generation, caption materialization, listing."""

from __future__ import annotations

from fastapi import APIRouter, Depends
from fastapi.responses import Response
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..db import get_db
from ..errors import NotFoundError
from ..models import AssetRecord, Campaign, VerificationResultRecord
from ..services.assets_service import generate_captions, generate_posters, serialize_asset
from ..storage import get_storage

router = APIRouter(prefix="/campaigns", tags=["assets"])


class GenerateRequest(BaseModel):
    variants: int = Field(default=1, ge=1, le=3)


@router.post("/{campaign_id}/assets/posters", response_model=list[dict])
def create_posters(
    campaign_id: int, payload: GenerateRequest | None = None, db: Session = Depends(get_db)
) -> list[dict]:
    campaign = db.get(Campaign, campaign_id)
    if campaign is None:
        raise NotFoundError(f"Campaign {campaign_id} was not found.")
    variants = payload.variants if payload else 1
    records = generate_posters(db, campaign_id, variants=variants)
    db.commit()
    return [serialize_asset(r) for r in records]


@router.post("/{campaign_id}/assets/captions", response_model=list[dict])
def create_captions(campaign_id: int, db: Session = Depends(get_db)) -> list[dict]:
    campaign = db.get(Campaign, campaign_id)
    if campaign is None:
        raise NotFoundError(f"Campaign {campaign_id} was not found.")
    records = generate_captions(db, campaign_id)
    db.commit()
    return [serialize_asset(r) for r in records]


@router.get("/{campaign_id}/assets")
def list_assets(campaign_id: int, db: Session = Depends(get_db)) -> list[dict]:
    campaign = db.get(Campaign, campaign_id)
    if campaign is None:
        raise NotFoundError(f"Campaign {campaign_id} was not found.")
    rows = db.scalars(
        select(AssetRecord).where(AssetRecord.campaign_id == campaign_id).order_by(AssetRecord.id)
    ).all()
    result = []
    for r in rows:
        item = serialize_asset(r)
        item["verification"] = [
            {
                "check": v.check_name,
                "verdict": v.verdict,
                "confidence": v.confidence,
                "attempt": v.attempt,
            }
            for v in db.scalars(
                select(VerificationResultRecord)
                .where(VerificationResultRecord.asset_id == r.id)
                .order_by(VerificationResultRecord.id)
            ).all()
        ]
        result.append(item)
    return result


@router.get("/assets/{asset_id}/file")
def asset_file(asset_id: int, db: Session = Depends(get_db)) -> Response:
    record = db.get(AssetRecord, asset_id)
    if record is None:
        raise NotFoundError(f"Asset {asset_id} was not found.")
    if not record.storage_path:
        raise NotFoundError(f"Asset {asset_id} has no stored file.")
    data = get_storage().read_bytes(record.storage_path)
    return Response(content=data, media_type="image/png")

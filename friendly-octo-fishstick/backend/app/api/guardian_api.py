"""Guardian API endpoints (Phase 7): verify, repair, certificate, sabotage demo."""

from __future__ import annotations

import json

from fastapi import APIRouter, Depends
from fastapi.responses import HTMLResponse
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..config import get_settings
from ..db import get_db
from ..errors import ConflictError, NotFoundError, ValidationError
from ..models import AssetRecord, Campaign
from ..guardian import certificate as cert_module
from ..guardian.runner import repair_asset, verify_asset

router = APIRouter(tags=["guardian"])


@router.post("/campaigns/{campaign_id}/verify", response_model=list[dict])
def verify_campaign(campaign_id: int, db: Session = Depends(get_db)) -> list[dict]:
    campaign = db.get(Campaign, campaign_id)
    if campaign is None:
        raise NotFoundError(f"Campaign {campaign_id} was not found.")
    records = db.scalars(select(AssetRecord).where(AssetRecord.campaign_id == campaign_id).order_by(AssetRecord.id)).all()
    reports = []
    for record in records:
        report = verify_asset(db, record)
        reports.append(report.as_dict())
    db.commit()
    if not reports:
        raise ConflictError("No assets to verify for this campaign.", code="no_assets")
    return reports


@router.post("/assets/{asset_id}/repair", response_model=dict)
def repair(asset_id: int, db: Session = Depends(get_db)) -> dict:
    record = db.get(AssetRecord, asset_id)
    if record is None:
        raise NotFoundError(f"Asset {asset_id} was not found.")
    result = repair_asset(db, record)
    db.commit()
    return result


@router.post("/campaigns/{campaign_id}/certificate")
def issue_certificate(campaign_id: int, db: Session = Depends(get_db)) -> dict:
    campaign = db.get(Campaign, campaign_id)
    if campaign is None:
        raise NotFoundError(f"Campaign {campaign_id} was not found.")
    certificate = cert_module.build_certificate(db, campaign_id)
    db.commit()
    return certificate


@router.get("/campaigns/{campaign_id}/certificate/html", response_class=HTMLResponse)
def certificate_html(campaign_id: int, db: Session = Depends(get_db)) -> str:
    certificate = cert_module.build_certificate(db, campaign_id)
    return cert_module.certificate_html(certificate)


# ── sabotage demo (development-only, copy-only artifacts) ─────────────
class SabotageRequest(BaseModel):
    mode: str = Field(default="discount", pattern="^(discount|day|claim)$")
    owner_uid: str = Field(min_length=1, max_length=128)


@router.post("/demo/sabotage/{asset_id}", response_model=dict)
def sabotage(asset_id: int, payload: SabotageRequest, db: Session = Depends(get_db)) -> dict:
    """Corrupt a COPY of an asset's caption, show Guardian catching it.

    Rules (handoff §5):
    - requires TITAN_ENABLE_DEMO_SABOTAGE=true AND TITAN_MODE=mock;
    - operates ONLY on a copied test artifact — authoritative assets are never
      mutated; source-of-truth records (factsheets/tokens) are untouched;
    - original caption stays intact.
    """
    settings = get_settings()
    if settings.enable_demo_sabotage is False or not settings.is_mock:
        raise ConflictError(
            "Sabotage demo is disabled (enable TITAN_ENABLE_DEMO_SABOTAGE=true in mock mode).",
            code="sabotage_disabled",
        )
    record = db.get(AssetRecord, asset_id)
    if record is None or record.kind != "caption" or not record.text_content:
        raise NotFoundError(f"Caption asset {asset_id} was not found.")

    text = record.text_content
    original = text
    corrupted = corrupt_text(text, payload.mode)
    if corrupted == original:
        raise ValidationError(
            "Could not apply a corruption to this caption (no target string found).",
            code="sabotage_target_missing",
        )

    test_asset = AssetRecord(
        campaign_id=record.campaign_id,
        plan_id=record.plan_id,
        factsheet_id=record.factsheet_id,
        fact_hash=record.fact_hash,
        kind="caption",
        locale=record.locale,
        text_content=corrupted,
        asset_status="validating",
        provider="sabotage_demo",
        is_mock=True,
        used_fallback=False,
        provenance_json=json.dumps({"copied_from": record.id, "mode": payload.mode, "purpose": "demo"}),
    )
    db.add(test_asset)
    db.flush()
    report = verify_asset(db, test_asset)
    db.flush()
    # The demo copy is deleted after collection — nothing authoritative changed.
    result = {
        "original_asset_id": record.id,
        "original_text": original,
        "corrupted_text": corrupted,
        "guardian_report": report.as_dict(),
        "original_unchanged": True,
    }
    db.delete(test_asset)
    db.commit()
    return result


def corrupt_text(text: str, mode: str) -> str:
    """Deterministic corruption of a COPY: 20→25, Saturday→Sunday, add claim."""
    if mode == "discount":
        return text.replace("20%", "25%") if "20%" in text else text
    if mode == "day":
        return text.replace("Sunday", "Monday") if "Sunday" in text else text
    if mode == "claim":
        return text + " First 50 customers get a free gift!"
    return text

"""Video job endpoints (Phase 6)."""

from __future__ import annotations

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from ..db import get_db
from ..services.video_service import (
    create_video_job,
    run_video_job,
    serialize_job,
)

router = APIRouter(prefix="/campaigns", tags=["videos"])


class VideoJobRequest(BaseModel):
    owner_uid: str = Field(min_length=1, max_length=128)
    profile_id: int | None = None


@router.post("/{campaign_id}/videos/jobs", status_code=202, response_model=dict)
def queue_video_job(campaign_id: int, payload: VideoJobRequest, db: Session = Depends(get_db)) -> dict:
    job = create_video_job(db, campaign_id=campaign_id, owner_uid=payload.owner_uid, profile_id=payload.profile_id)
    db.commit()
    return serialize_job(job)


@router.post("/videos/jobs/{job_id}/run", response_model=dict)
def run_video(job_id: int, db: Session = Depends(get_db)) -> dict:
    """Synchronously drive one queued job (local/demo path).

    In production the durable queue consumer calls the same service function.
    """
    result = run_video_job(db, job_id)
    # run_video_job returns (asset, job) on success or job on failure.
    if isinstance(result, tuple):
        asset, job = result
        db.commit()
        return {"job": serialize_job(job), "asset_id": asset.id}
    job = result
    db.commit()
    return {"job": serialize_job(job), "asset_id": None}

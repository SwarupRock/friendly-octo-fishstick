"""Video job endpoints (Phase 6).

Job ownership follows the campaign: a job id from another account resolves to
404 at `/run`, and the queued payload records the authenticated owner.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..db import get_db
from ..deps import current_user, owned_campaign
from ..errors import NotFoundError
from ..models import Job, User
from ..services.video_service import (
    VIDEO_JOB_STAGE,
    create_video_job,
    run_video_job,
    serialize_job,
)

router = APIRouter(prefix="/campaigns", tags=["videos"])


class VideoJobRequest(BaseModel):
    profile_id: int | None = None


@router.post("/{campaign_id}/videos/jobs", status_code=202, response_model=dict)
def queue_video_job(
    campaign_id: int,
    payload: VideoJobRequest | None = None,
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
) -> dict:
    owned_campaign(db, campaign_id, user)
    job = create_video_job(
        db,
        campaign_id=campaign_id,
        owner_uid=user.owner_uid,
        profile_id=payload.profile_id if payload else None,
    )
    db.commit()
    return serialize_job(job)


@router.get("/{campaign_id}/videos/jobs", response_model=list[dict])
def list_video_jobs(
    campaign_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
) -> list[dict]:
    """Poll the campaign's composition jobs (queued → running → completed/failed)."""
    owned_campaign(db, campaign_id, user)
    jobs = (
        db.query(Job)
        .filter(Job.campaign_id == campaign_id, Job.stage == VIDEO_JOB_STAGE)
        .order_by(Job.id.desc())
        .all()
    )
    return [serialize_job(j) for j in jobs]


@router.post("/videos/jobs/{job_id}/run", response_model=dict)
def run_video(
    job_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
) -> dict:
    """Synchronously drive one queued job (local/demo path).

    In production the durable queue consumer calls the same service function.
    """
    job = db.get(Job, job_id)
    if job is None or job.stage != VIDEO_JOB_STAGE or job.campaign_id is None:
        raise NotFoundError(f"Video job {job_id} was not found.", details={"job_id": job_id})
    owned_campaign(db, job.campaign_id, user)

    result = run_video_job(db, job_id)
    # run_video_job returns (asset, job) on success or job on failure.
    if isinstance(result, tuple):
        asset, job = result
        db.commit()
        return {"job": serialize_job(job), "asset_id": asset.id}
    job = result
    db.commit()
    return {"job": serialize_job(job), "asset_id": None}

"""Video generation job service (Phase 6, handoff §4).

Reliable core: deterministic FFmpeg reel built from the verified poster +
asset audio — Ken Burns zoom on stills with end-card. Agnes Video is the
optional enhancement and is gated behind configuration AND the deliberate
interface-verification toggle; jobs record per-stage state in the ``jobs``
table (``JobStatus`` from the source of truth §24).
"""

from __future__ import annotations

import functools
import json
import shutil
import subprocess  # nosec - argv-array invocation only, never shell strings
import tempfile
from pathlib import Path
from typing import Any

from sqlalchemy.orm import Session

from ..config import get_settings
from ..errors import ConflictError, NotFoundError, ValidationError
from ..models import AssetRecord, Campaign, FactSheetRecord, Job, JobStatus, utcnow
from ..services.checksums import sha256_digest
from ..services.fact_engine import substitute_tokens
from ..services.campaign_brain import get_plan_record

VIDEO_JOB_STAGE = "video_composition"


def _audit(db: Session, campaign_id: int, event_type: str, payload: dict[str, Any] | None = None) -> None:
    db.add(
        __import__("app.models", fromlist=["AuditEvent"]).AuditEvent(
            campaign_id=campaign_id,
            event_type=event_type,
            payload_json=json.dumps(payload) if payload else None,
        )
    )


def _ffmpeg_binary() -> str:
    path = _resolved_ffmpeg()
    if path is None:
        raise ValidationError(
            "FFmpeg is not available on this system.", code="ffmpeg_unavailable"
        )
    return path


def _ffprobe_binary() -> str:
    path = _resolved_ffprobe()
    if path is None:
        raise ValidationError(
            "ffprobe is not available on this system.", code="ffprobe_unavailable"
        )
    return path


@functools.lru_cache(maxsize=1)
def _resolved_ffmpeg() -> str | None:
    return shutil.which("ffmpeg")


@functools.lru_cache(maxsize=1)
def _resolved_ffprobe() -> str | None:
    return shutil.which("ffprobe")


def probe_video(path: Path) -> dict[str, Any]:
    """ffprobe the produced reel; raises on invalid/unprobeable media."""
    ffprobe = _ffprobe_binary()
    try:
        completed = subprocess.run(
            [
                ffprobe,
                "-v", "error",
                "-print_format", "json",
                "-show_format", "-show_streams",
                str(path),
            ],
            capture_output=True,
            timeout=60,
        )
    except subprocess.TimeoutExpired as exc:
        raise ValidationError("ffprobe timed out.", code="media_probe_timeout") from exc
    if completed.returncode != 0:
        raise ValidationError(
            "ffprobe could not read the produced video.",
            code="media_invalid",
            details={"stderr": completed.stderr.decode("utf-8", "replace")[:400]},
        )
    return json.loads(completed.stdout or "{}")


def build_reel_ffmpeg(
    *,
    poster_png: bytes,
    voice_wav: bytes | None,
    headline: str,
    output_path: Path,
) -> bytes:
    """Deterministic Ken Burns reel: poster still (zoompan) + optional audio."""
    ffmpeg = _ffmpeg_binary()
    duration = 6.0
    with tempfile.TemporaryDirectory(prefix="titan-reel-") as tmp:
        tmp_dir = Path(tmp)
        poster_path = tmp_dir / "poster.png"
        poster_path.write_bytes(poster_png)
        args: list[str] = ["-y", "-loop", "1", "-i", str(poster_path)]
        if voice_wav:
            voice_path = tmp_dir / "voice.wav"
            voice_path.write_bytes(voice_wav)
            args += ["-i", str(voice_path)]
        filter_graph = (
            "scale=720:1280,zoompan=z='min(zoom+0.0008,1.08)':d=180:s=720x1280:fps=30"
        )
        args += ["-vf", filter_graph, "-t", str(duration), "-r", "30", "-pix_fmt", "yuv420p"]
        if voice_wav:
            args += ["-c:v", "libx264", "-c:a", "aac", "-shortest"]
        else:
            args += ["-c:v", "libx264"]
        args.append(str(output_path))
        try:
            completed = subprocess.run([ffmpeg, *args], capture_output=True, timeout=180)
        except subprocess.TimeoutExpired as exc:
            raise ValidationError("FFmpeg composition timed out.", code="ffmpeg_timeout") from exc
        except FileNotFoundError as exc:
            raise ValidationError(
                "FFmpeg is not available on this system.",
                code="ffmpeg_unavailable",
            ) from exc
        if completed.returncode != 0:
            raise ValidationError(
                "FFmpeg composition failed.",
                code="ffmpeg_failed",
                details={"stderr": completed.stderr.decode("utf-8", "replace")[:500]},
            )
        return output_path.read_bytes()


def create_video_job(db: Session, *, campaign_id: int, owner_uid: str, profile_id: int | None = None) -> Job:
    """Queue a reel composition job backed by the verified poster + voice."""
    settings = get_settings()
    campaign = db.get(Campaign, campaign_id)
    if campaign is None:
        raise NotFoundError(f"Campaign {campaign_id} was not found.")
    plan_record = get_plan_record(db, campaign_id)
    if plan_record is None:
        raise ConflictError("Generate the campaign plan first (POST /plan).", code="plan_missing")
    posters = (
        db.query(AssetRecord)
        .filter(AssetRecord.campaign_id == campaign_id, AssetRecord.kind == "poster")
        .all()
    )
    if not posters:
        raise ConflictError(
            "Generate a poster asset first (POST /assets/posters).",
            code="poster_missing",
        )
    existing_jobs = (
        db.query(Job)
        .filter(Job.campaign_id == campaign_id, Job.stage == VIDEO_JOB_STAGE, Job.status.in_((JobStatus.QUEUED, JobStatus.RUNNING)))
        .count()
    )
    total_videos = (
        db.query(AssetRecord)
        .filter(AssetRecord.campaign_id == campaign_id, AssetRecord.kind == "video")
        .count()
    )
    if total_videos + existing_jobs >= settings.max_video_jobs:
        raise ConflictError(
            f"Video budget reached ({settings.max_video_jobs}).", code="budget_exceeded"
        )
    job = Job(
        campaign_id=campaign_id,
        stage=VIDEO_JOB_STAGE,
        status=JobStatus.QUEUED,
        payload_json=json.dumps({"owner_uid": owner_uid, "profile_id": profile_id, "poster_asset_id": posters[-1].id}),
    )
    db.add(job)
    db.flush()
    _audit(db, campaign_id, "job.video_queued", {"job_id": job.id})
    return job


def run_video_job(db: Session, job_id: int) -> Job:
    """Execute one queued video job synchronously (worker entry point).

    Production note: this function is deliberately provider-independent and
    idempotent-safe to call from a durable queue consumer (Cloud Tasks →
    Cloud Run worker). Job state transitions are persisted at every step.
    """
    job = db.get(Job, job_id)
    if job is None or job.stage != VIDEO_JOB_STAGE:
        raise NotFoundError(f"Video job {job_id} was not found.")
    if job.status in (JobStatus.COMPLETED,):
        return job
    payload = json.loads(job.payload_json or "{}")
    poster_asset = db.get(AssetRecord, payload.get("poster_asset_id"))
    if poster_asset is None or not poster_asset.storage_path:
        job.status = JobStatus.FAILED
        job.error = "Poster asset for reel is missing."
        db.flush()
        return job

    job.status = JobStatus.RUNNING
    job.started_at = utcnow()
    job.attempts += 1
    db.flush()

    from ..storage import get_storage

    storage = get_storage()
    poster_png = storage.read_bytes(poster_asset.storage_path)
    voice_record = (
        db.query(AssetRecord)
        .filter(
            AssetRecord.campaign_id == job.campaign_id,
            AssetRecord.kind == "voice",
        )
        .order_by(AssetRecord.id.desc())
        .first()
    )
    voice_wav = None
    if voice_record and voice_record.storage_path:
        voice_wav = storage.read_bytes(voice_record.storage_path)

    sheet = db.get(FactSheetRecord, poster_asset.factsheet_id)
    tokens = json.loads(sheet.tokens_json or "{}") if sheet else {}
    headline = substitute_tokens("{{DISCOUNT}} off {{PRODUCT}}", tokens) if tokens.get("DISCOUNT") and tokens.get("PRODUCT") else ""

    try:
        import tempfile

        with tempfile.TemporaryDirectory(prefix="titan-video-") as tmp:
            output_path = Path(tmp) / "reel.mp4"
            build_reel_ffmpeg(
                poster_png=poster_png,
                voice_wav=voice_wav,
                headline=headline,
                output_path=output_path,
            )
            probe = probe_video(output_path)
            video_bytes = output_path.read_bytes()
    except ValidationError as exc:
        job.status = JobStatus.FAILED
        job.error = exc.message
        db.flush()
        _audit(db, job.campaign_id, "job.video_failed", {"job_id": job.id, "code": exc.code})
        return job

    relative_path = f"campaigns/{job.campaign_id}/videos/reel_{job.id}.mp4"
    storage.save_bytes(video_bytes, relative_path)
    sha = sha256_digest(video_bytes)
    record = AssetRecord(
        campaign_id=job.campaign_id,
        plan_id=poster_asset.plan_id,
        factsheet_id=poster_asset.factsheet_id,
        fact_hash=poster_asset.fact_hash,
        kind="video",
        locale=voice_record.locale if voice_record else "en-IN",
        storage_path=relative_path,
        sha256=sha,
        asset_status="validating",
        provider="ffmpeg",
        model="kenburns-v1",
        is_mock=False,
        used_fallback=False,
        provenance_json=json.dumps(
            {
                "poster_asset_id": poster_asset.id,
                "voice_asset_id": voice_record.id if voice_record else None,
                "voice_is_mock": bool(voice_record and voice_record.is_mock),
                "duration_seconds": probe.get("format", {}).get("duration"),
                "streams": len(probe.get("streams") or []),
                "engine": "ffmpeg-kenburns-v1",
            },
            ensure_ascii=False,
        ),
    )
    db.add(record)
    db.flush()
    job.status = JobStatus.COMPLETED
    job.completed_at = utcnow()
    db.flush()
    _audit(db, job.campaign_id, "job.video_completed", {"job_id": job.id, "asset_id": record.id})
    return record, job


def serialize_job(job: Job) -> dict[str, Any]:
    return {
        "id": job.id,
        "campaign_id": job.campaign_id,
        "stage": job.stage,
        "status": job.status,
        "attempts": job.attempts,
        "error": job.error,
        "created_at": str(job.created_at),
        "started_at": str(job.started_at) if job.started_at else None,
        "completed_at": str(job.completed_at) if job.completed_at else None,
    }


__all__ = ["create_video_job", "run_video_job", "serialize_job", "build_reel_ffmpeg", "probe_video", "VIDEO_JOB_STAGE"]

"""Titan backend application factory (Source of Truth §4, §47)."""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .api import (
    assets,
    campaigns,
    factsheets,
    guardian_api,
    health,
    plans,
    publisher,
    videos,
    voice_profiles,
)
from .config import get_settings
from .db import init_db
from .errors import register_exception_handlers
from .storage import get_storage

logger = logging.getLogger("titan")


@asynccontextmanager
async def lifespan(_: FastAPI):
    settings = get_settings()
    init_db()
    storage = get_storage()  # creates the asset root if missing
    logger.info(
        "Titan started mode=%s db=%s assets=%s",
        settings.titan_mode,
        settings.database_url,
        storage.root,
    )
    yield


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(
        title="Titan — Marketing OS",
        version=settings.app_version,
        description="Voice-first marketing campaign system with a Fact Integrity core.",
        lifespan=lifespan,
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=list(settings.cors_origins),
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    register_exception_handlers(app)

    app.include_router(health.router, prefix="/api")
    app.include_router(campaigns.router, prefix="/api")
    app.include_router(factsheets.router, prefix="/api")
    app.include_router(plans.router, prefix="/api")
    app.include_router(assets.router, prefix="/api")
    app.include_router(voice_profiles.router, prefix="/api")
    app.include_router(videos.router, prefix="/api")
    app.include_router(guardian_api.router, prefix="/api")
    app.include_router(publisher.router, prefix="/api")

    @app.get("/", include_in_schema=False)
    def root() -> dict[str, str]:
        return {"name": "Titan API", "docs": "/docs", "health": "/api/health"}

    return app


app = create_app()

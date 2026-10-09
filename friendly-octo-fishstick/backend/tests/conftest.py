"""Shared pytest fixtures.

Environment variables are set *before* the app package is imported so the
cached settings/engine bind to a throwaway SQLite DB and asset directory.
"""

from __future__ import annotations

import os
import tempfile
from pathlib import Path

import pytest

_TMP = Path(tempfile.mkdtemp(prefix="titan-tests-"))

os.environ["TITAN_MODE"] = "mock"
os.environ["TITAN_STT_PROVIDER"] = "auto"
os.environ["TITAN_EXTRACTION_PROVIDER"] = "auto"
os.environ["TITAN_SEAL_SECRET"] = "test-seal-secret-do-not-use-in-prod"
os.environ["TITAN_DATABASE_URL"] = f"sqlite:///{(_TMP / 'test.db').as_posix()}"
os.environ["TITAN_ASSETS_DIR"] = str(_TMP / "assets")
os.environ.pop("TITAN_AGNES_API_BASE", None)
os.environ.pop("TITAN_AGNES_API_KEY", None)


@pytest.fixture(scope="session")
def client():
    from fastapi.testclient import TestClient

    from app.main import app

    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture(autouse=True)
def _clean_db(client):
    """Truncate all tables before each test for isolation."""
    from app.db import Base, get_session_factory

    with get_session_factory()() as session:
        for table in reversed(Base.metadata.sorted_tables):
            session.execute(table.delete())
        session.commit()
    yield


@pytest.fixture
def env_override(monkeypatch):
    """Change env vars + reset cached settings/engine between tests."""
    from app import config, db
    from app.storage import reset_storage_cache

    def _apply(**values: str):
        for key, value in values.items():
            monkeypatch.setenv(key, value)
        config.reset_settings_cache()
        db.reset_engine()
        reset_storage_cache()

    yield _apply

    from app import config as _config, db as _db
    from app.storage import reset_storage_cache as _reset_storage

    _reset_storage()
    _db.reset_engine()
    _config.reset_settings_cache()


@pytest.fixture
def no_seal_secret(monkeypatch):
    """Temporarily remove the HMAC seal secret from EVERY source.

    ``app.config._build_settings`` re-reads the repo-root ``.env`` on every
    build, so deleting the environment variable alone is not enough on a
    machine that has a local ``.env``: the file would silently restore the
    secret and the "no secret" test would not test anything. Disable the .env
    loader for the duration so the test exercises the unconfigured path.
    """
    from app import config

    monkeypatch.delenv("TITAN_SEAL_SECRET", raising=False)
    monkeypatch.setattr(config, "_load_dotenv", lambda path: None)
    config.reset_settings_cache()
    yield
    config.reset_settings_cache()

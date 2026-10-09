"""FactSheet endpoints (Source of Truth §46).

Every route resolves the sheet through `owned_factsheet`, so a sheet id alone
never grants access: the caller must own the campaign the sheet belongs to.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from ..db import get_db
from ..deps import current_user, owned_factsheet
from ..models import User
from ..schemas import FactSheetRead
from ..services.fact_schemas import FactSheetPatch
from ..services.factsheet_service import (
    apply_patch,
    lock_sheet,
    serialize_sheet,
)

router = APIRouter(prefix="/factsheets", tags=["factsheets"])


@router.get("/{sheet_id}", response_model=FactSheetRead)
def get_factsheet(
    sheet_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
) -> FactSheetRead:
    return serialize_sheet(owned_factsheet(db, sheet_id, user))


@router.patch("/{sheet_id}", response_model=FactSheetRead)
def edit_factsheet(
    sheet_id: int,
    patch: FactSheetPatch,
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
) -> FactSheetRead:
    sheet = owned_factsheet(db, sheet_id, user)
    updated = apply_patch(db, sheet, patch)
    return serialize_sheet(updated)


@router.post("/{sheet_id}/lock", response_model=FactSheetRead)
def lock_factsheet(
    sheet_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
) -> FactSheetRead:
    sheet = owned_factsheet(db, sheet_id, user)
    locked = lock_sheet(db, sheet)
    return serialize_sheet(locked)

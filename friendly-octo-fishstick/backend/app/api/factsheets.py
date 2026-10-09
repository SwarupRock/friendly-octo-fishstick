"""FactSheet endpoints (Source of Truth §46)."""

from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from ..db import get_db
from ..schemas import FactSheetRead
from ..services.fact_schemas import FactSheetPatch
from ..services.factsheet_service import (
    apply_patch,
    get_sheet,
    lock_sheet,
    serialize_sheet,
)

router = APIRouter(prefix="/factsheets", tags=["factsheets"])


@router.get("/{sheet_id}", response_model=FactSheetRead)
def get_factsheet(sheet_id: int, db: Session = Depends(get_db)) -> FactSheetRead:
    return serialize_sheet(get_sheet(db, sheet_id))


@router.patch("/{sheet_id}", response_model=FactSheetRead)
def edit_factsheet(
    sheet_id: int, patch: FactSheetPatch, db: Session = Depends(get_db)
) -> FactSheetRead:
    sheet = get_sheet(db, sheet_id)
    updated = apply_patch(db, sheet, patch)
    return serialize_sheet(updated)


@router.post("/{sheet_id}/lock", response_model=FactSheetRead)
def lock_factsheet(sheet_id: int, db: Session = Depends(get_db)) -> FactSheetRead:
    sheet = get_sheet(db, sheet_id)
    locked = lock_sheet(db, sheet)
    return serialize_sheet(locked)

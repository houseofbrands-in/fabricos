import json
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import List
from sqlalchemy.orm import Session
from database import get_db
from models import Bundle, QCLog, TailorJob, User
from auth import require_roles, get_current_user

router = APIRouter(prefix="/qc", tags=["qc"])

ALTERATION_REASONS = [
    "Loose thread",
    "Wrong stitch length",
    "Seam misalignment",
    "Fabric pull",
    "Button misplaced",
    "Zip issue",
    "Measurement off",
    "Dirty mark",
    "Other",
]


@router.get("/reasons")
def get_reasons():
    return ALTERATION_REASONS


@router.get("/pending")
def pending_bundles(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles("qc", "admin")),
):
    bundles = db.query(Bundle).filter_by(status="qc_pending").all()
    return [
        {
            "id": b.id,
            "bundle_code": b.bundle_code,
            "qty": b.qty,
            "design_name": b.design.design_name,
            "image_url": b.design.image_url,
        }
        for b in bundles
    ]


class QCSubmit(BaseModel):
    bundle_id: int
    job_id: int
    passed_qty: int
    alteration_qty: int = 0
    reasons: List[str] = []


@router.post("/submit")
def submit_qc(
    body: QCSubmit,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles("qc", "admin")),
):
    bundle = db.query(Bundle).get(body.bundle_id)
    if not bundle:
        raise HTTPException(404, "Bundle not found")

    log = QCLog(
        bundle_id=body.bundle_id,
        tailor_job_id=body.job_id,
        qc_by=current_user.id,
        passed_qty=body.passed_qty,
        alteration_qty=body.alteration_qty,
        alteration_reasons=json.dumps(body.reasons) if body.reasons else None,
    )
    db.add(log)
    bundle.status = "alteration" if body.alteration_qty > 0 else "passed"
    db.commit()
    return {"ok": True, "bundle_status": bundle.status}

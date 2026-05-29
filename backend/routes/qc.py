import json
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import List
from sqlalchemy.orm import Session
from database import get_db
from models import Bundle, QCLog, TailorJob, User
from auth import require_roles, get_current_user
from bundle_utils import bundle_progress, last_qc_reasons

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
    out = []
    for b in bundles:
        prog = bundle_progress(db, b)
        out.append({
            "id": b.id,
            "bundle_code": b.bundle_code,
            "qty": b.qty,
            "pieces_to_check": prog["outstanding"],   # only the pieces awaiting a verdict
            "is_recheck": prog["is_recheck"],          # True if this bundle was QC'd before
            "prev_reasons": last_qc_reasons(db, b) if prog["is_recheck"] else [],
            "design_name": b.design.design_name,
            "image_url": b.design.image_url,
        })
    return out


class QCSubmit(BaseModel):
    bundle_id: int
    job_id: int
    passed_qty: int
    alteration_qty: int = 0
    scrapped_qty: int = 0
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

    passed = max(0, body.passed_qty or 0)
    altered = max(0, body.alteration_qty or 0)
    scrapped = max(0, body.scrapped_qty or 0)

    # How many pieces are actually awaiting a verdict right now?
    prog = bundle_progress(db, bundle)
    to_check = prog["outstanding"]
    if to_check <= 0:
        raise HTTPException(400, "This bundle has no pieces awaiting QC.")

    # The numbers entered must account for exactly those pieces — no more, no less.
    if passed + altered + scrapped != to_check:
        raise HTTPException(
            400,
            f"This bundle has {to_check} piece(s) to check. "
            f"Passed + Alteration + Scrap must add up to {to_check} "
            f"(you entered {passed} + {altered} + {scrapped} = {passed + altered + scrapped}).",
        )

    log = QCLog(
        bundle_id=body.bundle_id,
        tailor_job_id=body.job_id,
        qc_by=current_user.id,
        passed_qty=passed,
        alteration_qty=altered,
        scrapped_qty=scrapped,
        alteration_reasons=json.dumps(body.reasons) if body.reasons else None,
    )
    db.add(log)

    # Recompute what's left after this verdict.
    new_passed = prog["passed"] + passed
    new_scrapped = prog["scrapped"] + scrapped
    outstanding_after = bundle.qty - new_passed - new_scrapped

    # Still pieces to fix → back to alteration (rework). Otherwise this bundle is done.
    bundle.status = "alteration" if outstanding_after > 0 else "passed"
    db.commit()

    return {
        "ok": True,
        "bundle_status": bundle.status,
        "passed_total": new_passed,
        "scrapped_total": new_scrapped,
        "outstanding": outstanding_after,
    }

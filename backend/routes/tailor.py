import json
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from database import get_db
from models import Bundle, TailorJob, QCLog, Design, User
from auth import require_roles, get_current_user

router = APIRouter(prefix="/tailor", tags=["tailor"])


class ScanBundle(BaseModel):
    bundle_code: str


@router.post("/scan")
def scan_bundle(
    body: ScanBundle,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles("tailor")),
):
    bundle = db.query(Bundle).filter_by(
        bundle_code=body.bundle_code.strip().upper()
    ).first()
    if not bundle:
        raise HTTPException(404, "Bundle not found")
    if bundle.status != "cut":
        raise HTTPException(400, f"Bundle is already '{bundle.status}'. Cannot start.")

    existing = db.query(TailorJob).filter_by(
        tailor_id=current_user.id, status="in_progress"
    ).first()
    if existing:
        raise HTTPException(400, "You already have an active bundle. Submit it first.")

    job = TailorJob(bundle_id=bundle.id, tailor_id=current_user.id)
    bundle.status = "in_progress"
    db.add(job)
    db.commit()
    db.refresh(job)
    return {
        "job_id": job.id,
        "bundle_code": bundle.bundle_code,
        "qty": bundle.qty,
        "design_name": bundle.design.design_name,
        "image_url": bundle.design.image_url,
        "stitch_rate": bundle.design.stitch_rate,
    }


@router.post("/submit/{job_id}")
def submit_job(
    job_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles("tailor")),
):
    job = db.query(TailorJob).get(job_id)
    if not job or job.tailor_id != current_user.id:
        raise HTTPException(404, "Job not found")
    if job.status != "in_progress":
        raise HTTPException(400, "Job already submitted")
    job.status = "submitted"
    job.submitted_at = datetime.utcnow()
    job.bundle.status = "qc_pending"
    db.commit()
    return {"ok": True}


@router.get("/dashboard")
def tailor_dashboard(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles("tailor")),
):
    # Active job
    active_job = db.query(TailorJob).filter_by(
        tailor_id=current_user.id, status="in_progress"
    ).first()

    # All-time earnings
    rows = (
        db.query(QCLog, Design)
        .join(TailorJob, QCLog.tailor_job_id == TailorJob.id)
        .join(Bundle, QCLog.bundle_id == Bundle.id)
        .join(Design, Bundle.design_id == Design.id)
        .filter(TailorJob.tailor_id == current_user.id)
        .all()
    )
    total_earnings = sum(r.passed_qty * d.stitch_rate for r, d in rows)
    total_pieces = sum(r.passed_qty for r, d in rows)

    # Recent alterations
    alt_rows = (
        db.query(QCLog, Bundle)
        .join(TailorJob, QCLog.tailor_job_id == TailorJob.id)
        .join(Bundle, QCLog.bundle_id == Bundle.id)
        .filter(TailorJob.tailor_id == current_user.id, QCLog.alteration_qty > 0)
        .order_by(QCLog.checked_at.desc())
        .limit(10)
        .all()
    )
    alterations = [
        {
            "bundle_code": b.bundle_code,
            "alteration_qty": q.alteration_qty,
            "reasons": json.loads(q.alteration_reasons) if q.alteration_reasons else [],
            "checked_at": q.checked_at.isoformat(),
        }
        for q, b in alt_rows
    ]

    active = None
    if active_job:
        active = {
            "job_id": active_job.id,
            "bundle_code": active_job.bundle.bundle_code,
            "qty": active_job.bundle.qty,
            "design_name": active_job.bundle.design.design_name,
            "image_url": active_job.bundle.design.image_url,
            "stitch_rate": active_job.bundle.design.stitch_rate,
            "started_at": active_job.started_at.isoformat(),
        }

    return {
        "total_earnings": total_earnings,
        "total_pieces": total_pieces,
        "active_job": active,
        "alterations": alterations,
    }

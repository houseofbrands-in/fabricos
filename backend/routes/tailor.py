import json
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from database import get_db
from models import Bundle, TailorJob, QCLog, Design, User
from auth import require_roles, get_current_user
from bundle_utils import bundle_progress, last_qc_reasons

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

    # A bundle can be started when freshly cut, OR picked up again for rework
    # when QC has sent some pieces back (status "alteration").
    if bundle.status not in ("cut", "alteration"):
        raise HTTPException(400, f"Bundle is '{bundle.status}'. Cannot start.")

    existing = db.query(TailorJob).filter_by(
        tailor_id=current_user.id, status="in_progress"
    ).first()
    if existing:
        raise HTTPException(400, "You already have an active bundle. Submit it first.")

    is_rework = bundle.status == "alteration"
    prog = bundle_progress(db, bundle)
    pieces_to_make = prog["outstanding"] if is_rework else bundle.qty

    job = TailorJob(bundle_id=bundle.id, tailor_id=current_user.id)
    bundle.status = "in_progress"
    db.add(job)
    db.commit()
    db.refresh(job)
    return {
        "job_id": job.id,
        "bundle_code": bundle.bundle_code,
        "qty": bundle.qty,
        "pieces_to_make": pieces_to_make,
        "is_rework": is_rework,
        "rework_reasons": last_qc_reasons(db, bundle) if is_rework else [],
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

    # All-time earnings = sum of pieces that PASSED (rework re-passes add here too)
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

    # Alteration feed = bundles this tailor touched that are STILL awaiting rework.
    # Once a bundle is fully resolved (passed), it drops off this list automatically.
    job_bundle_ids = {
        j.bundle_id for j in db.query(TailorJob).filter_by(tailor_id=current_user.id).all()
    }
    alterations = []
    if job_bundle_ids:
        alt_bundles = (
            db.query(Bundle)
            .filter(Bundle.id.in_(job_bundle_ids), Bundle.status == "alteration")
            .all()
        )
        for b in alt_bundles:
            prog = bundle_progress(db, b)
            last = (
                db.query(QCLog)
                .filter(QCLog.bundle_id == b.id)
                .order_by(QCLog.checked_at.desc())
                .first()
            )
            alterations.append({
                "bundle_code": b.bundle_code,
                "alteration_qty": prog["outstanding"],   # pieces still to fix
                "reasons": last_qc_reasons(db, b),
                "checked_at": last.checked_at.isoformat() if last else None,
            })
        alterations.sort(key=lambda a: a["checked_at"] or "", reverse=True)

    active = None
    if active_job:
        b = active_job.bundle
        prog = bundle_progress(db, b)
        is_rework = prog["is_recheck"]
        active = {
            "job_id": active_job.id,
            "bundle_code": b.bundle_code,
            "qty": b.qty,
            "pieces_to_make": prog["outstanding"] if is_rework else b.qty,
            "is_rework": is_rework,
            "rework_reasons": last_qc_reasons(db, b) if is_rework else [],
            "design_name": b.design.design_name,
            "image_url": b.design.image_url,
            "stitch_rate": b.design.stitch_rate,
            "started_at": active_job.started_at.isoformat(),
        }

    return {
        "total_earnings": total_earnings,
        "total_pieces": total_pieces,
        "active_job": active,
        "alterations": alterations,
    }

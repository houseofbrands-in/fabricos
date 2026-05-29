from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from database import get_db
from models import Bundle, TailorJob, User
from auth import require_roles, get_current_user

router = APIRouter(prefix="/ironing", tags=["ironing"])


@router.get("/pending")
def pending_bundles(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles("ironing", "admin")),
):
    bundles = db.query(Bundle).filter_by(status="passed").all()
    return [
        {
            "id": b.id,
            "bundle_code": b.bundle_code,
            "qty": b.qty,
            "design_name": b.design.design_name,
            "design_code": b.design.design_code,
            "image_url": b.design.image_url,
            "qr_url": b.qr_url,
        }
        for b in bundles
    ]


class IronBundle(BaseModel):
    bundle_code: str


@router.post("/scan")
def scan_bundle(
    body: IronBundle,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles("ironing", "admin")),
):
    bundle = db.query(Bundle).filter_by(
        bundle_code=body.bundle_code.strip().upper()
    ).first()
    if not bundle:
        raise HTTPException(404, "Bundle not found")
    if bundle.status != "passed":
        raise HTTPException(400, f"Bundle status is '{bundle.status}'. Only QC-passed bundles can be ironed.")
    return {
        "id": bundle.id,
        "bundle_code": bundle.bundle_code,
        "qty": bundle.qty,
        "design_name": bundle.design.design_name,
        "image_url": bundle.design.image_url,
        "status": bundle.status,
    }


class IronSubmit(BaseModel):
    bundle_id: int


@router.post("/submit")
def submit_ironing(
    body: IronSubmit,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles("ironing", "admin")),
):
    bundle = db.query(Bundle).get(body.bundle_id)
    if not bundle:
        raise HTTPException(404, "Bundle not found")
    if bundle.status != "passed":
        raise HTTPException(400, f"Bundle is '{bundle.status}', expected 'passed'")
    bundle.status = "ironing"
    db.commit()
    return {"ok": True, "bundle_code": bundle.bundle_code}

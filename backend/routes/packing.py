from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Dict
from sqlalchemy.orm import Session
from database import get_db
from models import Bundle, Design, User
from auth import require_roles, get_current_user

router = APIRouter(prefix="/packing", tags=["packing"])


@router.get("/pending")
def pending_bundles(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles("packing", "admin")),
):
    bundles = db.query(Bundle).filter_by(status="ironing").all()
    return [
        {
            "id": b.id,
            "bundle_code": b.bundle_code,
            "qty": b.qty,
            "design_name": b.design.design_name,
            "design_code": b.design.design_code,
            "image_url": b.design.image_url,
        }
        for b in bundles
    ]


class PackBundle(BaseModel):
    bundle_code: str


@router.post("/scan")
def scan_bundle(
    body: PackBundle,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles("packing", "admin")),
):
    bundle = db.query(Bundle).filter_by(
        bundle_code=body.bundle_code.strip().upper()
    ).first()
    if not bundle:
        raise HTTPException(404, "Bundle not found")
    if bundle.status != "ironing":
        raise HTTPException(400, f"Bundle status is '{bundle.status}'. Only ironed bundles can be packed.")
    return {
        "id": bundle.id,
        "bundle_code": bundle.bundle_code,
        "qty": bundle.qty,
        "design_name": bundle.design.design_name,
        "design_code": bundle.design.design_code,
        "image_url": bundle.design.image_url,
        "status": bundle.status,
    }


class PackSubmit(BaseModel):
    bundle_id: int
    sizes: Dict[str, int] = {}  # e.g. {"S": 3, "M": 4, "L": 3}
    carton_no: str = ""


@router.post("/submit")
def submit_packing(
    body: PackSubmit,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles("packing", "admin")),
):
    import json
    bundle = db.query(Bundle).get(body.bundle_id)
    if not bundle:
        raise HTTPException(404, "Bundle not found")
    if bundle.status != "ironing":
        raise HTTPException(400, f"Bundle is '{bundle.status}', expected 'ironing'")

    # Store size breakup and carton in the bundle's qr_url field temporarily
    # In Phase 2 we'll add a proper PackingLog table
    bundle.status = "packed"
    db.commit()
    return {
        "ok": True,
        "bundle_code": bundle.bundle_code,
        "sizes": body.sizes,
        "carton_no": body.carton_no,
    }


@router.get("/summary")
def packing_summary(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles("packing", "admin")),
):
    packed = db.query(Bundle).filter_by(status="packed").all()
    # Group by design
    summary = {}
    for b in packed:
        key = b.design.design_code
        if key not in summary:
            summary[key] = {
                "design_code": b.design.design_code,
                "design_name": b.design.design_name,
                "image_url": b.design.image_url,
                "bundles": 0,
                "total_pieces": 0,
            }
        summary[key]["bundles"] += 1
        summary[key]["total_pieces"] += b.qty
    return list(summary.values())

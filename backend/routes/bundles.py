import os
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session
from database import get_db
from models import Bundle, Design, FabricConsumption
from auth import require_roles, get_current_user, User
from qr_utils import qr_response, generate_qr_png
from fabric_utils import fabric_live_stock

router = APIRouter(prefix="/bundles", tags=["bundles"])


class CutRequest(BaseModel):
    design_id: int
    cut_qty: int
    bundle_size: int = 10


@router.post("/cut")
def record_cut(
    body: CutRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles("cutting", "admin")),
):
    design = db.query(Design).get(body.design_id)
    if not design:
        raise HTTPException(404, "Design not found")

    existing = db.query(Bundle).filter_by(design_id=design.id).count()
    full = body.cut_qty // body.bundle_size
    remainder = body.cut_qty % body.bundle_size
    created = []

    for i in range(full):
        num = existing + i + 1
        code = f"{design.design_code}-B{num:03d}"
        generate_qr_png(code)
        b = Bundle(
            design_id=design.id,
            bundle_code=code,
            qty=body.bundle_size,
            qr_url=f"/bundles/qr/{code}",
        )
        db.add(b)
        created.append(code)

    if remainder:
        num = existing + full + 1
        code = f"{design.design_code}-B{num:03d}"
        generate_qr_png(code)
        b = Bundle(
            design_id=design.id,
            bundle_code=code,
            qty=remainder,
            qr_url=f"/bundles/qr/{code}",
        )
        db.add(b)
        created.append(code)

    # ── Phase 2: auto-deduct fabric (only if this design has fabric info) ──
    fabric_info = None
    if design.fabric_id and design.metres_per_piece:
        metres = round(float(design.metres_per_piece) * body.cut_qty, 2)
        db.add(FabricConsumption(
            design_id=design.id,
            fabric_id=design.fabric_id,
            pieces_cut=body.cut_qty,
            metres_consumed=metres,
            cut_by=current_user.id,
        ))
        db.commit()  # commit so live-stock query reflects this consumption
        remaining = fabric_live_stock(db, design.fabric_id)
        fabric_info = {
            "fabric_id": design.fabric_id,
            "fabric_name": design.fabric.fabric_name if design.fabric else None,
            "metres_per_piece": float(design.metres_per_piece),
            "metres_consumed": metres,
            "remaining": remaining,
            "warning": (
                f"Fabric stock is now {remaining} m (below zero). "
                "Please check intake / job-work records."
            ) if remaining < 0 else None,
        }
    else:
        db.commit()

    return {"created": len(created), "bundle_codes": created, "fabric": fabric_info}


@router.get("/qr/{bundle_code}")
def get_qr(bundle_code: str):
    return qr_response(bundle_code)


@router.get("/")
def list_bundles(
    design_id: int = None,
    status: str = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    q = db.query(Bundle)
    if design_id:
        q = q.filter_by(design_id=design_id)
    if status:
        q = q.filter_by(status=status)
    bundles = q.order_by(Bundle.created_at.desc()).all()
    return [
        {
            "id": b.id,
            "bundle_code": b.bundle_code,
            "design_id": b.design_id,
            "design_name": b.design.design_name,
            "design_code": b.design.design_code,
            "stitch_rate": b.design.stitch_rate,
            "image_url": b.design.image_url,
            "qty": b.qty,
            "status": b.status,
            "qr_url": b.qr_url,
            "created_at": b.created_at.isoformat(),
        }
        for b in bundles
    ]


@router.get("/{bundle_code}/info")
def bundle_info(
    bundle_code: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    b = db.query(Bundle).filter_by(bundle_code=bundle_code.upper()).first()
    if not b:
        raise HTTPException(404, "Bundle not found")
    job = next((j for j in b.tailor_jobs if j.status == "submitted"), None)
    tailor_name = job.tailor.name if job else None
    return {
        "id": b.id,
        "bundle_code": b.bundle_code,
        "qty": b.qty,
        "status": b.status,
        "design_name": b.design.design_name,
        "design_code": b.design.design_code,
        "image_url": b.design.image_url,
        "stitch_rate": b.design.stitch_rate,
        "qr_url": b.qr_url,
        "tailor_name": tailor_name,
        "job_id": job.id if job else None,
    }

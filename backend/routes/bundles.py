import os
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session
from database import get_db
from models import Bundle, Design, FabricConsumption, DesignSize
from auth import require_roles, get_current_user, User
from qr_utils import qr_response, generate_qr_png
from fabric_utils import fabric_live_stock, log_fabric_event
from bundle_utils import bundle_progress, last_qc_reasons

router = APIRouter(prefix="/bundles", tags=["bundles"])

SIZE_ORDER = ["XS", "S", "M", "L", "XL", "XXL", "3XL", "4XL"]


class CutLine(BaseModel):
    size: Optional[str] = None
    qty: int = 0


class CutRequest(BaseModel):
    design_id: int
    lines: Optional[List[CutLine]] = None    # per-size cutting
    cut_qty: Optional[int] = None            # legacy single-batch (no size)
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

    bundle_size = max(1, body.bundle_size or 10)
    lines = []
    if body.lines:
        for ln in body.lines:
            if ln.qty and ln.qty > 0:
                lines.append(((ln.size or "").strip().upper() or None, int(ln.qty)))
    elif body.cut_qty and body.cut_qty > 0:
        lines.append((None, int(body.cut_qty)))
    if not lines:
        raise HTTPException(400, "Enter a quantity to cut")

    existing = db.query(Bundle).filter_by(design_id=design.id).count()
    created, n, total_cut = [], existing, 0
    for size, qty in lines:
        total_cut += qty
        full = qty // bundle_size
        remainder = qty % bundle_size
        chunks = [bundle_size] * full + ([remainder] if remainder else [])
        for chunk in chunks:
            n += 1
            tag = f"-{size}" if size else ""
            code = f"{design.design_code}{tag}-B{n:03d}"
            generate_qr_png(code)
            db.add(Bundle(design_id=design.id, bundle_code=code, qty=chunk,
                          size=size, qr_url=f"/bundles/qr/{code}"))
            created.append(code)

    fabric_info = None
    if design.fabric_id and design.metres_per_piece:
        metres = round(float(design.metres_per_piece) * total_cut, 2)
        db.add(FabricConsumption(
            design_id=design.id, fabric_id=design.fabric_id,
            pieces_cut=total_cut, metres_consumed=metres, cut_by=current_user.id))
        log_fabric_event(db, design.fabric_id, "issued_cutting",
                         detail=f"{metres} m for {total_cut} pcs of {design.design_code}",
                         metres=metres, user_id=current_user.id)
        db.commit()
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

    return {"created": len(created), "bundle_codes": created,
            "pieces_cut": total_cut, "fabric": fabric_info}


@router.get("/cut-progress")
def cut_progress(design_id: int, db: Session = Depends(get_db),
                 current_user: User = Depends(get_current_user)):
    """Per-size: planned (from design) vs already cut (from bundles)."""
    design = db.query(Design).get(design_id)
    if not design:
        raise HTTPException(404, "Design not found")
    plan = {s.size: int(s.qty or 0) for s in db.query(DesignSize).filter_by(design_id=design_id).all()}
    cut = {}
    for b in db.query(Bundle).filter_by(design_id=design_id).all():
        key = (b.size or "").upper() or "—"
        cut[key] = cut.get(key, 0) + b.qty
    sizes = sorted(set(list(plan.keys()) + list(cut.keys())),
                   key=lambda s: SIZE_ORDER.index(s) if s in SIZE_ORDER else 99)
    rows = [{"size": s, "planned": plan.get(s, 0), "cut": cut.get(s, 0)} for s in sizes]
    return {"design_code": design.design_code, "design_name": design.design_name,
            "has_plan": bool(plan), "rows": rows,
            "total_planned": sum(plan.values()), "total_cut": sum(cut.values())}


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
            "size": b.size,
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
    prog = bundle_progress(db, b)
    return {
        "id": b.id,
        "bundle_code": b.bundle_code,
        "qty": b.qty,
        "size": b.size,
        "status": b.status,
        "design_name": b.design.design_name,
        "design_code": b.design.design_code,
        "image_url": b.design.image_url,
        "stitch_rate": b.design.stitch_rate,
        "qr_url": b.qr_url,
        "tailor_name": tailor_name,
        "job_id": job.id if job else None,
        # rework-aware fields
        "pieces_to_check": prog["outstanding"],
        "is_recheck": prog["is_recheck"],
        "passed_so_far": prog["passed"],
        "prev_reasons": last_qc_reasons(db, b) if prog["is_recheck"] else [],
    }
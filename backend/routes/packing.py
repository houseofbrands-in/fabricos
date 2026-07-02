import json
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Dict
from sqlalchemy.orm import Session
from database import get_db
from models import Bundle, Design, User, PackingLog
from auth import require_roles, get_current_user

router = APIRouter(prefix="/packing", tags=["packing"])

SIZE_ORDER = ["XS", "S", "M", "L", "XL", "XXL", "3XL", "4XL"]


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
            "size": b.size,
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
        "size": bundle.size,
        "design_name": bundle.design.design_name,
        "design_code": bundle.design.design_code,
        "image_url": bundle.design.image_url,
        "status": bundle.status,
    }


class PackSubmit(BaseModel):
    bundle_id: int
    sizes: Dict[str, int] = {}   # only used for legacy bundles with no size
    carton_no: str = ""


@router.post("/submit")
def submit_packing(
    body: PackSubmit,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles("packing", "admin")),
):
    bundle = db.query(Bundle).get(body.bundle_id)
    if not bundle:
        raise HTTPException(404, "Bundle not found")
    if bundle.status != "ironing":
        raise HTTPException(400, f"Bundle is '{bundle.status}', expected 'ironing'")

    if bundle.size:
        sizes = {bundle.size: bundle.qty}
    elif body.sizes:
        sizes = {k: int(v) for k, v in body.sizes.items() if int(v or 0) > 0}
    else:
        sizes = {"—": bundle.qty}
    total = sum(sizes.values())

    bundle.status = "packed"
    log = db.query(PackingLog).filter_by(bundle_id=bundle.id).first()
    if not log:
        log = PackingLog(bundle_id=bundle.id)
        db.add(log)
    log.design_id = bundle.design_id
    log.sizes_json = json.dumps(sizes)
    log.total_qty = total
    log.carton_no = (body.carton_no or "").strip()
    log.packed_by = current_user.id
    log.packed_at = datetime.utcnow()
    if log.inwarded is None:
        log.inwarded = False
    db.commit()
    return {"ok": True, "bundle_code": bundle.bundle_code, "sizes": sizes,
            "carton_no": log.carton_no}


@router.get("/summary")
def packing_summary(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles("packing", "admin")),
):
    packed = db.query(Bundle).filter_by(status="packed").all()
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
                "sizes": {},
            }
        row = summary[key]
        row["bundles"] += 1
        row["total_pieces"] += b.qty
        sz = (b.size or "—")
        row["sizes"][sz] = row["sizes"].get(sz, 0) + b.qty

    out = []
    for row in summary.values():
        row["size_breakup"] = [
            {"size": s, "qty": row["sizes"][s]}
            for s in sorted(row["sizes"], key=lambda x: SIZE_ORDER.index(x) if x in SIZE_ORDER else 99)
        ]
        del row["sizes"]
        out.append(row)
    return out
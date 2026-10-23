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


# ── shortages raised by the warehouse at take-in (packed N, fewer found) ──────
@router.get("/shortages")
def list_shortages(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles("packing", "admin")),
):
    from routes.warehouse import _short_dict
    names = {u.id: u.name for u in db.query(User).all()}
    logs = (db.query(PackingLog).filter(PackingLog.short_qty > 0)
            .order_by(PackingLog.short_at.desc()).limit(500).all())
    rows = [_short_dict(db, l, names) for l in logs]
    rows.sort(key=lambda r: 0 if r["status"] == "open" else 1)   # open ones first
    return rows


class ShortResolve(BaseModel):
    action: str          # found | written_off
    note: str = ""


@router.post("/shortages/{packing_id}/resolve")
def resolve_shortage(
    packing_id: int,
    body: ShortResolve,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles("packing", "admin")),
):
    log = db.query(PackingLog).get(packing_id)
    if not log or not log.short_qty:
        raise HTTPException(404, "Shortage not found")
    if log.short_status != "open":
        raise HTTPException(400, "This shortage is already closed")
    if body.action == "found":
        # pieces turned up → send them back to the warehouse's From Production list
        log.short_status = "found"
        log.inwarded = False
    elif body.action == "written_off":
        if not body.note.strip():
            raise HTTPException(400, "Add a note for the write-off")
        log.short_status = "resolved"
    else:
        raise HTTPException(400, "Unknown action")
    log.short_resolved_by = current_user.id
    log.short_resolved_at = datetime.utcnow()
    log.short_resolved_note = body.note.strip()
    db.commit()
    return {"ok": True, "status": log.short_status}

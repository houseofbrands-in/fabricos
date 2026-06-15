import re
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import func
from sqlalchemy.orm import Session
from database import get_db
from models import (
    WarehouseSku, WarehouseSubSku, WarehouseRack, WarehouseMovement, User,
)
from auth import require_roles, get_current_user

router = APIRouter(prefix="/warehouse", tags=["warehouse"])

wh_admin = require_roles("warehouse", "admin")
admin_only = require_roles("admin")


# ── helpers ────────────────────────────────────────────────────────────────
def norm(code: str) -> str:
    """Uppercase + strip everything but letters/digits, so DB-D011DR-A-L and
    DB_D011DR_A_L resolve to the same key."""
    return re.sub(r"[^A-Z0-9]", "", (code or "").upper())


def guess_size(sku_code: str) -> str:
    """Best-effort size from the last segment of the SKU code."""
    parts = re.split(r"[-_\s]+", (sku_code or "").strip())
    return parts[-1].upper() if len(parts) > 1 else ""


def resolve_master(db, code: str):
    """Resolve any scanned/typed code (master or sub, code or barcode) to a master SKU."""
    n = norm(code)
    if not n:
        return None
    m = db.query(WarehouseSku).filter(WarehouseSku.normalized_code == n).first()
    if m:
        return m
    sub = db.query(WarehouseSubSku).filter(WarehouseSubSku.normalized_code == n).first()
    if sub:
        return sub.master
    # barcodes (stored as-given)
    m = db.query(WarehouseSku).filter(WarehouseSku.barcode == code.strip()).first()
    if m:
        return m
    sub = db.query(WarehouseSubSku).filter(WarehouseSubSku.barcode == code.strip()).first()
    return sub.master if sub else None


def sellable_total(db, master_id):
    return int(db.query(func.coalesce(func.sum(WarehouseMovement.qty), 0))
               .filter(WarehouseMovement.master_id == master_id,
                       WarehouseMovement.bucket == "sellable").scalar() or 0)


def quarantine_total(db, master_id):
    return int(db.query(func.coalesce(func.sum(WarehouseMovement.qty), 0))
               .filter(WarehouseMovement.master_id == master_id,
                       WarehouseMovement.bucket == "quarantine").scalar() or 0)


def rack_breakdown(db, master_id):
    rows = (db.query(WarehouseMovement.rack_id, func.sum(WarehouseMovement.qty))
            .filter(WarehouseMovement.master_id == master_id,
                    WarehouseMovement.bucket == "sellable",
                    WarehouseMovement.rack_id.isnot(None))
            .group_by(WarehouseMovement.rack_id).all())
    out = []
    for rack_id, qty in rows:
        if int(qty or 0) == 0:
            continue
        rack = db.query(WarehouseRack).get(rack_id)
        out.append({"rack_id": rack_id, "rack_code": rack.code if rack else "?",
                    "qty": int(qty)})
    return out


def _sku_dict(db, m, with_breakdown=False):
    d = {
        "id": m.id, "sku_code": m.sku_code, "name": m.name, "size": m.size,
        "barcode": m.barcode, "design_code": m.design_code,
        "subs": [{"id": s.id, "sub_code": s.sub_code, "channel": s.channel,
                  "barcode": s.barcode} for s in m.subs],
        "sellable": sellable_total(db, m.id),
        "quarantine": quarantine_total(db, m.id),
    }
    if with_breakdown:
        d["racks"] = rack_breakdown(db, m.id)
    return d


# ════════════════════════════════════════════════════════════════════════════
#  SKU MASTER
# ════════════════════════════════════════════════════════════════════════════
class SkuIn(BaseModel):
    sku_code: str
    name: Optional[str] = ""
    size: Optional[str] = ""
    barcode: Optional[str] = ""
    design_code: Optional[str] = ""


class SubIn(BaseModel):
    sub_code: str
    channel: Optional[str] = ""
    barcode: Optional[str] = ""


@router.get("/skus")
def list_skus(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    rows = db.query(WarehouseSku).order_by(WarehouseSku.sku_code).all()
    return [_sku_dict(db, m, with_breakdown=True) for m in rows]


@router.post("/skus")
def create_sku(body: SkuIn, db: Session = Depends(get_db),
               current_user: User = Depends(wh_admin)):
    code = body.sku_code.strip()
    if not code:
        raise HTTPException(400, "SKU code is required")
    n = norm(code)
    if db.query(WarehouseSku).filter(WarehouseSku.normalized_code == n).first():
        raise HTTPException(400, f"SKU '{code}' already exists")
    if db.query(WarehouseSubSku).filter(WarehouseSubSku.normalized_code == n).first():
        raise HTTPException(400, f"'{code}' is already used as a sub-SKU")
    m = WarehouseSku(
        sku_code=code, normalized_code=n,
        name=(body.name or "").strip(),
        size=(body.size or "").strip() or guess_size(code),
        barcode=(body.barcode or "").strip(),
        design_code=(body.design_code or "").strip(),
    )
    db.add(m)
    db.commit()
    db.refresh(m)
    return _sku_dict(db, m)


@router.post("/skus/{sku_id}/subs")
def add_sub(sku_id: int, body: SubIn, db: Session = Depends(get_db),
            current_user: User = Depends(wh_admin)):
    m = db.query(WarehouseSku).get(sku_id)
    if not m:
        raise HTTPException(404, "Master SKU not found")
    code = body.sub_code.strip()
    n = norm(code)
    if not n:
        raise HTTPException(400, "Sub-SKU code is required")
    if db.query(WarehouseSku).filter(WarehouseSku.normalized_code == n).first():
        raise HTTPException(400, f"'{code}' is already a master SKU")
    if db.query(WarehouseSubSku).filter(WarehouseSubSku.normalized_code == n).first():
        raise HTTPException(400, f"Sub-SKU '{code}' already exists")
    sub = WarehouseSubSku(master_id=m.id, sub_code=code, normalized_code=n,
                          channel=(body.channel or "").strip(),
                          barcode=(body.barcode or "").strip())
    db.add(sub)
    db.commit()
    return _sku_dict(db, m)


@router.delete("/skus/{sku_id}/subs/{sub_id}")
def delete_sub(sku_id: int, sub_id: int, db: Session = Depends(get_db),
               current_user: User = Depends(wh_admin)):
    sub = db.query(WarehouseSubSku).get(sub_id)
    if not sub:
        raise HTTPException(404, "Sub-SKU not found")
    db.delete(sub)
    db.commit()
    return {"ok": True}


@router.delete("/skus/{sku_id}")
def delete_sku(sku_id: int, db: Session = Depends(get_db),
               current_user: User = Depends(admin_only)):
    m = db.query(WarehouseSku).get(sku_id)
    if not m:
        raise HTTPException(404, "SKU not found")
    db.query(WarehouseMovement).filter_by(master_id=sku_id).delete()
    db.delete(m)   # subs cascade
    db.commit()
    return {"ok": True}


@router.get("/resolve")
def resolve(code: str, db: Session = Depends(get_db),
            current_user: User = Depends(get_current_user)):
    m = resolve_master(db, code)
    if not m:
        raise HTTPException(404, f"'{code}' is not in the SKU master")
    return _sku_dict(db, m, with_breakdown=True)


# ════════════════════════════════════════════════════════════════════════════
#  RACKS
# ════════════════════════════════════════════════════════════════════════════
class RackIn(BaseModel):
    code: str
    zone: Optional[str] = ""
    barcode: Optional[str] = ""


@router.get("/racks")
def list_racks(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    racks = db.query(WarehouseRack).order_by(WarehouseRack.code).all()
    out = []
    for r in racks:
        total = int(db.query(func.coalesce(func.sum(WarehouseMovement.qty), 0))
                    .filter(WarehouseMovement.rack_id == r.id,
                            WarehouseMovement.bucket == "sellable").scalar() or 0)
        distinct = (db.query(WarehouseMovement.master_id)
                    .filter(WarehouseMovement.rack_id == r.id,
                            WarehouseMovement.bucket == "sellable")
                    .group_by(WarehouseMovement.master_id)
                    .having(func.sum(WarehouseMovement.qty) > 0).count())
        out.append({"id": r.id, "code": r.code, "zone": r.zone, "barcode": r.barcode,
                    "total_units": total, "distinct_skus": distinct})
    return out


@router.post("/racks")
def create_rack(body: RackIn, db: Session = Depends(get_db),
                current_user: User = Depends(wh_admin)):
    code = body.code.strip()
    if not code:
        raise HTTPException(400, "Rack code is required")
    n = norm(code)
    if db.query(WarehouseRack).filter(WarehouseRack.normalized_code == n).first():
        raise HTTPException(400, f"Rack '{code}' already exists")
    r = WarehouseRack(code=code, normalized_code=n, zone=(body.zone or "").strip(),
                      barcode=(body.barcode or "").strip())
    db.add(r)
    db.commit()
    db.refresh(r)
    return {"id": r.id, "code": r.code}


@router.delete("/racks/{rack_id}")
def delete_rack(rack_id: int, db: Session = Depends(get_db),
                current_user: User = Depends(admin_only)):
    r = db.query(WarehouseRack).get(rack_id)
    if not r:
        raise HTTPException(404, "Rack not found")
    units = int(db.query(func.coalesce(func.sum(WarehouseMovement.qty), 0))
                .filter(WarehouseMovement.rack_id == rack_id,
                        WarehouseMovement.bucket == "sellable").scalar() or 0)
    if units > 0:
        raise HTTPException(400, f"Rack still holds {units} unit(s). Move them out first.")
    db.query(WarehouseMovement).filter_by(rack_id=rack_id).delete()
    db.delete(r)
    db.commit()
    return {"ok": True}


@router.get("/rack/{rack_id}")
def rack_contents(rack_id: int, db: Session = Depends(get_db),
                  current_user: User = Depends(get_current_user)):
    r = db.query(WarehouseRack).get(rack_id)
    if not r:
        raise HTTPException(404, "Rack not found")
    rows = (db.query(WarehouseMovement.master_id, func.sum(WarehouseMovement.qty))
            .filter(WarehouseMovement.rack_id == rack_id,
                    WarehouseMovement.bucket == "sellable")
            .group_by(WarehouseMovement.master_id).all())
    items = []
    for master_id, qty in rows:
        if int(qty or 0) == 0:
            continue
        m = db.query(WarehouseSku).get(master_id)
        items.append({"master_id": master_id, "sku_code": m.sku_code if m else "?",
                      "name": m.name if m else "", "size": m.size if m else "",
                      "qty": int(qty)})
    return {"id": r.id, "code": r.code, "zone": r.zone, "items": items}


# ════════════════════════════════════════════════════════════════════════════
#  INWARD  (scan rack → scan SKU → lands on that rack)
# ════════════════════════════════════════════════════════════════════════════
class InwardIn(BaseModel):
    rack_code: str                 # scanned/typed rack code or barcode
    sku_code: str                  # scanned/typed master or sub code/barcode
    qty: int = 1
    note: Optional[str] = ""


@router.post("/inward")
def inward(body: InwardIn, db: Session = Depends(get_db),
           current_user: User = Depends(wh_admin)):
    if body.qty <= 0:
        raise HTTPException(400, "Quantity must be at least 1")
    # resolve rack (by normalized code or barcode)
    rn = norm(body.rack_code)
    rack = db.query(WarehouseRack).filter(WarehouseRack.normalized_code == rn).first()
    if not rack:
        rack = db.query(WarehouseRack).filter(WarehouseRack.barcode == body.rack_code.strip()).first()
    if not rack:
        raise HTTPException(404, f"Rack '{body.rack_code}' not found")
    master = resolve_master(db, body.sku_code)
    if not master:
        raise HTTPException(404, f"'{body.sku_code}' is not in the SKU master — add it first")

    db.add(WarehouseMovement(
        master_id=master.id, rack_id=rack.id, bucket="sellable", qty=body.qty,
        move_type="inward", source="manual", reference=f"Rack {rack.code}",
        note=(body.note or "").strip(), created_by=current_user.id,
    ))
    db.commit()
    return {
        "ok": True,
        "sku_code": master.sku_code,
        "name": master.name,
        "rack_code": rack.code,
        "added": body.qty,
        "rack_qty_now": int(db.query(func.coalesce(func.sum(WarehouseMovement.qty), 0))
                            .filter(WarehouseMovement.master_id == master.id,
                                    WarehouseMovement.rack_id == rack.id,
                                    WarehouseMovement.bucket == "sellable").scalar() or 0),
        "sellable_total_now": sellable_total(db, master.id),
    }


# ════════════════════════════════════════════════════════════════════════════
#  STOCK + MOVEMENTS
# ════════════════════════════════════════════════════════════════════════════
@router.get("/stock")
def stock(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    rows = db.query(WarehouseSku).order_by(WarehouseSku.sku_code).all()
    out = [_sku_dict(db, m, with_breakdown=True) for m in rows]
    return {
        "skus": out,
        "total_units": sum(s["sellable"] for s in out),
        "total_quarantine": sum(s["quarantine"] for s in out),
    }


@router.get("/movements")
def movements(limit: int = 100, db: Session = Depends(get_db),
              current_user: User = Depends(get_current_user)):
    rows = (db.query(WarehouseMovement)
            .order_by(WarehouseMovement.created_at.desc()).limit(limit).all())
    out = []
    for mv in rows:
        m = db.query(WarehouseSku).get(mv.master_id) if mv.master_id else None
        rack = db.query(WarehouseRack).get(mv.rack_id) if mv.rack_id else None
        out.append({
            "id": mv.id, "sku_code": m.sku_code if m else "?",
            "rack_code": rack.code if rack else None,
            "bucket": mv.bucket, "qty": mv.qty, "move_type": mv.move_type,
            "source": mv.source, "reference": mv.reference,
            "at": mv.created_at.isoformat() if mv.created_at else None,
        })
    return out

import re
import io
import csv
import json
import base64
from datetime import datetime
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from pydantic import BaseModel
from sqlalchemy import func
from sqlalchemy.orm import Session
from database import get_db
from models import (
    WarehouseSku, WarehouseSubSku, WarehouseRack, WarehouseMovement, User,
    MarketplaceTemplate, WarehouseUploadBatch, AppSetting,
    PackingLog, WarehouseProductionMap, Bundle, Design,
)
from auth import require_roles, get_current_user

router = APIRouter(prefix="/warehouse", tags=["warehouse"])

wh_admin = require_roles("warehouse", "admin")
admin_only = require_roles("admin")


# ── file reading (CSV / XLSX) — shared with marketplace uploads later ───────
def read_table(upload: UploadFile):
    """Return a list of dict rows from an uploaded CSV or XLSX file."""
    raw = upload.file.read()
    name = (upload.filename or "").lower()
    if name.endswith(".xlsx") or name.endswith(".xlsm"):
        import openpyxl
        wb = openpyxl.load_workbook(io.BytesIO(raw), read_only=True, data_only=True)
        ws = wb.active
        rows = list(ws.iter_rows(values_only=True))
        if not rows:
            return []
        headers = [str(h).strip() if h is not None else "" for h in rows[0]]
        out = []
        for r in rows[1:]:
            d = {}
            for i, h in enumerate(headers):
                d[h] = r[i] if i < len(r) and r[i] is not None else ""
            out.append(d)
        return out
    # CSV (try utf-8 then latin-1)
    try:
        text = raw.decode("utf-8-sig")
    except UnicodeDecodeError:
        text = raw.decode("latin-1")
    return list(csv.DictReader(io.StringIO(text)))


def pick(row: dict, *names):
    """Case/space-insensitive column lookup."""
    lowered = {re.sub(r"[^a-z0-9]", "", str(k).lower()): v for k, v in row.items()}
    for n in names:
        key = re.sub(r"[^a-z0-9]", "", n.lower())
        if key in lowered and lowered[key] not in (None, ""):
            return str(lowered[key]).strip()
    return ""


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


@router.post("/skus/bulk")
async def bulk_skus(file: UploadFile = File(...), db: Session = Depends(get_db),
                    current_user: User = Depends(wh_admin)):
    """Upload many master SKUs at once (CSV or XLSX). Bad/duplicate rows are
    skipped and reported — never silently dropped."""
    try:
        rows = read_table(file)
    except Exception as e:
        raise HTTPException(400, f"Could not read the file: {e}")
    if not rows:
        raise HTTPException(400, "The file has no rows")

    created, skipped = 0, []
    seen = set()
    for i, row in enumerate(rows, start=2):   # row 1 is the header
        code = pick(row, "sku_code", "sku", "sku code", "master sku", "style")
        if not code:
            skipped.append({"row": i, "sku_code": "", "reason": "no SKU code"})
            continue
        n = norm(code)
        if n in seen:
            skipped.append({"row": i, "sku_code": code, "reason": "duplicate in file"})
            continue
        if db.query(WarehouseSku).filter(WarehouseSku.normalized_code == n).first():
            skipped.append({"row": i, "sku_code": code, "reason": "already exists"})
            continue
        if db.query(WarehouseSubSku).filter(WarehouseSubSku.normalized_code == n).first():
            skipped.append({"row": i, "sku_code": code, "reason": "already a sub-SKU"})
            continue
        size = pick(row, "size") or guess_size(code)
        db.add(WarehouseSku(
            sku_code=code, normalized_code=n,
            name=pick(row, "name", "product", "product name", "description"),
            size=size,
            barcode=pick(row, "barcode", "ean", "bar code"),
            design_code=pick(row, "design_code", "design", "design code"),
        ))
        seen.add(n)
        created += 1
    db.commit()
    return {"created": created, "skipped": skipped, "total": len(rows)}


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


@router.post("/subs/bulk")
async def bulk_subs(file: UploadFile = File(...), db: Session = Depends(get_db),
                    current_user: User = Depends(wh_admin)):
    """Bulk-map sub-SKUs to masters. Columns: master_sku, sub_sku, channel, barcode.
    Bad/duplicate rows are skipped and reported."""
    try:
        rows = read_table(file)
    except Exception as e:
        raise HTTPException(400, f"Could not read the file: {e}")
    if not rows:
        raise HTTPException(400, "The file has no rows")

    created, skipped, seen = 0, [], set()
    for i, row in enumerate(rows, start=2):
        master_code = pick(row, "master_sku", "master", "master sku", "master code")
        sub_code = pick(row, "sub_sku", "sub", "sub sku", "sub code", "code")
        channel = pick(row, "channel", "brand", "platform", "marketplace")
        barcode = pick(row, "barcode", "ean", "bar code")
        if not sub_code:
            skipped.append({"row": i, "detail": "", "reason": "no sub-SKU code"})
            continue
        if not master_code:
            skipped.append({"row": i, "detail": sub_code, "reason": "no master SKU"})
            continue
        master = db.query(WarehouseSku).filter(WarehouseSku.normalized_code == norm(master_code)).first()
        if not master:
            skipped.append({"row": i, "detail": f"{sub_code} → {master_code}", "reason": "master not found"})
            continue
        sn = norm(sub_code)
        if sn == master.normalized_code:
            skipped.append({"row": i, "detail": sub_code, "reason": "sub same as master"})
            continue
        if sn in seen:
            skipped.append({"row": i, "detail": sub_code, "reason": "duplicate in file"})
            continue
        if db.query(WarehouseSku).filter(WarehouseSku.normalized_code == sn).first():
            skipped.append({"row": i, "detail": sub_code, "reason": "already a master SKU"})
            continue
        if db.query(WarehouseSubSku).filter(WarehouseSubSku.normalized_code == sn).first():
            skipped.append({"row": i, "detail": sub_code, "reason": "sub-SKU already mapped"})
            continue
        db.add(WarehouseSubSku(master_id=master.id, sub_code=sub_code.strip(),
                               normalized_code=sn, channel=channel, barcode=barcode))
        seen.add(sn)
        created += 1
    db.commit()
    return {"created": created, "total": len(rows), "skipped": skipped}


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


@router.post("/inward/bulk")
async def inward_bulk(file: UploadFile = File(...), db: Session = Depends(get_db),
                      current_user: User = Depends(wh_admin)):
    """Inward many items at once. Columns: rack, sku, qty. Bad rows are skipped
    and reported — never silently dropped."""
    try:
        rows = read_table(file)
    except Exception as e:
        raise HTTPException(400, f"Could not read the file: {e}")
    if not rows:
        raise HTTPException(400, "The file has no rows")

    created_units, created_rows, skipped = 0, 0, []
    for i, row in enumerate(rows, start=2):
        rack_code = pick(row, "rack", "rack_code", "rack code", "location", "bin")
        sku_code = pick(row, "sku", "sku_code", "sku code", "code", "barcode")
        qv = pick(row, "qty", "quantity", "qty.")
        try:
            qty = int(float(qv)) if qv else 1
        except ValueError:
            qty = 1
        if not sku_code:
            skipped.append({"row": i, "detail": "", "reason": "no SKU"})
            continue
        if not rack_code:
            skipped.append({"row": i, "detail": sku_code, "reason": "no rack"})
            continue
        if qty <= 0:
            skipped.append({"row": i, "detail": sku_code, "reason": "qty must be > 0"})
            continue
        rn = norm(rack_code)
        rack = db.query(WarehouseRack).filter(WarehouseRack.normalized_code == rn).first()
        if not rack:
            rack = db.query(WarehouseRack).filter(WarehouseRack.barcode == rack_code.strip()).first()
        if not rack:
            skipped.append({"row": i, "detail": f"{sku_code} → {rack_code}", "reason": "rack not found"})
            continue
        master = resolve_master(db, sku_code)
        if not master:
            skipped.append({"row": i, "detail": sku_code, "reason": "SKU not in master"})
            continue
        db.add(WarehouseMovement(
            master_id=master.id, rack_id=rack.id, bucket="sellable", qty=qty,
            move_type="inward", source="manual", reference=f"Bulk · Rack {rack.code}",
            created_by=current_user.id))
        created_units += qty
        created_rows += 1
    db.commit()
    return {"created_rows": created_rows, "created_units": created_units,
            "total": len(rows), "skipped": skipped}


class PickIn(BaseModel):
    rack_code: str
    sku_code: str
    qty: int = 1
    reference: Optional[str] = ""


@router.post("/pick")
def pick_scan(body: PickIn, db: Session = Depends(get_db),
              current_user: User = Depends(wh_admin)):
    """Live scan-picking: scan a rack, then scan items pulled from it. Deducts from
    that exact rack in real time. Refuses to pull more than the rack physically holds."""
    if body.qty <= 0:
        raise HTTPException(400, "Quantity must be at least 1")
    rn = norm(body.rack_code)
    rack = db.query(WarehouseRack).filter(WarehouseRack.normalized_code == rn).first()
    if not rack:
        rack = db.query(WarehouseRack).filter(WarehouseRack.barcode == body.rack_code.strip()).first()
    if not rack:
        raise HTTPException(404, f"Rack '{body.rack_code}' not found")
    master = resolve_master(db, body.sku_code)
    if not master:
        raise HTTPException(404, f"'{body.sku_code}' is not in the SKU master")
    on_rack = int(db.query(func.coalesce(func.sum(WarehouseMovement.qty), 0))
                  .filter(WarehouseMovement.master_id == master.id,
                          WarehouseMovement.rack_id == rack.id,
                          WarehouseMovement.bucket == "sellable").scalar() or 0)
    if body.qty > on_rack:
        raise HTTPException(400, f"Only {on_rack} of {master.sku_code} on rack {rack.code}")
    db.add(WarehouseMovement(
        master_id=master.id, rack_id=rack.id, bucket="sellable", qty=-body.qty,
        move_type="outward", source="scan", reference=(body.reference or "").strip() or f"Rack {rack.code}",
        created_by=current_user.id))
    db.commit()
    return {
        "ok": True, "sku_code": master.sku_code, "name": master.name,
        "rack_code": rack.code, "picked": body.qty,
        "rack_qty_now": on_rack - body.qty,
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


# ════════════════════════════════════════════════════════════════════════════
#  MARKETPLACE TEMPLATES  (configurable column mapping)
# ════════════════════════════════════════════════════════════════════════════
class TemplateIn(BaseModel):
    name: str
    sku_column: str
    qty_column: Optional[str] = ""
    order_id_column: Optional[str] = ""
    status_column: Optional[str] = ""
    status_include: Optional[str] = ""


def _tpl_dict(t):
    return {"id": t.id, "name": t.name, "sku_column": t.sku_column,
            "qty_column": t.qty_column, "order_id_column": t.order_id_column,
            "status_column": t.status_column, "status_include": t.status_include}


def get_template(db, marketplace):
    t = None
    if str(marketplace).isdigit():
        t = db.query(MarketplaceTemplate).get(int(marketplace))
    if not t:
        t = db.query(MarketplaceTemplate).filter(
            func.lower(MarketplaceTemplate.name) == str(marketplace).lower()).first()
    return t


@router.get("/templates")
def list_templates(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return [_tpl_dict(t) for t in db.query(MarketplaceTemplate).order_by(MarketplaceTemplate.name).all()]


@router.post("/templates")
def create_template(body: TemplateIn, db: Session = Depends(get_db),
                    current_user: User = Depends(wh_admin)):
    if not body.name.strip() or not body.sku_column.strip():
        raise HTTPException(400, "Name and SKU column are required")
    if db.query(MarketplaceTemplate).filter(func.lower(MarketplaceTemplate.name) == body.name.lower()).first():
        raise HTTPException(400, f"Template '{body.name}' already exists")
    t = MarketplaceTemplate(
        name=body.name.strip(), sku_column=body.sku_column.strip(),
        qty_column=(body.qty_column or "").strip(),
        order_id_column=(body.order_id_column or "").strip(),
        status_column=(body.status_column or "").strip(),
        status_include=(body.status_include or "").strip())
    db.add(t)
    db.commit()
    db.refresh(t)
    return _tpl_dict(t)


@router.patch("/templates/{tid}")
def update_template(tid: int, body: TemplateIn, db: Session = Depends(get_db),
                    current_user: User = Depends(wh_admin)):
    t = db.query(MarketplaceTemplate).get(tid)
    if not t:
        raise HTTPException(404, "Template not found")
    t.name = body.name.strip()
    t.sku_column = body.sku_column.strip()
    t.qty_column = (body.qty_column or "").strip()
    t.order_id_column = (body.order_id_column or "").strip()
    t.status_column = (body.status_column or "").strip()
    t.status_include = (body.status_include or "").strip()
    db.commit()
    return _tpl_dict(t)


@router.delete("/templates/{tid}")
def delete_template(tid: int, db: Session = Depends(get_db),
                    current_user: User = Depends(admin_only)):
    t = db.query(MarketplaceTemplate).get(tid)
    if not t:
        raise HTTPException(404, "Template not found")
    db.delete(t)
    db.commit()
    return {"ok": True}


@router.post("/templates/headers")
async def template_headers(file: UploadFile = File(...), db: Session = Depends(get_db),
                           current_user: User = Depends(wh_admin)):
    """Read just the column headers of an uploaded dummy file, for re-mapping."""
    try:
        rows = read_table(file)
    except Exception as e:
        raise HTTPException(400, f"Could not read the file: {e}")
    headers = list(rows[0].keys()) if rows else []
    return {"headers": [h for h in headers if str(h).strip()]}


# ════════════════════════════════════════════════════════════════════════════
#  UPLOAD ENGINE  (parse → resolve → FIFO pick allocation)
# ════════════════════════════════════════════════════════════════════════════
def parse_order_file(rows, t):
    """Aggregate quantity per SKU code, applying the template's status filter."""
    includes = [s.strip().lower() for s in (t.status_include or "").split(",") if s.strip()]
    agg, considered = {}, 0
    for row in rows:
        if t.status_column and includes:
            st = pick(row, t.status_column).lower()
            if st and st not in includes:
                continue
        code = pick(row, t.sku_column)
        if not code:
            continue
        if t.qty_column:
            qv = pick(row, t.qty_column)
            try:
                qn = int(float(qv)) if qv else 1
            except ValueError:
                qn = 1
        else:
            qn = 1
        agg[code] = agg.get(code, 0) + qn
        considered += 1
    return agg, considered


def resolve_and_split(db, agg):
    matched, unmatched = {}, []
    for code, qty in agg.items():
        m = resolve_master(db, code)
        if m:
            if m.id in matched:
                matched[m.id]["qty"] += qty
            else:
                matched[m.id] = {"master": m, "qty": qty}
        else:
            unmatched.append({"code": code, "qty": qty})
    return matched, unmatched


def allocate_picks(db, master_id, needed):
    """FIFO: pull from the rack whose stock arrived earliest first."""
    rows = (db.query(WarehouseMovement.rack_id,
                     func.sum(WarehouseMovement.qty).label("q"),
                     func.min(WarehouseMovement.created_at).label("first"))
            .filter(WarehouseMovement.master_id == master_id,
                    WarehouseMovement.bucket == "sellable",
                    WarehouseMovement.rack_id.isnot(None))
            .group_by(WarehouseMovement.rack_id).all())
    racks = sorted([(r.rack_id, int(r.q or 0), r.first) for r in rows if int(r.q or 0) > 0],
                   key=lambda x: (x[2] or datetime.min))
    plan, remaining = [], needed
    for rid, avail, _ in racks:
        if remaining <= 0:
            break
        take = min(avail, remaining)
        rack = db.query(WarehouseRack).get(rid)
        plan.append({"rack_id": rid, "rack_code": rack.code if rack else "?", "qty": take})
        remaining -= take
    return plan, max(0, remaining)


def _build_lines(db, matched):
    lines = []
    for mid, info in matched.items():
        plan, shortfall = allocate_picks(db, mid, info["qty"])
        m = info["master"]
        lines.append({
            "master_id": mid, "sku_code": m.sku_code, "name": m.name, "size": m.size,
            "needed": info["qty"], "available": sellable_total(db, mid),
            "picks": plan, "shortfall": shortfall,
        })
    lines.sort(key=lambda x: x["sku_code"])
    return lines


@router.post("/upload/preview")
async def upload_preview(marketplace: str = Form(...), file: UploadFile = File(...),
                         db: Session = Depends(get_db), current_user: User = Depends(wh_admin)):
    t = get_template(db, marketplace)
    if not t:
        raise HTTPException(404, "No template for that marketplace — set one up in Templates")
    rows = read_table(file)
    agg, considered = parse_order_file(rows, t)
    matched, unmatched = resolve_and_split(db, agg)
    lines = _build_lines(db, matched)
    return {
        "marketplace": t.name, "filename": file.filename,
        "rows_total": len(rows), "rows_considered": considered,
        "lines": lines, "unmatched": unmatched,
        "totals": {
            "skus": len(lines),
            "units_needed": sum(l["needed"] for l in lines) + sum(u["qty"] for u in unmatched),
            "units_to_pick": sum(l["needed"] - l["shortfall"] for l in lines),
            "units_short": sum(l["shortfall"] for l in lines),
            "unmatched_skus": len(unmatched),
            "unmatched_units": sum(u["qty"] for u in unmatched),
        },
    }


@router.post("/upload/commit")
async def upload_commit(marketplace: str = Form(...), file: UploadFile = File(...),
                        db: Session = Depends(get_db), current_user: User = Depends(wh_admin)):
    t = get_template(db, marketplace)
    if not t:
        raise HTTPException(404, "No template for that marketplace")
    rows = read_table(file)
    agg, considered = parse_order_file(rows, t)
    matched, unmatched = resolve_and_split(db, agg)
    lines = _build_lines(db, matched)   # computed BEFORE deduction, so the guide is correct

    units = 0
    for ln in lines:
        for p in ln["picks"]:
            db.add(WarehouseMovement(
                master_id=ln["master_id"], rack_id=p["rack_id"], bucket="sellable",
                qty=-p["qty"], move_type="outward", source=t.name.lower(),
                reference=file.filename, created_by=current_user.id))
            units += p["qty"]
    db.add(WarehouseUploadBatch(
        marketplace=t.name, kind="outward", filename=file.filename,
        rows_total=len(rows), rows_matched=len(matched), rows_unmatched=len(unmatched),
        units=units, unmatched_json=json.dumps(unmatched), created_by=current_user.id))
    db.commit()
    return {"ok": True, "deducted_units": units, "lines": lines, "unmatched": unmatched,
            "totals": {"skus": len(lines), "units_short": sum(l["shortfall"] for l in lines),
                       "unmatched_units": sum(u["qty"] for u in unmatched)}}


# ════════════════════════════════════════════════════════════════════════════
#  RETURNS  →  QUARANTINE  →  RESTOCK / SCRAP
# ════════════════════════════════════════════════════════════════════════════
@router.post("/returns/upload")
async def returns_upload(marketplace: str = Form(...), file: UploadFile = File(...),
                         db: Session = Depends(get_db), current_user: User = Depends(wh_admin)):
    t = get_template(db, marketplace)
    if not t:
        raise HTTPException(404, "No template for that marketplace")
    rows = read_table(file)
    agg, considered = parse_order_file(rows, t)
    matched, unmatched = resolve_and_split(db, agg)
    units = 0
    for mid, info in matched.items():
        db.add(WarehouseMovement(
            master_id=mid, rack_id=None, bucket="quarantine", qty=info["qty"],
            move_type="return_in", source=t.name.lower(), reference=file.filename,
            created_by=current_user.id))
        units += info["qty"]
    db.add(WarehouseUploadBatch(
        marketplace=t.name, kind="return", filename=file.filename,
        rows_total=len(rows), rows_matched=len(matched), rows_unmatched=len(unmatched),
        units=units, unmatched_json=json.dumps(unmatched), created_by=current_user.id))
    db.commit()
    return {"ok": True, "added_to_quarantine": units,
            "matched_skus": len(matched), "unmatched": unmatched}


@router.get("/quarantine")
def quarantine_list(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    rows = (db.query(WarehouseMovement.master_id, func.sum(WarehouseMovement.qty))
            .filter(WarehouseMovement.bucket == "quarantine")
            .group_by(WarehouseMovement.master_id).all())
    out = []
    for mid, qty in rows:
        if int(qty or 0) <= 0:
            continue
        m = db.query(WarehouseSku).get(mid)
        out.append({"master_id": mid, "sku_code": m.sku_code if m else "?",
                    "name": m.name if m else "", "size": m.size if m else "",
                    "qty": int(qty)})
    out.sort(key=lambda x: x["sku_code"])
    return out


class RestockIn(BaseModel):
    master_id: int
    rack_code: str
    qty: int


@router.post("/quarantine/restock")
def quarantine_restock(body: RestockIn, db: Session = Depends(get_db),
                       current_user: User = Depends(wh_admin)):
    q = quarantine_total(db, body.master_id)
    if body.qty <= 0:
        raise HTTPException(400, "Quantity must be at least 1")
    if body.qty > q:
        raise HTTPException(400, f"Only {q} in quarantine for this SKU")
    rn = norm(body.rack_code)
    rack = db.query(WarehouseRack).filter(WarehouseRack.normalized_code == rn).first()
    if not rack:
        rack = db.query(WarehouseRack).filter(WarehouseRack.barcode == body.rack_code.strip()).first()
    if not rack:
        raise HTTPException(404, f"Rack '{body.rack_code}' not found")
    db.add(WarehouseMovement(master_id=body.master_id, rack_id=None, bucket="quarantine",
                             qty=-body.qty, move_type="restock", source="manual",
                             created_by=current_user.id))
    db.add(WarehouseMovement(master_id=body.master_id, rack_id=rack.id, bucket="sellable",
                             qty=body.qty, move_type="restock", source="manual",
                             reference=f"Rack {rack.code}", created_by=current_user.id))
    db.commit()
    return {"ok": True, "restocked": body.qty, "rack_code": rack.code,
            "sellable_total_now": sellable_total(db, body.master_id),
            "quarantine_now": quarantine_total(db, body.master_id)}


class ScrapIn(BaseModel):
    master_id: int
    qty: int


@router.post("/quarantine/scrap")
def quarantine_scrap(body: ScrapIn, db: Session = Depends(get_db),
                     current_user: User = Depends(wh_admin)):
    q = quarantine_total(db, body.master_id)
    if body.qty <= 0 or body.qty > q:
        raise HTTPException(400, f"Only {q} in quarantine for this SKU")
    db.add(WarehouseMovement(master_id=body.master_id, rack_id=None, bucket="quarantine",
                             qty=-body.qty, move_type="scrap", source="manual",
                             created_by=current_user.id))
    db.commit()
    return {"ok": True, "scrapped": body.qty, "quarantine_now": quarantine_total(db, body.master_id)}


@router.get("/batches")
def list_batches(limit: int = 50, db: Session = Depends(get_db),
                 current_user: User = Depends(get_current_user)):
    rows = (db.query(WarehouseUploadBatch)
            .order_by(WarehouseUploadBatch.created_at.desc()).limit(limit).all())
    return [{
        "id": b.id, "marketplace": b.marketplace, "kind": b.kind, "filename": b.filename,
        "rows_total": b.rows_total, "rows_matched": b.rows_matched,
        "rows_unmatched": b.rows_unmatched, "units": b.units,
        "at": b.created_at.isoformat() if b.created_at else None,
    } for b in rows]

# ════════════════════════════════════════════════════════════════════════════
#  BARCODE LABELS  (Code 128 PNG + saved default label size)
# ════════════════════════════════════════════════════════════════════════════
LABEL_KEY = "wh_label_size"
DEFAULT_LABEL = {"width_mm": 50, "height_mm": 25}


def _barcode_png_datauri(data: str) -> str:
    from barcode import Code128
    from barcode.writer import ImageWriter
    buf = io.BytesIO()
    Code128(data, writer=ImageWriter()).write(buf, options={
        "write_text": False, "module_height": 14.0, "module_width": 0.33,
        "quiet_zone": 2.0, "dpi": 300,
    })
    return "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode()


class BarcodeReq(BaseModel):
    codes: List[str]


@router.post("/barcodes")
def make_barcodes(body: BarcodeReq, db: Session = Depends(get_db),
                  current_user: User = Depends(get_current_user)):
    """Return Code-128 PNG data-URIs for each code (deduped)."""
    out = {}
    for c in body.codes:
        c = (c or "").strip()
        if c and c not in out:
            try:
                out[c] = _barcode_png_datauri(c)
            except Exception:
                out[c] = ""
    return {"barcodes": out}


@router.get("/label-config")
def get_label_config(db: Session = Depends(get_db),
                     current_user: User = Depends(get_current_user)):
    row = db.query(AppSetting).filter_by(key=LABEL_KEY).first()
    if row and row.value:
        try:
            return json.loads(row.value)
        except ValueError:
            pass
    return DEFAULT_LABEL


class LabelConfig(BaseModel):
    width_mm: float
    height_mm: float


@router.put("/label-config")
def set_label_config(body: LabelConfig, db: Session = Depends(get_db),
                     current_user: User = Depends(wh_admin)):
    if body.width_mm <= 0 or body.height_mm <= 0:
        raise HTTPException(400, "Label width and height must be greater than 0")
    cfg = {"width_mm": round(body.width_mm, 1), "height_mm": round(body.height_mm, 1)}
    row = db.query(AppSetting).filter_by(key=LABEL_KEY).first()
    if row:
        row.value = json.dumps(cfg)
        row.updated_at = datetime.utcnow()
    else:
        db.add(AppSetting(key=LABEL_KEY, value=json.dumps(cfg)))
    db.commit()
    return cfg

# ════════════════════════════════════════════════════════════════════════════
#  PRODUCTION → WAREHOUSE  (packed bundles auto-inward, size-aware)
# ════════════════════════════════════════════════════════════════════════════
def suggest_master_id(db, design, size):
    """Best-effort: which master SKU is this design+size? Remembered choice first,
    else match design code inside the SKU code with the same size."""
    m = (db.query(WarehouseProductionMap)
         .filter_by(design_id=design.id, size=size).first())
    if m:
        master = db.query(WarehouseSku).get(m.master_id)
        if master:
            return master.id, master.sku_code
    dcode = norm(design.design_code or "")
    want = (size or "").upper()
    if dcode:
        for sku in db.query(WarehouseSku).all():
            if (sku.size or "").upper() == want and dcode and dcode in norm(sku.sku_code):
                return sku.id, sku.sku_code
    return None, None


@router.get("/production/pending")
def production_pending(db: Session = Depends(get_db),
                       current_user: User = Depends(wh_admin)):
    logs = (db.query(PackingLog).filter_by(inwarded=False)
            .order_by(PackingLog.packed_at.desc()).all())
    out = []
    for log in logs:
        bundle = db.query(Bundle).get(log.bundle_id) if log.bundle_id else None
        design = db.query(Design).get(log.design_id) if log.design_id else None
        if not design:
            continue
        try:
            sizes = json.loads(log.sizes_json) if log.sizes_json else {}
        except ValueError:
            sizes = {}
        lines = []
        for size, qty in sizes.items():
            mid, scode = suggest_master_id(db, design, size)
            lines.append({"size": size, "qty": int(qty),
                          "suggested_master_id": mid, "suggested_sku": scode})
        out.append({
            "packing_id": log.id, "bundle_id": log.bundle_id,
            "bundle_code": bundle.bundle_code if bundle else "—",
            "design_id": design.id, "design_code": design.design_code,
            "design_name": design.design_name, "carton_no": log.carton_no,
            "total_qty": log.total_qty,
            "packed_at": log.packed_at.isoformat() if log.packed_at else None,
            "lines": lines,
        })
    return out


class ProdLine(BaseModel):
    size: str
    master_id: int
    qty: int


class ProdInwardIn(BaseModel):
    packing_id: int
    rack_code: str
    lines: List[ProdLine]


@router.post("/production/inward")
def production_inward(body: ProdInwardIn, db: Session = Depends(get_db),
                      current_user: User = Depends(wh_admin)):
    log = db.query(PackingLog).get(body.packing_id)
    if not log:
        raise HTTPException(404, "Packing record not found")
    if log.inwarded:
        raise HTTPException(400, "This bundle is already in stock")
    rn = norm(body.rack_code)
    rack = db.query(WarehouseRack).filter(WarehouseRack.normalized_code == rn).first()
    if not rack:
        rack = db.query(WarehouseRack).filter(WarehouseRack.barcode == body.rack_code.strip()).first()
    if not rack:
        raise HTTPException(404, f"Rack '{body.rack_code}' not found")

    bundle = db.query(Bundle).get(log.bundle_id) if log.bundle_id else None
    ref = f"Production {bundle.bundle_code}" if bundle else "Production"
    units = 0
    for ln in body.lines:
        if ln.qty <= 0:
            continue
        master = db.query(WarehouseSku).get(ln.master_id)
        if not master:
            raise HTTPException(400, f"SKU for size {ln.size} not found — pick a valid SKU")
        db.add(WarehouseMovement(
            master_id=master.id, rack_id=rack.id, bucket="sellable", qty=ln.qty,
            move_type="inward", source="production", reference=ref,
            created_by=current_user.id))
        units += ln.qty
        # remember the mapping design+size → master
        existing = (db.query(WarehouseProductionMap)
                    .filter_by(design_id=log.design_id, size=ln.size).first())
        if existing:
            existing.master_id = master.id
        else:
            db.add(WarehouseProductionMap(design_id=log.design_id, size=ln.size,
                                          master_id=master.id))
    log.inwarded = True
    log.inwarded_at = datetime.utcnow()
    db.commit()
    return {"ok": True, "inwarded_units": units, "rack_code": rack.code}
from datetime import datetime
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from database import get_db
from models import (
    Dispatch, DispatchLine, ClientPO, ClientPOLine, Client,
    WarehouseSku, WarehouseMovement, User,
)
from auth import require_roles, get_current_user
from routes.warehouse import allocate_picks, sellable_total, resolve_master, norm

router = APIRouter(prefix="/dispatches", tags=["dispatch"])

editor = require_roles("admin", "warehouse")


def f(x):
    try:
        return float(x or 0)
    except (TypeError, ValueError):
        return 0.0


def parse_date(s):
    if not s:
        return None
    try:
        return datetime.fromisoformat(str(s)[:19])
    except ValueError:
        return None


def line_dict(ln):
    qty = int(ln.qty or 0)
    return {
        "id": ln.id, "po_line_id": ln.po_line_id, "master_id": ln.master_id,
        "sku_code": ln.sku_code or "", "item_code": ln.item_code or "",
        "description": ln.description or "", "colour": ln.colour or "",
        "size": ln.size or "", "qty": qty, "rate": f(ln.rate),
        "amount": round(qty * f(ln.rate), 2), "carton_no": ln.carton_no or "",
    }


def dispatch_dict(db, d, with_lines=True):
    po = db.query(ClientPO).get(d.po_id) if d.po_id else None
    client = db.query(Client).get(d.client_id) if d.client_id else None
    lines = [line_dict(l) for l in d.lines]
    total_qty = sum(l["qty"] for l in lines)
    total_amount = sum(l["amount"] for l in lines)
    out = {
        "id": d.id, "dispatch_no": d.dispatch_no or "", "status": d.status,
        "po_id": d.po_id, "po_number": po.po_number if po else "",
        "client_id": d.client_id, "client_name": client.name if client else "—",
        "dispatch_date": d.dispatch_date.isoformat() if d.dispatch_date else None,
        "transporter": d.transporter or "", "awb": d.awb or "",
        "box_count": int(d.box_count or 0), "ship_to": d.ship_to or "",
        "notes": d.notes or "", "total_qty": total_qty, "total_amount": round(total_amount, 2),
    }
    if with_lines:
        out["lines"] = lines
        out["client"] = {
            "name": client.name, "gstin": client.gstin or "",
            "courier_default": client.courier_default or "",
        } if client else None
    return out


@router.get("")
def list_dispatches(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    rows = db.query(Dispatch).order_by(Dispatch.created_at.desc()).all()
    return [dispatch_dict(db, d, with_lines=False) for d in rows]


@router.get("/prefill/{po_id}")
def prefill(po_id: int, db: Session = Depends(get_db), current_user: User = Depends(editor)):
    """Build dispatch lines from a PO's pending quantities, with suggested
    warehouse SKU + available stock per line."""
    po = db.query(ClientPO).get(po_id)
    if not po:
        raise HTTPException(404, "PO not found")
    client = db.query(Client).get(po.client_id) if po.client_id else None
    lines = []
    for pl in po.lines:
        pending = max(0, int(pl.qty or 0) - int(pl.dispatched_qty or 0))
        master = resolve_master(db, pl.item_code or "")
        mid = master.id if master else None
        avail = sellable_total(db, mid) if mid else 0
        lines.append({
            "po_line_id": pl.id, "item_code": pl.item_code or "",
            "description": pl.description or "", "colour": pl.colour or "",
            "size": pl.size or "", "ordered": int(pl.qty or 0),
            "dispatched": int(pl.dispatched_qty or 0), "pending": pending,
            "rate": f(pl.rate), "master_id": mid,
            "sku_code": master.sku_code if master else "",
            "available": avail,
        })
    return {
        "po_id": po.id, "po_number": po.po_number or "", "client_id": po.client_id,
        "client_name": client.name if client else "—",
        "ship_to": client.ship_to if client else "",
        "transporter": client.courier_default if client else "",
        "lines": lines,
    }


@router.get("/{did}")
def get_dispatch(did: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    d = db.query(Dispatch).get(did)
    if not d:
        raise HTTPException(404, "Dispatch not found")
    return dispatch_dict(db, d)


class DispLineIn(BaseModel):
    po_line_id: Optional[int] = None
    master_id: Optional[int] = None
    item_code: Optional[str] = ""
    description: Optional[str] = ""
    colour: Optional[str] = ""
    size: Optional[str] = ""
    qty: int = 0
    rate: float = 0
    carton_no: Optional[str] = ""


class DispIn(BaseModel):
    po_id: Optional[int] = None
    transporter: Optional[str] = ""
    awb: Optional[str] = ""
    box_count: int = 0
    ship_to: Optional[str] = ""
    dispatch_date: Optional[str] = None
    notes: Optional[str] = ""
    lines: List[DispLineIn] = []


def apply_dispatch(db, d, body):
    d.transporter = (body.transporter or "").strip()
    d.awb = (body.awb or "").strip()
    d.box_count = int(body.box_count or 0)
    d.ship_to = (body.ship_to or "").strip()
    d.dispatch_date = parse_date(body.dispatch_date) or d.dispatch_date or datetime.utcnow()
    d.notes = (body.notes or "").strip()
    for l in list(d.lines):
        db.delete(l)
    db.flush()
    for ln in body.lines:
        if int(ln.qty or 0) <= 0:
            continue
        master = db.query(WarehouseSku).get(ln.master_id) if ln.master_id else None
        db.add(DispatchLine(
            dispatch_id=d.id, po_line_id=ln.po_line_id, master_id=ln.master_id,
            sku_code=master.sku_code if master else "",
            item_code=(ln.item_code or "").strip(), description=(ln.description or "").strip(),
            colour=(ln.colour or "").strip(), size=(ln.size or "").strip(),
            qty=int(ln.qty or 0), rate=ln.rate, carton_no=(ln.carton_no or "").strip()))


@router.post("")
def create_dispatch(body: DispIn, db: Session = Depends(get_db), current_user: User = Depends(editor)):
    po = db.query(ClientPO).get(body.po_id) if body.po_id else None
    if body.po_id and not po:
        raise HTTPException(400, "PO not found")
    d = Dispatch(po_id=body.po_id, client_id=po.client_id if po else None,
                 status="draft", created_by=current_user.id, dispatch_date=datetime.utcnow())
    db.add(d)
    db.flush()
    d.dispatch_no = f"DSP-{d.id:04d}"
    apply_dispatch(db, d, body)
    db.commit()
    db.refresh(d)
    return dispatch_dict(db, d)


@router.put("/{did}")
def update_dispatch(did: int, body: DispIn, db: Session = Depends(get_db), current_user: User = Depends(editor)):
    d = db.query(Dispatch).get(did)
    if not d:
        raise HTTPException(404, "Dispatch not found")
    if d.status != "draft":
        raise HTTPException(400, "This dispatch is already dispatched and can't be edited")
    apply_dispatch(db, d, body)
    db.commit()
    db.refresh(d)
    return dispatch_dict(db, d)


@router.delete("/{did}")
def delete_dispatch(did: int, db: Session = Depends(get_db), current_user: User = Depends(editor)):
    d = db.query(Dispatch).get(did)
    if not d:
        raise HTTPException(404, "Dispatch not found")
    if d.status != "draft":
        raise HTTPException(400, "Can't delete a dispatch that has already shipped")
    db.delete(d)
    db.commit()
    return {"ok": True}


@router.post("/{did}/confirm")
def confirm_dispatch(did: int, db: Session = Depends(get_db), current_user: User = Depends(editor)):
    d = db.query(Dispatch).get(did)
    if not d:
        raise HTTPException(404, "Dispatch not found")
    if d.status != "draft":
        raise HTTPException(400, "Already dispatched")
    if not d.lines:
        raise HTTPException(400, "Add at least one line before dispatching")

    # 1) validate stock for every line first (all-or-nothing)
    need = {}
    for ln in d.lines:
        if not ln.master_id:
            raise HTTPException(400, f"Line '{ln.item_code or ln.size}' has no warehouse SKU chosen")
        need[ln.master_id] = need.get(ln.master_id, 0) + int(ln.qty or 0)
    for mid, qty in need.items():
        have = sellable_total(db, mid)
        if qty > have:
            sku = db.query(WarehouseSku).get(mid)
            raise HTTPException(400, f"Not enough stock for {sku.sku_code if sku else mid}: need {qty}, have {have}")

    # 2) deduct FIFO + advance PO dispatched quantities
    ref = d.dispatch_no or f"DSP-{d.id}"
    for ln in d.lines:
        plan, short = allocate_picks(db, ln.master_id, int(ln.qty or 0))
        if short > 0:
            raise HTTPException(400, f"Stock changed for {ln.sku_code}; please retry")
        for p in plan:
            db.add(WarehouseMovement(
                master_id=ln.master_id, rack_id=p["rack_id"], bucket="sellable",
                qty=-p["qty"], move_type="outward", source="dispatch",
                reference=ref, created_by=current_user.id))
        if ln.po_line_id:
            pl = db.query(ClientPOLine).get(ln.po_line_id)
            if pl:
                pl.dispatched_qty = int(pl.dispatched_qty or 0) + int(ln.qty or 0)

    d.status = "dispatched"

    # 3) recompute the PO status
    if d.po_id:
        po = db.query(ClientPO).get(d.po_id)
        if po and po.status not in ("cancelled",):
            total = sum(int(l.qty or 0) for l in po.lines)
            disp = sum(int(l.dispatched_qty or 0) for l in po.lines)
            po.status = "closed" if disp >= total and total > 0 else ("part_shipped" if disp > 0 else "open")

    db.commit()
    db.refresh(d)
    return dispatch_dict(db, d)
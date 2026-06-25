import json
from datetime import datetime
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from database import get_db
from models import (
    Quotation, QuotationFabricRate, QuotationItem, Design,
    DesignCostSheet, DesignCostItem, User,
)
from auth import require_roles, get_current_user
from routes.costing import compute, f

router = APIRouter(prefix="/quotations", tags=["quotations"])

editor = require_roles("designer", "admin")


def quote_payload(q: Quotation):
    items = [{"category": it.category, "label": it.label, "cost_per_piece": f(it.cost_per_piece)} for it in q.items]
    computed = compute(q.metres_per_piece, q.fabric_rate, q.stitch_cost,
                       q.wastage_pct, q.margin_pct, q.quoted_price, items)
    return {
        "id": q.id, "client_name": q.client_name or "", "style_ref": q.style_ref or "",
        "quote_date": q.quote_date.isoformat() if q.quote_date else None,
        "status": q.status, "description": q.description or "",
        "metres_per_piece": f(q.metres_per_piece), "fabric_rate": f(q.fabric_rate),
        "chosen_vendor": q.chosen_vendor or "",
        "stitch_cost": f(q.stitch_cost), "wastage_pct": f(q.wastage_pct),
        "margin_pct": f(q.margin_pct), "quoted_price": f(q.quoted_price),
        "notes": q.notes or "",
        "fabric_rates": [{"vendor_name": r.vendor_name or "", "rate": f(r.rate)} for r in q.fabric_rates],
        "items": items,
        "converted_design_id": q.converted_design_id,
        "computed": computed,
    }


class FabRate(BaseModel):
    vendor_name: Optional[str] = ""
    rate: float = 0


class QItem(BaseModel):
    category: str = "other"
    label: Optional[str] = ""
    cost_per_piece: float = 0


class QuoteIn(BaseModel):
    client_name: Optional[str] = ""
    style_ref: Optional[str] = ""
    quote_date: Optional[str] = None
    status: Optional[str] = "draft"
    description: Optional[str] = ""
    metres_per_piece: float = 0
    fabric_rate: float = 0
    chosen_vendor: Optional[str] = ""
    stitch_cost: float = 0
    wastage_pct: float = 0
    margin_pct: float = 0
    quoted_price: float = 0
    notes: Optional[str] = ""
    fabric_rates: List[FabRate] = []
    items: List[QItem] = []


def apply_quote(q: Quotation, body: QuoteIn, db):
    q.client_name = (body.client_name or "").strip()
    q.style_ref = (body.style_ref or "").strip()
    if body.quote_date:
        try:
            q.quote_date = datetime.fromisoformat(body.quote_date[:19])
        except ValueError:
            pass
    q.status = (body.status or "draft").lower()
    q.description = (body.description or "").strip()
    q.metres_per_piece = body.metres_per_piece
    q.fabric_rate = body.fabric_rate
    q.chosen_vendor = (body.chosen_vendor or "").strip()
    q.stitch_cost = body.stitch_cost
    q.wastage_pct = body.wastage_pct
    q.margin_pct = body.margin_pct
    q.quoted_price = body.quoted_price
    q.notes = (body.notes or "").strip()
    q.updated_at = datetime.utcnow()
    for old in list(q.fabric_rates):
        db.delete(old)
    for old in list(q.items):
        db.delete(old)
    db.flush()
    for r in body.fabric_rates:
        if (r.vendor_name or "").strip() or r.rate:
            db.add(QuotationFabricRate(quotation_id=q.id, vendor_name=(r.vendor_name or "").strip(), rate=r.rate))
    for it in body.items:
        db.add(QuotationItem(quotation_id=q.id, category=(it.category or "other").lower(),
                             label=(it.label or "").strip(), cost_per_piece=it.cost_per_piece))


@router.get("")
def list_quotes(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    rows = db.query(Quotation).order_by(Quotation.created_at.desc()).all()
    out = []
    for q in rows:
        p = quote_payload(q)
        out.append({
            "id": q.id, "client_name": p["client_name"], "style_ref": p["style_ref"],
            "quote_date": p["quote_date"], "status": q.status, "description": p["description"],
            "total_cost": p["computed"]["total_cost"],
            "suggested_price": p["computed"]["suggested_price"],
            "quoted_price": p["quoted_price"],
            "converted": bool(q.converted_design_id),
        })
    return out


@router.get("/clients")
def clients(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    rows = db.query(Quotation.client_name).distinct().all()
    return sorted({(r[0] or "").strip() for r in rows if (r[0] or "").strip()})


@router.get("/{qid}")
def get_quote(qid: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    q = db.query(Quotation).get(qid)
    if not q:
        raise HTTPException(404, "Quotation not found")
    return quote_payload(q)


@router.post("")
def create_quote(body: QuoteIn, db: Session = Depends(get_db), current_user: User = Depends(editor)):
    q = Quotation(created_by=current_user.id)
    db.add(q)
    db.flush()
    apply_quote(q, body, db)
    db.commit()
    db.refresh(q)
    return quote_payload(q)


@router.put("/{qid}")
def update_quote(qid: int, body: QuoteIn, db: Session = Depends(get_db), current_user: User = Depends(editor)):
    q = db.query(Quotation).get(qid)
    if not q:
        raise HTTPException(404, "Quotation not found")
    apply_quote(q, body, db)
    db.commit()
    db.refresh(q)
    return quote_payload(q)


@router.delete("/{qid}")
def delete_quote(qid: int, db: Session = Depends(get_db), current_user: User = Depends(editor)):
    q = db.query(Quotation).get(qid)
    if not q:
        raise HTTPException(404, "Quotation not found")
    db.delete(q)
    db.commit()
    return {"ok": True}


class ConvertIn(BaseModel):
    target_qty: int = 0


@router.post("/{qid}/convert")
def convert_quote(qid: int, body: ConvertIn, db: Session = Depends(get_db), current_user: User = Depends(editor)):
    q = db.query(Quotation).get(qid)
    if not q:
        raise HTTPException(404, "Quotation not found")
    if q.converted_design_id:
        raise HTTPException(400, "This quotation is already linked to a design")
    code = (q.style_ref or "").strip()
    if not code:
        raise HTTPException(400, "Add a style reference before converting to a design")
    if db.query(Design).filter(Design.design_code == code).first():
        raise HTTPException(400, f"A design with code '{code}' already exists — change the style reference")
    name = (q.description or "").strip() or (f"{q.client_name} {code}".strip()) or code
    design = Design(created_by=current_user.id, design_name=name[:200], design_code=code,
                    stitch_rate=int(round(f(q.stitch_cost))), target_qty=int(body.target_qty or 0),
                    metres_per_piece=q.metres_per_piece)
    db.add(design)
    db.flush()
    # carry the costing over into a design cost sheet
    sheet = DesignCostSheet(design_id=design.id, metres_per_piece=q.metres_per_piece,
                            fabric_rate=q.fabric_rate, stitch_cost=q.stitch_cost,
                            wastage_pct=q.wastage_pct, margin_pct=q.margin_pct,
                            selling_price=q.quoted_price, notes=q.notes,
                            updated_by=current_user.id, updated_at=datetime.utcnow())
    db.add(sheet)
    db.flush()
    for it in q.items:
        db.add(DesignCostItem(cost_sheet_id=sheet.id, category=it.category,
                              label=it.label, cost_per_piece=it.cost_per_piece))
    q.converted_design_id = design.id
    if q.status not in ("approved",):
        q.status = "approved"
    db.commit()
    return {"ok": True, "design_id": design.id, "design_code": code}
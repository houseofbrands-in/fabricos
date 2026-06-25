import json
from datetime import datetime
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from database import get_db
from models import (
    Design, Fabric, FabricIntake, DesignCostSheet, DesignCostItem,
    DesignCostVersion, User,
)
from auth import require_roles, get_current_user

router = APIRouter(prefix="/designs", tags=["costing"])

editor = require_roles("designer", "admin")


def f(x):
    try:
        return float(x or 0)
    except (TypeError, ValueError):
        return 0.0


def latest_fabric_rate(db, fabric_id):
    if not fabric_id:
        return 0.0
    row = (db.query(FabricIntake)
           .filter(FabricIntake.fabric_id == fabric_id)
           .order_by(FabricIntake.intake_date.desc()).first())
    return f(row.cost_per_metre) if row else 0.0


def compute(mpp, fabric_rate, stitch, wastage_pct, margin_pct, selling_price, items):
    fabric_cost = f(mpp) * f(fabric_rate)
    stitch_cost = f(stitch)
    by_cat = {"jobwork": 0.0, "trim": 0.0, "other": 0.0}
    for it in items:
        c = (it.get("category") or "other").lower()
        if c not in by_cat:
            c = "other"
        by_cat[c] += f(it.get("cost_per_piece"))
    items_total = sum(by_cat.values())
    subtotal = fabric_cost + stitch_cost + items_total
    wastage_amt = subtotal * f(wastage_pct) / 100.0
    total_cost = subtotal + wastage_amt

    mp = f(margin_pct)
    suggested_price = round(total_cost / (1 - mp / 100.0), 2) if 0 < mp < 100 else None
    sp = f(selling_price)
    actual_margin_pct = round((sp - total_cost) / sp * 100.0, 2) if sp > 0 else None
    profit = round(sp - total_cost, 2) if sp > 0 else None

    return {
        "fabric_cost": round(fabric_cost, 2),
        "stitch_cost": round(stitch_cost, 2),
        "jobwork_total": round(by_cat["jobwork"], 2),
        "trim_total": round(by_cat["trim"], 2),
        "other_total": round(by_cat["other"], 2),
        "items_total": round(items_total, 2),
        "subtotal": round(subtotal, 2),
        "wastage_amount": round(wastage_amt, 2),
        "total_cost": round(total_cost, 2),
        "suggested_price": suggested_price,
        "actual_margin_pct": actual_margin_pct,
        "profit": profit,
    }


def items_payload(sheet):
    return [{"id": it.id, "category": it.category, "label": it.label,
             "cost_per_piece": f(it.cost_per_piece)} for it in sheet.items]


def sheet_payload(db, design, sheet):
    if sheet:
        items = items_payload(sheet)
        data = {
            "exists": True,
            "metres_per_piece": f(sheet.metres_per_piece),
            "fabric_rate": f(sheet.fabric_rate),
            "stitch_cost": f(sheet.stitch_cost),
            "wastage_pct": f(sheet.wastage_pct),
            "margin_pct": f(sheet.margin_pct),
            "selling_price": f(sheet.selling_price),
            "notes": sheet.notes or "",
            "items": items,
            "updated_at": sheet.updated_at.isoformat() if sheet.updated_at else None,
        }
    else:
        # prefilled defaults from the design itself
        data = {
            "exists": False,
            "metres_per_piece": f(design.metres_per_piece),
            "fabric_rate": latest_fabric_rate(db, design.fabric_id),
            "stitch_cost": f(design.stitch_rate),
            "wastage_pct": 0.0, "margin_pct": 0.0, "selling_price": 0.0,
            "notes": "", "items": [], "updated_at": None,
        }
    data["computed"] = compute(data["metres_per_piece"], data["fabric_rate"],
                               data["stitch_cost"], data["wastage_pct"],
                               data["margin_pct"], data["selling_price"], data["items"])
    data["design"] = {"id": design.id, "design_code": design.design_code,
                      "design_name": design.design_name,
                      "fabric_name": design.fabric.fabric_name if design.fabric else None,
                      "suggested_fabric_rate": latest_fabric_rate(db, design.fabric_id)}
    data["version_count"] = db.query(DesignCostVersion).filter_by(design_id=design.id).count()
    return data


@router.get("/{design_id}/costsheet")
def get_costsheet(design_id: int, db: Session = Depends(get_db),
                  current_user: User = Depends(get_current_user)):
    design = db.query(Design).get(design_id)
    if not design:
        raise HTTPException(404, "Design not found")
    sheet = db.query(DesignCostSheet).filter_by(design_id=design_id).first()
    return sheet_payload(db, design, sheet)


class ItemIn(BaseModel):
    category: str = "other"
    label: Optional[str] = ""
    cost_per_piece: float = 0


class SheetIn(BaseModel):
    metres_per_piece: float = 0
    fabric_rate: float = 0
    stitch_cost: float = 0
    wastage_pct: float = 0
    margin_pct: float = 0
    selling_price: float = 0
    notes: Optional[str] = ""
    items: List[ItemIn] = []


@router.put("/{design_id}/costsheet")
def save_costsheet(design_id: int, body: SheetIn, db: Session = Depends(get_db),
                   current_user: User = Depends(editor)):
    design = db.query(Design).get(design_id)
    if not design:
        raise HTTPException(404, "Design not found")
    sheet = db.query(DesignCostSheet).filter_by(design_id=design_id).first()
    if not sheet:
        sheet = DesignCostSheet(design_id=design_id)
        db.add(sheet)
    sheet.metres_per_piece = body.metres_per_piece
    sheet.fabric_rate = body.fabric_rate
    sheet.stitch_cost = body.stitch_cost
    sheet.wastage_pct = body.wastage_pct
    sheet.margin_pct = body.margin_pct
    sheet.selling_price = body.selling_price
    sheet.notes = (body.notes or "").strip()
    sheet.updated_by = current_user.id
    sheet.updated_at = datetime.utcnow()
    # replace items
    for old in list(sheet.items):
        db.delete(old)
    db.flush()
    for it in body.items:
        db.add(DesignCostItem(cost_sheet_id=sheet.id,
                              category=(it.category or "other").lower(),
                              label=(it.label or "").strip(),
                              cost_per_piece=it.cost_per_piece))
    db.commit()
    db.refresh(sheet)
    return sheet_payload(db, design, sheet)


@router.post("/{design_id}/costsheet/version")
def save_version(design_id: int, db: Session = Depends(get_db),
                 current_user: User = Depends(editor)):
    design = db.query(Design).get(design_id)
    if not design:
        raise HTTPException(404, "Design not found")
    sheet = db.query(DesignCostSheet).filter_by(design_id=design_id).first()
    if not sheet:
        raise HTTPException(400, "Save the cost sheet before snapshotting a version")
    payload = sheet_payload(db, design, sheet)
    last = (db.query(DesignCostVersion).filter_by(design_id=design_id)
            .order_by(DesignCostVersion.version.desc()).first())
    version = (last.version + 1) if last else 1
    snap = DesignCostVersion(
        design_id=design_id, version=version,
        snapshot_json=json.dumps(payload),
        total_cost=payload["computed"]["total_cost"],
        selling_price=f(sheet.selling_price), margin_pct=f(sheet.margin_pct),
        created_by=current_user.id)
    db.add(snap)
    db.commit()
    return {"ok": True, "version": version}


@router.get("/{design_id}/costsheet/versions")
def list_versions(design_id: int, db: Session = Depends(get_db),
                  current_user: User = Depends(get_current_user)):
    rows = (db.query(DesignCostVersion).filter_by(design_id=design_id)
            .order_by(DesignCostVersion.version.desc()).all())
    out = []
    for v in rows:
        u = db.query(User).get(v.created_by) if v.created_by else None
        try:
            snap = json.loads(v.snapshot_json) if v.snapshot_json else None
        except ValueError:
            snap = None
        out.append({
            "version": v.version, "total_cost": f(v.total_cost),
            "selling_price": f(v.selling_price), "margin_pct": f(v.margin_pct),
            "by": u.name if u else "—",
            "at": v.created_at.isoformat() if v.created_at else None,
            "snapshot": snap,
        })
    return out
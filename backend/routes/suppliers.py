from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import func
from sqlalchemy.orm import Session
from database import get_db
from models import (
    Supplier, PurchaseBill, FabricIntake, DefectiveFabric, JobWork, Fabric, User,
)
from auth import require_roles, get_current_user

router = APIRouter(prefix="/suppliers", tags=["suppliers"])

store_admin = require_roles("store", "admin")
admin_only = require_roles("admin")


class SupplierIn(BaseModel):
    name: str
    phone: Optional[str] = ""
    gst: Optional[str] = ""
    city: Optional[str] = ""
    contact_person: Optional[str] = ""
    notes: Optional[str] = ""
    kind: str = "fabric"            # fabric | jobwork | both


def _dict(s):
    return {
        "id": s.id, "name": s.name, "phone": s.phone, "gst": s.gst,
        "city": s.city, "contact_person": s.contact_person,
        "notes": s.notes, "kind": s.kind,
    }


@router.get("/")
def list_suppliers(
    kind: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    rows = db.query(Supplier).order_by(Supplier.name).all()
    out = []
    for s in rows:
        if kind and kind not in (s.kind, "both") and s.kind != "both":
            # filter: when asking for 'fabric', include fabric + both; same for jobwork
            if not (s.kind == kind or s.kind == "both"):
                continue
        out.append(_dict(s))
    return out


@router.post("/")
def create_supplier(
    body: SupplierIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(store_admin),
):
    name = body.name.strip()
    if not name:
        raise HTTPException(400, "Name is required")
    # case-insensitive duplicate guard
    exists = db.query(Supplier).filter(func.lower(Supplier.name) == name.lower()).first()
    if exists:
        raise HTTPException(400, f"'{exists.name}' already exists in the supplier list")
    if body.kind not in ("fabric", "jobwork", "both"):
        raise HTTPException(400, "kind must be fabric | jobwork | both")
    s = Supplier(
        name=name, phone=(body.phone or "").strip(), gst=(body.gst or "").strip(),
        city=(body.city or "").strip(), contact_person=(body.contact_person or "").strip(),
        notes=(body.notes or "").strip(), kind=body.kind,
    )
    db.add(s)
    db.commit()
    db.refresh(s)
    return _dict(s)


@router.patch("/{sid}")
def update_supplier(
    sid: int,
    body: SupplierIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(store_admin),
):
    s = db.query(Supplier).get(sid)
    if not s:
        raise HTTPException(404, "Supplier not found")
    name = body.name.strip()
    clash = (
        db.query(Supplier)
        .filter(func.lower(Supplier.name) == name.lower(), Supplier.id != sid)
        .first()
    )
    if clash:
        raise HTTPException(400, f"'{clash.name}' already exists")
    s.name = name
    s.phone = (body.phone or "").strip()
    s.gst = (body.gst or "").strip()
    s.city = (body.city or "").strip()
    s.contact_person = (body.contact_person or "").strip()
    s.notes = (body.notes or "").strip()
    if body.kind in ("fabric", "jobwork", "both"):
        s.kind = body.kind
    db.commit()
    return _dict(s)


@router.get("/{sid}")
def supplier_detail(
    sid: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    s = db.query(Supplier).get(sid)
    if not s:
        raise HTTPException(404, "Supplier not found")

    bills = (
        db.query(PurchaseBill)
        .filter(PurchaseBill.supplier_id == sid)
        .order_by(PurchaseBill.purchase_date.desc())
        .all()
    )
    total_purchased = 0.0
    recent_bills = []
    for b in bills:
        bill_total = sum(float(l.total_cost or 0) for l in b.lots)
        total_purchased += bill_total
        recent_bills.append({
            "id": b.id,
            "invoice_number": b.invoice_number,
            "purchase_date": b.purchase_date.isoformat() if b.purchase_date else None,
            "total_cost": round(bill_total, 2),
            "lots": len(b.lots),
        })

    total_debited = (
        db.query(func.coalesce(func.sum(DefectiveFabric.amount_debited), 0))
        .join(FabricIntake, DefectiveFabric.fabric_intake_id == FabricIntake.id)
        .join(PurchaseBill, FabricIntake.purchase_bill_id == PurchaseBill.id)
        .filter(PurchaseBill.supplier_id == sid)
        .scalar()
    ) or 0

    jobworks = (
        db.query(JobWork)
        .filter(JobWork.vendor_id == sid)
        .order_by(JobWork.created_at.desc())
        .all()
    )
    jw_metres = sum(float(j.metres_sent or 0) for j in jobworks)
    jw_shrink = sum(float(j.shrinkage_metres or 0) for j in jobworks if j.status == "returned")

    return {
        **_dict(s),
        "total_bills": len(bills),
        "total_purchased": round(total_purchased, 2),
        "total_debited": round(float(total_debited), 2),
        "recent_bills": recent_bills[:10],
        "jobwork_count": len(jobworks),
        "jobwork_metres_sent": round(jw_metres, 2),
        "jobwork_shrinkage": round(jw_shrink, 2),
    }


@router.delete("/{sid}")
def delete_supplier(
    sid: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(admin_only),
):
    s = db.query(Supplier).get(sid)
    if not s:
        raise HTTPException(404, "Supplier not found")
    # Detach references but keep the name snapshots on bills/job work intact.
    db.query(Fabric).filter_by(supplier_id=sid).update({Fabric.supplier_id: None})
    db.query(PurchaseBill).filter_by(supplier_id=sid).update({PurchaseBill.supplier_id: None})
    db.query(JobWork).filter_by(vendor_id=sid).update({JobWork.vendor_id: None})
    db.delete(s)
    db.commit()
    return {"ok": True}

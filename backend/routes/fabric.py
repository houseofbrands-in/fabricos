import json
from datetime import datetime
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from database import get_db
from models import (
    Fabric, FabricIntake, FabricQC, JobWork, FabricConsumption,
    PurchaseBill, DefectiveFabric, FabricStageHistory, Design, User,
)
from auth import require_roles, get_current_user
from fabric_utils import fabric_live_stock, fabric_stock_breakdown, log_fabric_event

router = APIRouter(prefix="/fabric", tags=["fabric"])

store_admin = require_roles("store", "admin")


def _f(v):
    return float(v) if v is not None else None


def _next_lot_code(db, intake):
    """Readable, unique lot code derived from the row id once it's flushed."""
    return f"LOT-{intake.id:05d}"


# ════════════════════════════════════════════════════════════════════════════
#  FABRIC MASTER
# ════════════════════════════════════════════════════════════════════════════
class FabricIn(BaseModel):
    fabric_name: str
    fabric_type: str
    composition: Optional[str] = ""
    supplier_name: Optional[str] = ""
    low_stock_threshold: float = 0


class FabricBulkIn(BaseModel):
    fabrics: List[FabricIn]


@router.get("/")
def list_fabrics(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    fabrics = db.query(Fabric).order_by(Fabric.fabric_name).all()
    out = []
    for fb in fabrics:
        bd = fabric_stock_breakdown(db, fb.id)
        threshold = float(fb.low_stock_threshold or 0)
        out.append({
            "id": fb.id,
            "fabric_name": fb.fabric_name,
            "fabric_type": fb.fabric_type,
            "composition": fb.composition,
            "supplier_name": fb.supplier_name,
            "low_stock_threshold": threshold,
            "available": bd["available"],
            "low_stock": bd["available"] < threshold,
            **bd,
        })
    return out


@router.post("/")
def create_fabric(
    body: FabricIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(store_admin),
):
    if body.fabric_type not in ("grey", "dyed"):
        raise HTTPException(400, "fabric_type must be 'grey' or 'dyed'")
    fb = Fabric(
        fabric_name=body.fabric_name.strip(),
        fabric_type=body.fabric_type,
        composition=(body.composition or "").strip(),
        supplier_name=(body.supplier_name or "").strip(),
        low_stock_threshold=body.low_stock_threshold or 0,
    )
    db.add(fb)
    db.commit()
    db.refresh(fb)
    return {"id": fb.id, "fabric_name": fb.fabric_name}


@router.post("/bulk")
def create_fabrics_bulk(
    body: FabricBulkIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(store_admin),
):
    """Add several fabrics to the master in one go."""
    created = []
    for f in body.fabrics:
        if not f.fabric_name.strip():
            continue
        if f.fabric_type not in ("grey", "dyed"):
            raise HTTPException(400, f"'{f.fabric_name}': type must be grey or dyed")
        fb = Fabric(
            fabric_name=f.fabric_name.strip(),
            fabric_type=f.fabric_type,
            composition=(f.composition or "").strip(),
            supplier_name=(f.supplier_name or "").strip(),
            low_stock_threshold=f.low_stock_threshold or 0,
        )
        db.add(fb)
        created.append(fb)
    db.commit()
    return {"created": len(created)}


@router.get("/stock")
def stock_summary(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    fabrics = db.query(Fabric).order_by(Fabric.fabric_name).all()
    rows, low = [], []
    for fb in fabrics:
        avail = fabric_live_stock(db, fb.id)
        threshold = float(fb.low_stock_threshold or 0)
        row = {"id": fb.id, "fabric_name": fb.fabric_name,
               "available": avail, "threshold": threshold,
               "low_stock": avail < threshold}
        rows.append(row)
        if avail < threshold:
            low.append(row)
    return {"fabrics": rows, "low_stock": low, "low_stock_count": len(low)}


# ════════════════════════════════════════════════════════════════════════════
#  PURCHASE BILL (multiple fabrics in one entry)
# ════════════════════════════════════════════════════════════════════════════
class PurchaseLine(BaseModel):
    fabric_id: int
    metres_received: float
    num_rolls: int = 0
    cost_per_metre: float = 0
    notes: Optional[str] = ""


class PurchaseIn(BaseModel):
    supplier_name: str
    invoice_number: Optional[str] = ""
    notes: Optional[str] = ""
    lines: List[PurchaseLine]


@router.post("/purchase")
def create_purchase(
    body: PurchaseIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(store_admin),
):
    if not body.lines:
        raise HTTPException(400, "Add at least one fabric line")
    for ln in body.lines:
        if not db.query(Fabric).get(ln.fabric_id):
            raise HTTPException(404, f"Fabric {ln.fabric_id} not found")
        if ln.metres_received <= 0:
            raise HTTPException(400, "Each line needs metres greater than 0")

    bill = PurchaseBill(
        supplier_name=body.supplier_name.strip(),
        invoice_number=(body.invoice_number or "").strip(),
        notes=(body.notes or "").strip(),
        created_by=current_user.id,
    )
    db.add(bill)
    db.flush()  # get bill.id

    lots = []
    for ln in body.lines:
        intake = FabricIntake(
            fabric_id=ln.fabric_id,
            purchase_bill_id=bill.id,
            lot_code="PENDING",
            metres_received=ln.metres_received,
            num_rolls=ln.num_rolls or 0,
            cost_per_metre=ln.cost_per_metre or 0,
            total_cost=round((ln.metres_received or 0) * (ln.cost_per_metre or 0), 2),
            notes=(ln.notes or "").strip(),
        )
        db.add(intake)
        db.flush()
        intake.lot_code = _next_lot_code(db, intake)
        log_fabric_event(db, ln.fabric_id, "received",
                         detail=f"Lot {intake.lot_code} · {ln.metres_received} m · {bill.supplier_name}"
                         + (f" · Inv {bill.invoice_number}" if bill.invoice_number else ""),
                         intake_id=intake.id, metres=ln.metres_received, user_id=current_user.id)
        lots.append(intake)

    db.commit()
    total = sum(float(l.total_cost or 0) for l in lots)
    return {
        "bill_id": bill.id,
        "lots_created": len(lots),
        "lot_codes": [l.lot_code for l in lots],
        "total_cost": round(total, 2),
    }


@router.get("/purchase/list")
def list_purchases(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    bills = db.query(PurchaseBill).order_by(PurchaseBill.purchase_date.desc()).all()
    out = []
    for b in bills:
        lines = [{
            "lot_code": l.lot_code,
            "fabric_name": l.fabric.fabric_name if l.fabric else None,
            "metres_received": _f(l.metres_received),
            "num_rolls": l.num_rolls,
            "cost_per_metre": _f(l.cost_per_metre),
            "total_cost": _f(l.total_cost),
            "qc_done": l.qc is not None,
        } for l in b.lots]
        out.append({
            "id": b.id,
            "supplier_name": b.supplier_name,
            "invoice_number": b.invoice_number,
            "purchase_date": b.purchase_date.isoformat() if b.purchase_date else None,
            "notes": b.notes,
            "lines": lines,
            "total_cost": round(sum(float(l.total_cost or 0) for l in b.lots), 2),
        })
    return out


# ── single intake kept for backward compatibility ──────────────────────────
class IntakeIn(BaseModel):
    fabric_id: int
    lot_code: str
    metres_received: float
    num_rolls: int = 0
    cost_per_metre: float = 0
    notes: Optional[str] = ""


@router.post("/intake")
def create_intake(
    body: IntakeIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(store_admin),
):
    if not db.query(Fabric).get(body.fabric_id):
        raise HTTPException(404, "Fabric not found")
    code = body.lot_code.strip().upper()
    if db.query(FabricIntake).filter_by(lot_code=code).first():
        raise HTTPException(400, "Lot code already exists")
    if body.metres_received <= 0:
        raise HTTPException(400, "Metres received must be greater than 0")
    intake = FabricIntake(
        fabric_id=body.fabric_id,
        lot_code=code,
        metres_received=body.metres_received,
        num_rolls=body.num_rolls or 0,
        cost_per_metre=body.cost_per_metre or 0,
        total_cost=round((body.metres_received or 0) * (body.cost_per_metre or 0), 2),
        notes=(body.notes or "").strip(),
    )
    db.add(intake)
    db.flush()
    log_fabric_event(db, body.fabric_id, "received",
                     detail=f"Lot {code} · {body.metres_received} m",
                     intake_id=intake.id, metres=body.metres_received, user_id=current_user.id)
    db.commit()
    db.refresh(intake)
    return {"id": intake.id, "lot_code": intake.lot_code, "total_cost": _f(intake.total_cost)}


@router.get("/intake/list")
def list_intakes(
    fabric_id: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    q = db.query(FabricIntake)
    if fabric_id:
        q = q.filter_by(fabric_id=fabric_id)
    intakes = q.order_by(FabricIntake.intake_date.desc()).all()
    return [{
        "id": it.id,
        "fabric_id": it.fabric_id,
        "fabric_name": it.fabric.fabric_name if it.fabric else None,
        "lot_code": it.lot_code,
        "intake_date": it.intake_date.isoformat() if it.intake_date else None,
        "metres_received": _f(it.metres_received),
        "num_rolls": it.num_rolls,
        "cost_per_metre": _f(it.cost_per_metre),
        "total_cost": _f(it.total_cost),
        "invoice_number": it.bill.invoice_number if it.bill else None,
        "supplier_name": it.bill.supplier_name if it.bill else it.fabric.supplier_name if it.fabric else None,
        "qc_done": it.qc is not None,
        "qc_result": it.qc.result if it.qc else None,
        "metres_accepted": _f(it.qc.metres_accepted) if it.qc else None,
        "notes": it.notes,
    } for it in intakes]


# ════════════════════════════════════════════════════════════════════════════
#  FABRIC QC  (rejected metres open a defective-register row)
# ════════════════════════════════════════════════════════════════════════════
class FabricQCIn(BaseModel):
    fabric_intake_id: int
    metres_accepted: float
    metres_rejected: float = 0
    defect_types: List[str] = []
    notes: Optional[str] = ""


@router.get("/qc/pending")
def qc_pending(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    intakes = (
        db.query(FabricIntake)
        .filter(~FabricIntake.id.in_(db.query(FabricQC.fabric_intake_id)))
        .order_by(FabricIntake.intake_date.desc())
        .all()
    )
    return [{
        "id": it.id,
        "fabric_name": it.fabric.fabric_name if it.fabric else None,
        "lot_code": it.lot_code,
        "metres_received": _f(it.metres_received),
        "num_rolls": it.num_rolls,
        "intake_date": it.intake_date.isoformat() if it.intake_date else None,
    } for it in intakes]


@router.post("/qc")
def submit_fabric_qc(
    body: FabricQCIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(store_admin),
):
    intake = db.query(FabricIntake).get(body.fabric_intake_id)
    if not intake:
        raise HTTPException(404, "Intake not found")
    if intake.qc is not None:
        raise HTTPException(400, "This lot has already been QC'd")

    accepted = max(0.0, body.metres_accepted or 0)
    rejected = max(0.0, body.metres_rejected or 0)
    if accepted == 0 and rejected == 0:
        raise HTTPException(400, "Enter accepted and/or rejected metres")

    result = "accept" if rejected == 0 else "reject" if accepted == 0 else "partial"

    qc = FabricQC(
        fabric_intake_id=intake.id,
        qc_by=current_user.id,
        metres_checked=accepted + rejected,
        metres_accepted=accepted,
        metres_rejected=rejected,
        result=result,
        defect_types=json.dumps(body.defect_types or []),
        notes=(body.notes or "").strip(),
    )
    db.add(qc)
    log_fabric_event(db, intake.fabric_id, "qc",
                     detail=f"{result} · accepted {accepted} m, rejected {rejected} m",
                     intake_id=intake.id, metres=accepted, user_id=current_user.id)

    # Rejected metres open a defective-register entry to be decided later.
    if rejected > 0:
        db.add(DefectiveFabric(
            fabric_id=intake.fabric_id,
            fabric_intake_id=intake.id,
            metres_rejected=rejected,
            defect_types=json.dumps(body.defect_types or []),
            decision="pending",
            status="open",
            notes="",
        ))
        log_fabric_event(db, intake.fabric_id, "defective_open",
                         detail=f"{rejected} m rejected on {intake.lot_code} — awaiting decision",
                         intake_id=intake.id, metres=rejected, user_id=current_user.id)

    db.commit()
    return {"ok": True, "result": result, "metres_accepted": accepted,
            "defective_opened": rejected > 0}


# ════════════════════════════════════════════════════════════════════════════
#  DEFECTIVE REGISTER
# ════════════════════════════════════════════════════════════════════════════
class DefectiveResolve(BaseModel):
    decision: str                       # return | replacement | downgrade | scrap
    amount_debited: Optional[float] = None
    replacement_intake_id: Optional[int] = None
    notes: Optional[str] = ""


@router.get("/defective")
def list_defective(
    status: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    q = db.query(DefectiveFabric)
    if status:
        q = q.filter_by(status=status)
    rows = q.order_by(DefectiveFabric.opened_at.desc()).all()
    out = []
    for d in rows:
        out.append({
            "id": d.id,
            "fabric_id": d.fabric_id,
            "fabric_name": d.fabric.fabric_name if d.fabric else None,
            "lot_code": d.intake.lot_code if d.intake else None,
            "metres_rejected": _f(d.metres_rejected),
            "defect_types": json.loads(d.defect_types) if d.defect_types else [],
            "decision": d.decision,
            "amount_debited": _f(d.amount_debited),
            "replacement_intake_id": d.replacement_intake_id,
            "status": d.status,
            "notes": d.notes,
            "opened_at": d.opened_at.isoformat() if d.opened_at else None,
            "resolved_at": d.resolved_at.isoformat() if d.resolved_at else None,
        })
    return out


@router.post("/defective/{def_id}/resolve")
def resolve_defective(
    def_id: int,
    body: DefectiveResolve,
    db: Session = Depends(get_db),
    current_user: User = Depends(store_admin),
):
    d = db.query(DefectiveFabric).get(def_id)
    if not d:
        raise HTTPException(404, "Defective entry not found")
    if d.status == "resolved":
        raise HTTPException(400, "This entry is already resolved")
    if body.decision not in ("return", "replacement", "downgrade", "scrap"):
        raise HTTPException(400, "decision must be return | replacement | downgrade | scrap")
    if body.replacement_intake_id and not db.query(FabricIntake).get(body.replacement_intake_id):
        raise HTTPException(404, "Replacement lot not found")

    d.decision = body.decision
    d.amount_debited = body.amount_debited
    d.replacement_intake_id = body.replacement_intake_id
    d.notes = (body.notes or "").strip()
    d.status = "resolved"
    d.resolved_at = datetime.utcnow()
    d.resolved_by = current_user.id

    detail = f"{body.decision} · {float(d.metres_rejected or 0)} m"
    if body.amount_debited:
        detail += f" · debit ₹{body.amount_debited}"
    log_fabric_event(db, d.fabric_id, "defective_resolved", detail=detail,
                     intake_id=d.fabric_intake_id, metres=d.metres_rejected,
                     user_id=current_user.id)
    db.commit()
    return {"ok": True, "decision": d.decision,
            "available_now": fabric_live_stock(db, d.fabric_id)}


# ════════════════════════════════════════════════════════════════════════════
#  FABRIC DETAIL + HISTORY
# ════════════════════════════════════════════════════════════════════════════
@router.get("/{fabric_id}")
def fabric_detail(
    fabric_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    fb = db.query(Fabric).get(fabric_id)
    if not fb:
        raise HTTPException(404, "Fabric not found")
    return {
        "id": fb.id,
        "fabric_name": fb.fabric_name,
        "fabric_type": fb.fabric_type,
        "composition": fb.composition,
        "supplier_name": fb.supplier_name,
        "low_stock_threshold": float(fb.low_stock_threshold or 0),
        "stock": fabric_stock_breakdown(db, fb.id),
    }


@router.get("/{fabric_id}/history")
def fabric_history(
    fabric_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    fb = db.query(Fabric).get(fabric_id)
    if not fb:
        raise HTTPException(404, "Fabric not found")
    rows = (
        db.query(FabricStageHistory)
        .filter_by(fabric_id=fabric_id)
        .order_by(FabricStageHistory.created_at.desc())
        .all()
    )
    return {
        "fabric_name": fb.fabric_name,
        "events": [{
            "event": r.event,
            "detail": r.detail,
            "metres": _f(r.metres),
            "at": r.created_at.isoformat() if r.created_at else None,
        } for r in rows],
    }


# ════════════════════════════════════════════════════════════════════════════
#  JOB WORK (printing / embroidery)
# ════════════════════════════════════════════════════════════════════════════
class JobWorkIn(BaseModel):
    fabric_id: int
    design_id: Optional[int] = None
    job_type: str
    vendor_name: str
    metres_sent: float
    notes: Optional[str] = ""


class JobWorkReturn(BaseModel):
    metres_returned: float
    notes: Optional[str] = ""


@router.post("/job-work")
def send_job_work(
    body: JobWorkIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(store_admin),
):
    if not db.query(Fabric).get(body.fabric_id):
        raise HTTPException(404, "Fabric not found")
    if body.job_type not in ("printing", "embroidery"):
        raise HTTPException(400, "job_type must be 'printing' or 'embroidery'")
    if body.metres_sent <= 0:
        raise HTTPException(400, "Metres sent must be greater than 0")

    jw = JobWork(
        fabric_id=body.fabric_id,
        design_id=body.design_id,
        job_type=body.job_type,
        vendor_name=body.vendor_name.strip(),
        metres_sent=body.metres_sent,
        notes=(body.notes or "").strip(),
        status="sent",
    )
    db.add(jw)
    log_fabric_event(db, body.fabric_id, f"sent_{body.job_type}",
                     detail=f"{body.metres_sent} m to {body.vendor_name.strip()}",
                     metres=body.metres_sent, user_id=current_user.id)
    db.commit()
    db.refresh(jw)
    return {"id": jw.id, "status": jw.status,
            "available_now": fabric_live_stock(db, body.fabric_id)}


@router.post("/job-work/{jw_id}/return")
def return_job_work(
    jw_id: int,
    body: JobWorkReturn,
    db: Session = Depends(get_db),
    current_user: User = Depends(store_admin),
):
    jw = db.query(JobWork).get(jw_id)
    if not jw:
        raise HTTPException(404, "Job work not found")
    if jw.status == "returned":
        raise HTTPException(400, "This job work is already marked returned")

    returned = max(0.0, body.metres_returned or 0)
    sent = float(jw.metres_sent or 0)
    shrink = round(sent - returned, 2)
    shrink_pct = round((shrink / sent * 100), 2) if sent > 0 else 0

    jw.metres_returned = returned
    jw.shrinkage_metres = shrink
    jw.shrinkage_percent = shrink_pct
    jw.date_returned = datetime.utcnow()
    jw.re_qc_by = current_user.id
    jw.status = "returned"
    log_fabric_event(db, jw.fabric_id, "returned_jobwork",
                     detail=f"{returned} m back from {jw.vendor_name} · shrinkage {shrink} m ({shrink_pct}%)",
                     metres=returned, user_id=current_user.id)
    db.commit()
    return {
        "ok": True,
        "metres_sent": sent,
        "metres_returned": returned,
        "shrinkage_metres": shrink,
        "shrinkage_percent": shrink_pct,
        "available_now": fabric_live_stock(db, jw.fabric_id),
    }


@router.get("/job-work/list")
def list_job_work(
    status: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    q = db.query(JobWork)
    if status:
        q = q.filter_by(status=status)
    rows = q.order_by(JobWork.created_at.desc()).all()
    return [{
        "id": jw.id,
        "fabric_id": jw.fabric_id,
        "fabric_name": jw.fabric.fabric_name if jw.fabric else None,
        "design_id": jw.design_id,
        "design_code": jw.design.design_code if jw.design else None,
        "job_type": jw.job_type,
        "vendor_name": jw.vendor_name,
        "date_sent": jw.date_sent.isoformat() if jw.date_sent else None,
        "metres_sent": _f(jw.metres_sent),
        "date_returned": jw.date_returned.isoformat() if jw.date_returned else None,
        "metres_returned": _f(jw.metres_returned),
        "shrinkage_metres": _f(jw.shrinkage_metres),
        "shrinkage_percent": _f(jw.shrinkage_percent),
        "status": jw.status,
        "notes": jw.notes,
    } for jw in rows]

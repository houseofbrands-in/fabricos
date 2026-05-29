import json
from datetime import datetime
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from database import get_db
from models import (
    Fabric, FabricIntake, FabricQC, JobWork, FabricConsumption, Design, User,
)
from auth import require_roles, get_current_user
from fabric_utils import fabric_live_stock, fabric_stock_breakdown

router = APIRouter(prefix="/fabric", tags=["fabric"])

# Who may CHANGE fabric data: storekeeper + admin.
# Anyone logged in may READ it (designer needs the dropdown, cutting needs stock).
store_admin = require_roles("store", "admin")


# ── helpers ─────────────────────────────────────────────────────────────────
def _f(v):
    """Decimal/None -> float/None for clean JSON."""
    return float(v) if v is not None else None


# ════════════════════════════════════════════════════════════════════════════
#  FABRICS (master list)
# ════════════════════════════════════════════════════════════════════════════
class FabricIn(BaseModel):
    fabric_name: str
    fabric_type: str                 # grey | dyed
    supplier_name: Optional[str] = ""
    low_stock_threshold: float = 0


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
        supplier_name=(body.supplier_name or "").strip(),
        low_stock_threshold=body.low_stock_threshold or 0,
    )
    db.add(fb)
    db.commit()
    db.refresh(fb)
    return {"id": fb.id, "fabric_name": fb.fabric_name}


@router.get("/stock")
def stock_summary(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Compact stock list — handy for dashboards & low-stock alerts."""
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


@router.get("/{fabric_id}")
def fabric_detail(
    fabric_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    fb = db.query(Fabric).get(fabric_id)
    if not fb:
        raise HTTPException(404, "Fabric not found")
    bd = fabric_stock_breakdown(db, fb.id)
    return {
        "id": fb.id,
        "fabric_name": fb.fabric_name,
        "fabric_type": fb.fabric_type,
        "supplier_name": fb.supplier_name,
        "low_stock_threshold": float(fb.low_stock_threshold or 0),
        "stock": bd,
    }


# ════════════════════════════════════════════════════════════════════════════
#  INTAKE (purchases)
# ════════════════════════════════════════════════════════════════════════════
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
    db.commit()
    db.refresh(intake)
    return {"id": intake.id, "lot_code": intake.lot_code,
            "total_cost": _f(intake.total_cost)}


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
        "qc_done": it.qc is not None,
        "qc_result": it.qc.result if it.qc else None,
        "metres_accepted": _f(it.qc.metres_accepted) if it.qc else None,
        "notes": it.notes,
    } for it in intakes]


# ════════════════════════════════════════════════════════════════════════════
#  FABRIC QC (incoming inspection)
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

    if rejected == 0:
        result = "accept"
    elif accepted == 0:
        result = "reject"
    else:
        result = "partial"

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
    db.commit()
    return {"ok": True, "result": result, "metres_accepted": accepted}


# ════════════════════════════════════════════════════════════════════════════
#  JOB WORK (printing / embroidery)
# ════════════════════════════════════════════════════════════════════════════
class JobWorkIn(BaseModel):
    fabric_id: int
    design_id: Optional[int] = None
    job_type: str                       # printing | embroidery
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

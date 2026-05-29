import json
from datetime import datetime, timedelta
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from database import get_db
from models import User, Bundle, TailorJob, QCLog, Design
from auth import require_roles, hash_pin

router = APIRouter(prefix="/admin", tags=["admin"])


@router.get("/wip")
def wip_summary(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles("admin")),
):
    statuses = ["cut", "in_progress", "qc_pending", "alteration", "passed", "ironing", "packed"]
    return {s: db.query(Bundle).filter_by(status=s).count() for s in statuses}


@router.get("/tailor-performance")
def tailor_performance(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles("admin")),
):
    tailors = db.query(User).filter_by(role="tailor", is_active=1).all()
    result = []
    for t in tailors:
        rows = (
            db.query(QCLog, Design)
            .join(TailorJob, QCLog.tailor_job_id == TailorJob.id)
            .join(Bundle, QCLog.bundle_id == Bundle.id)
            .join(Design, Bundle.design_id == Design.id)
            .filter(TailorJob.tailor_id == t.id)
            .all()
        )
        passed = sum(r.passed_qty for r, d in rows)
        alterations = sum(r.alteration_qty for r, d in rows)
        earnings = sum(r.passed_qty * d.stitch_rate for r, d in rows)
        quality = round(passed / (passed + alterations) * 100) if (passed + alterations) > 0 else None
        result.append({
            "id": t.id,
            "name": t.name,
            "passed": passed,
            "alterations": alterations,
            "earnings": earnings,
            "quality_pct": quality,
        })
    return result


@router.get("/payroll")
def payroll(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles("admin")),
):
    today = datetime.utcnow().date()
    week_start = datetime.combine(today - timedelta(days=today.weekday()), datetime.min.time())
    week_end = datetime.combine(week_start.date() + timedelta(days=6), datetime.max.time())

    tailors = db.query(User).filter_by(role="tailor", is_active=1).all()
    result = []
    for t in tailors:
        rows = (
            db.query(QCLog, Design)
            .join(TailorJob, QCLog.tailor_job_id == TailorJob.id)
            .join(Bundle, QCLog.bundle_id == Bundle.id)
            .join(Design, Bundle.design_id == Design.id)
            .filter(
                TailorJob.tailor_id == t.id,
                QCLog.checked_at >= week_start,
                QCLog.checked_at <= week_end,
            )
            .all()
        )
        pieces = sum(r.passed_qty for r, d in rows)
        amount = sum(r.passed_qty * d.stitch_rate for r, d in rows)
        result.append({"id": t.id, "name": t.name, "pieces": pieces, "amount": amount})

    return {
        "week_start": week_start.strftime("%d %b %Y"),
        "week_end": week_end.strftime("%d %b %Y"),
        "payroll": result,
        "total_amount": sum(r["amount"] for r in result),
        "total_pieces": sum(r["pieces"] for r in result),
    }


# ── User Management ────────────────────────────────────────────────────────────

class CreateUser(BaseModel):
    name: str
    role: str
    pin: str


class UpdatePin(BaseModel):
    new_pin: str


@router.get("/users")
def list_users(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles("admin")),
):
    users = db.query(User).order_by(User.role, User.name).all()
    return [{"id": u.id, "name": u.name, "role": u.role, "is_active": u.is_active,
             "created_at": u.created_at.isoformat()} for u in users]


@router.post("/users")
def create_user(
    body: CreateUser,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles("admin")),
):
    if len(body.pin) != 4 or not body.pin.isdigit():
        raise HTTPException(400, "PIN must be exactly 4 digits")
    valid_roles = {"admin", "designer", "cutting", "tailor", "qc", "ironing", "packing", "store"}
    if body.role not in valid_roles:
        raise HTTPException(400, "Invalid role")
    u = User(name=body.name.strip(), role=body.role, pin_hash=hash_pin(body.pin))
    db.add(u)
    db.commit()
    db.refresh(u)
    return {"id": u.id, "name": u.name, "role": u.role}


@router.patch("/users/{uid}/pin")
def update_pin(
    uid: int,
    body: UpdatePin,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles("admin")),
):
    if len(body.new_pin) != 4 or not body.new_pin.isdigit():
        raise HTTPException(400, "PIN must be exactly 4 digits")
    u = db.query(User).get(uid)
    if not u:
        raise HTTPException(404)
    u.pin_hash = hash_pin(body.new_pin)
    db.commit()
    return {"ok": True}


@router.delete("/users/{uid}")
def delete_user(
    uid: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles("admin")),
):
    u = db.query(User).get(uid)
    if not u:
        raise HTTPException(404)
    u.is_active = 0
    db.commit()
    return {"ok": True}

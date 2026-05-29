"""
Fabric stock maths — kept in one place so the number can never drift.

Live stock for a fabric is ALWAYS computed fresh from events, never stored:

    available = accepted_in           (metres that passed incoming QC)
              + downgraded_kept       (rejected metres we decided to keep & use)
              - pending_out           (metres currently away at a vendor)
              - shrinkage             (metres permanently lost on returned job work)
              - consumed              (metres used by cutting)

Rejected metres never enter stock at QC. If we later DOWNGRADE them (keep & use,
debit the vendor) they are added back here. If we RETURN or SCRAP them, they
simply stay out — no further stock effect.

Worked example for 100 m:
  Accept 95 m, reject 5 m  ............. available = 95
  Defective 5 m -> downgrade (keep) .... available = 100
  Send 40 m to printer (still out) ..... available =  60
  Returns, 38 m back, 2 m shrinkage .... available =  98
  Cut consumes 50 m .................... available =  48
"""
from datetime import datetime
from sqlalchemy import func
from models import (
    FabricQC, FabricIntake, JobWork, FabricConsumption,
    DefectiveFabric, FabricStageHistory,
)


def _q(db, fabric_id):
    accepted = (
        db.query(func.coalesce(func.sum(FabricQC.metres_accepted), 0))
        .join(FabricIntake, FabricQC.fabric_intake_id == FabricIntake.id)
        .filter(FabricIntake.fabric_id == fabric_id)
        .scalar()
    ) or 0
    downgraded = (
        db.query(func.coalesce(func.sum(DefectiveFabric.metres_rejected), 0))
        .filter(DefectiveFabric.fabric_id == fabric_id,
                DefectiveFabric.decision == "downgrade")
        .scalar()
    ) or 0
    pending_out = (
        db.query(func.coalesce(func.sum(JobWork.metres_sent), 0))
        .filter(JobWork.fabric_id == fabric_id, JobWork.status == "sent")
        .scalar()
    ) or 0
    shrinkage = (
        db.query(func.coalesce(func.sum(JobWork.shrinkage_metres), 0))
        .filter(JobWork.fabric_id == fabric_id, JobWork.status == "returned")
        .scalar()
    ) or 0
    consumed = (
        db.query(func.coalesce(func.sum(FabricConsumption.metres_consumed), 0))
        .filter(FabricConsumption.fabric_id == fabric_id)
        .scalar()
    ) or 0
    return (float(accepted), float(downgraded), float(pending_out),
            float(shrinkage), float(consumed))


def fabric_stock_breakdown(db, fabric_id):
    """Return the full breakdown dict for one fabric."""
    accepted, downgraded, pending_out, shrinkage, consumed = _q(db, fabric_id)
    available = round(accepted + downgraded - pending_out - shrinkage - consumed, 2)
    return {
        "accepted_in": round(accepted, 2),
        "downgraded_kept": round(downgraded, 2),
        "at_vendor": round(pending_out, 2),
        "shrinkage_lost": round(shrinkage, 2),
        "consumed": round(consumed, 2),
        "available": available,
    }


def fabric_live_stock(db, fabric_id):
    """Return just the available-metres number for one fabric."""
    accepted, downgraded, pending_out, shrinkage, consumed = _q(db, fabric_id)
    return round(accepted + downgraded - pending_out - shrinkage - consumed, 2)


def log_fabric_event(db, fabric_id, event, detail="", intake_id=None,
                     metres=None, user_id=None, commit=False):
    """Append a row to the fabric stage-history timeline. Never overwrites."""
    db.add(FabricStageHistory(
        fabric_id=fabric_id,
        fabric_intake_id=intake_id,
        event=event,
        detail=detail or "",
        metres=metres,
        created_by=user_id,
        created_at=datetime.utcnow(),
    ))
    if commit:
        db.commit()

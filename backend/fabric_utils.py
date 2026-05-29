"""
Fabric stock maths — kept in one place so the number can never drift.

Live stock for a fabric is ALWAYS computed fresh from events, never stored:

    available = accepted_in           (metres that passed incoming QC)
              - pending_out           (metres currently away at a vendor)
              - shrinkage             (metres permanently lost on returned job work)
              - consumed              (metres used by cutting)

Worked example for 100 m:
  Accept 100 m  ........................ available = 100
  Send 40 m to printer (still out) ..... available =  60   (40 m physically away)
  Returns, 38 m back, 2 m shrinkage .... available =  98   (60 kept + 38 back)
  Cut consumes 50 m .................... available =  48
"""
from sqlalchemy import func
from models import FabricQC, FabricIntake, JobWork, FabricConsumption


def _q(db, fabric_id):
    accepted = (
        db.query(func.coalesce(func.sum(FabricQC.metres_accepted), 0))
        .join(FabricIntake, FabricQC.fabric_intake_id == FabricIntake.id)
        .filter(FabricIntake.fabric_id == fabric_id)
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
    return float(accepted), float(pending_out), float(shrinkage), float(consumed)


def fabric_stock_breakdown(db, fabric_id):
    """Return the full breakdown dict for one fabric."""
    accepted, pending_out, shrinkage, consumed = _q(db, fabric_id)
    available = round(accepted - pending_out - shrinkage - consumed, 2)
    return {
        "accepted_in": round(accepted, 2),
        "at_vendor": round(pending_out, 2),
        "shrinkage_lost": round(shrinkage, 2),
        "consumed": round(consumed, 2),
        "available": available,
    }


def fabric_live_stock(db, fabric_id):
    """Return just the available-metres number for one fabric."""
    accepted, pending_out, shrinkage, consumed = _q(db, fabric_id)
    return round(accepted - pending_out - shrinkage - consumed, 2)

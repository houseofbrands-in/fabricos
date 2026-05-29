"""
Bundle progress maths — how many pieces of a bundle are still outstanding.

A bundle of N pieces: each piece is, over one or more QC rounds, either
  - passed   (good — the tailor is paid for it), or
  - scrapped (ruined — never paid), or
  - still outstanding (rejected and waiting to be re-stitched + re-checked).

    outstanding = qty - passed_total - scrapped_total

So a 10-piece bundle QC'd as 9 passed + 1 alteration has outstanding = 1,
which is exactly the piece that must be reworked and re-checked.
"""
import json
from sqlalchemy import func
from models import QCLog


def bundle_progress(db, bundle):
    row = (
        db.query(
            func.coalesce(func.sum(QCLog.passed_qty), 0),
            func.coalesce(func.sum(QCLog.scrapped_qty), 0),
        )
        .filter(QCLog.bundle_id == bundle.id)
        .first()
    )
    passed = int(row[0] or 0)
    scrapped = int(row[1] or 0)
    qc_count = db.query(func.count(QCLog.id)).filter(QCLog.bundle_id == bundle.id).scalar() or 0
    outstanding = bundle.qty - passed - scrapped
    if outstanding < 0:
        outstanding = 0
    return {
        "qty": bundle.qty,
        "passed": passed,
        "scrapped": scrapped,
        "outstanding": outstanding,
        "is_recheck": qc_count > 0,
    }


def last_qc_reasons(db, bundle):
    """Reasons from the most recent QC round on this bundle (for rework guidance)."""
    last = (
        db.query(QCLog)
        .filter(QCLog.bundle_id == bundle.id)
        .order_by(QCLog.checked_at.desc())
        .first()
    )
    if last and last.alteration_reasons:
        try:
            return json.loads(last.alteration_reasons)
        except Exception:
            return []
    return []

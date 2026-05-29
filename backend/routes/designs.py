import os, shutil
from typing import Optional
from pathlib import Path
from fastapi import APIRouter, Depends, UploadFile, File, Form, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from database import get_db
from models import Design, Bundle, Fabric
from auth import require_roles, get_current_user, User

router = APIRouter(prefix="/designs", tags=["designs"])

UPLOAD_DIR = Path("/tmp/fabricos_uploads")
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)


def _design_dict(d):
    """Shared serialiser so list + detail always agree."""
    return {
        "id": d.id,
        "design_name": d.design_name,
        "design_code": d.design_code,
        "image_url": d.image_url,
        "stitch_rate": d.stitch_rate,
        "target_qty": d.target_qty,
        "status": d.status,
        # Phase 2 fabric fields (None on old designs — totally fine)
        "fabric_id": d.fabric_id,
        "fabric_name": d.fabric.fabric_name if d.fabric else None,
        "metres_per_piece": float(d.metres_per_piece) if d.metres_per_piece is not None else None,
    }


@router.get("/")
def list_designs(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    designs = db.query(Design).order_by(Design.created_at.desc()).all()
    return [
        {
            **_design_dict(d),
            "bundle_count": len(d.bundles),
            "cut_qty": sum(b.qty for b in d.bundles),
            "created_at": d.created_at.isoformat(),
        }
        for d in designs
    ]


@router.post("/")
async def create_design(
    design_name: str = Form(...),
    design_code: str = Form(...),
    stitch_rate: int = Form(...),
    target_qty: int = Form(...),
    fabric_id: Optional[int] = Form(None),
    metres_per_piece: Optional[float] = Form(None),
    image: UploadFile = File(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles("designer", "admin")),
):
    code = design_code.strip().upper()
    if db.query(Design).filter_by(design_code=code).first():
        raise HTTPException(400, detail="Design code already exists")

    # Validate fabric link if provided
    if fabric_id:
        if not db.query(Fabric).get(fabric_id):
            raise HTTPException(400, detail="Selected fabric not found")

    image_url = None
    if image and image.filename:
        ext = Path(image.filename).suffix.lower()
        fname = f"{code}{ext}"
        fpath = UPLOAD_DIR / fname
        with open(fpath, "wb") as f:
            shutil.copyfileobj(image.file, f)
        image_url = f"/uploads/{fname}"

    d = Design(
        created_by=current_user.id,
        design_name=design_name,
        design_code=code,
        image_url=image_url,
        stitch_rate=stitch_rate,
        target_qty=target_qty,
        fabric_id=fabric_id or None,
        metres_per_piece=metres_per_piece if metres_per_piece else None,
    )
    db.add(d)
    db.commit()
    db.refresh(d)
    return {"id": d.id, "design_code": d.design_code, "design_name": d.design_name}


class FabricReq(BaseModel):
    fabric_id: Optional[int] = None
    metres_per_piece: Optional[float] = None


@router.patch("/{design_id}/fabric")
def set_fabric_requirement(
    design_id: int,
    body: FabricReq,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles("designer", "admin")),
):
    """Set / update which fabric a design uses and how many metres per piece.
    Lets you add fabric info to designs that were created before Phase 2."""
    d = db.query(Design).get(design_id)
    if not d:
        raise HTTPException(404, "Design not found")
    if body.fabric_id is not None:
        if body.fabric_id and not db.query(Fabric).get(body.fabric_id):
            raise HTTPException(400, "Selected fabric not found")
        d.fabric_id = body.fabric_id or None
    if body.metres_per_piece is not None:
        d.metres_per_piece = body.metres_per_piece or None
    db.commit()
    db.refresh(d)
    return _design_dict(d)


@router.get("/{design_id}")
def get_design(
    design_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    d = db.query(Design).get(design_id)
    if not d:
        raise HTTPException(404)
    return {
        **_design_dict(d),
        "bundles": [
            {"id": b.id, "bundle_code": b.bundle_code, "qty": b.qty, "status": b.status, "qr_url": b.qr_url}
            for b in d.bundles
        ],
    }

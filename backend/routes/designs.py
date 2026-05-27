import os, shutil
from pathlib import Path
from fastapi import APIRouter, Depends, UploadFile, File, Form, HTTPException
from sqlalchemy.orm import Session
from database import get_db
from models import Design, Bundle
from auth import require_roles, get_current_user, User

router = APIRouter(prefix="/designs", tags=["designs"])

UPLOAD_DIR = Path("/tmp/fabricos_uploads")
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)


@router.get("/")
def list_designs(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    designs = db.query(Design).order_by(Design.created_at.desc()).all()
    return [
        {
            "id": d.id,
            "design_name": d.design_name,
            "design_code": d.design_code,
            "image_url": d.image_url,
            "stitch_rate": d.stitch_rate,
            "target_qty": d.target_qty,
            "status": d.status,
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
    image: UploadFile = File(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles("designer", "admin")),
):
    code = design_code.strip().upper()
    if db.query(Design).filter_by(design_code=code).first():
        raise HTTPException(400, detail="Design code already exists")

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
    )
    db.add(d)
    db.commit()
    db.refresh(d)
    return {"id": d.id, "design_code": d.design_code, "design_name": d.design_name}


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
        "id": d.id,
        "design_name": d.design_name,
        "design_code": d.design_code,
        "image_url": d.image_url,
        "stitch_rate": d.stitch_rate,
        "target_qty": d.target_qty,
        "status": d.status,
        "bundles": [
            {"id": b.id, "bundle_code": b.bundle_code, "qty": b.qty, "status": b.status, "qr_url": b.qr_url}
            for b in d.bundles
        ],
    }

import io
from datetime import datetime
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session
from database import get_db
from models import Client, ClientPO, ClientPOLine, User
from auth import require_roles, get_current_user

router = APIRouter(tags=["orders"])

editor = require_roles("admin", "designer")


def f(x):
    try:
        return float(x or 0)
    except (TypeError, ValueError):
        return 0.0


def parse_date(s):
    if not s:
        return None
    try:
        return datetime.fromisoformat(str(s)[:19])
    except ValueError:
        return None


# ─────────────────────────── CLIENT MASTER ───────────────────────────
def client_dict(c):
    return {
        "id": c.id, "name": c.name, "gstin": c.gstin or "",
        "contact_person": c.contact_person or "", "phone": c.phone or "",
        "email": c.email or "", "ship_to": c.ship_to or "",
        "billing_address": c.billing_address or "",
        "courier_default": c.courier_default or "", "notes": c.notes or "",
    }


class ClientIn(BaseModel):
    name: str
    gstin: Optional[str] = ""
    contact_person: Optional[str] = ""
    phone: Optional[str] = ""
    email: Optional[str] = ""
    ship_to: Optional[str] = ""
    billing_address: Optional[str] = ""
    courier_default: Optional[str] = ""
    notes: Optional[str] = ""


@router.get("/clients")
def list_clients(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    rows = db.query(Client).order_by(Client.name).all()
    out = []
    for c in rows:
        po_count = db.query(ClientPO).filter_by(client_id=c.id).count()
        out.append({**client_dict(c), "po_count": po_count})
    return out


@router.post("/clients")
def create_client(body: ClientIn, db: Session = Depends(get_db), current_user: User = Depends(editor)):
    if not body.name.strip():
        raise HTTPException(400, "Client name is required")
    c = Client(name=body.name.strip(), gstin=body.gstin, contact_person=body.contact_person,
               phone=body.phone, email=body.email, ship_to=body.ship_to,
               billing_address=body.billing_address, courier_default=body.courier_default,
               notes=body.notes)
    db.add(c)
    db.commit()
    db.refresh(c)
    return client_dict(c)


@router.put("/clients/{cid}")
def update_client(cid: int, body: ClientIn, db: Session = Depends(get_db), current_user: User = Depends(editor)):
    c = db.query(Client).get(cid)
    if not c:
        raise HTTPException(404, "Client not found")
    for k, v in body.dict().items():
        setattr(c, k, v)
    db.commit()
    return client_dict(c)


@router.delete("/clients/{cid}")
def delete_client(cid: int, db: Session = Depends(get_db), current_user: User = Depends(editor)):
    c = db.query(Client).get(cid)
    if not c:
        raise HTTPException(404, "Client not found")
    if db.query(ClientPO).filter_by(client_id=cid).count() > 0:
        raise HTTPException(400, "This client has purchase orders — cannot delete")
    db.delete(c)
    db.commit()
    return {"ok": True}


# ─────────────────────────── CLIENT POs ───────────────────────────
def po_lines(po):
    out = []
    for ln in po.lines:
        qty = int(ln.qty or 0)
        disp = int(ln.dispatched_qty or 0)
        out.append({
            "id": ln.id, "item_code": ln.item_code or "", "description": ln.description or "",
            "colour": ln.colour or "", "size": ln.size or "", "qty": qty,
            "rate": f(ln.rate), "amount": round(qty * f(ln.rate), 2),
            "dispatched_qty": disp, "pending_qty": max(0, qty - disp),
        })
    return out


def po_dict(db, po, with_lines=True):
    client = db.query(Client).get(po.client_id) if po.client_id else None
    lines = po_lines(po)
    total_qty = sum(l["qty"] for l in lines)
    total_amount = sum(l["amount"] for l in lines)
    dispatched = sum(l["dispatched_qty"] for l in lines)
    d = {
        "id": po.id, "client_id": po.client_id,
        "client_name": client.name if client else "—",
        "po_number": po.po_number or "", "status": po.status,
        "po_date": po.po_date.isoformat() if po.po_date else None,
        "delivery_date": po.delivery_date.isoformat() if po.delivery_date else None,
        "notes": po.notes or "",
        "has_pdf": bool(po.pdf_data), "pdf_filename": po.pdf_filename or "",
        "total_qty": total_qty, "total_amount": round(total_amount, 2),
        "dispatched_qty": dispatched, "pending_qty": max(0, total_qty - dispatched),
    }
    if with_lines:
        d["lines"] = lines
        d["client"] = client_dict(client) if client else None
    return d


class POLineIn(BaseModel):
    item_code: Optional[str] = ""
    description: Optional[str] = ""
    colour: Optional[str] = ""
    size: Optional[str] = ""
    qty: int = 0
    rate: float = 0


class POIn(BaseModel):
    client_id: int
    po_number: Optional[str] = ""
    po_date: Optional[str] = None
    delivery_date: Optional[str] = None
    status: Optional[str] = "open"
    notes: Optional[str] = ""
    lines: List[POLineIn] = []


def apply_po(po, body, db):
    po.client_id = body.client_id
    po.po_number = (body.po_number or "").strip()
    po.po_date = parse_date(body.po_date)
    po.delivery_date = parse_date(body.delivery_date)
    po.status = (body.status or "open").lower()
    po.notes = (body.notes or "").strip()
    # preserve dispatched_qty by matching on item_code+size when possible
    old = {(l.item_code or "", l.size or ""): l.dispatched_qty for l in po.lines}
    for l in list(po.lines):
        db.delete(l)
    db.flush()
    for ln in body.lines:
        disp = old.get(((ln.item_code or "").strip(), (ln.size or "").strip()), 0)
        db.add(ClientPOLine(
            po_id=po.id, item_code=(ln.item_code or "").strip(),
            description=(ln.description or "").strip(), colour=(ln.colour or "").strip(),
            size=(ln.size or "").strip(), qty=int(ln.qty or 0), rate=ln.rate,
            dispatched_qty=disp or 0))


@router.get("/pos")
def list_pos(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    rows = db.query(ClientPO).order_by(ClientPO.created_at.desc()).all()
    return [po_dict(db, po, with_lines=False) for po in rows]


@router.get("/pos/{pid}")
def get_po(pid: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    po = db.query(ClientPO).get(pid)
    if not po:
        raise HTTPException(404, "PO not found")
    return po_dict(db, po)


@router.post("/pos")
def create_po(body: POIn, db: Session = Depends(get_db), current_user: User = Depends(editor)):
    if not db.query(Client).get(body.client_id):
        raise HTTPException(400, "Select a valid client")
    po = ClientPO(client_id=body.client_id, created_by=current_user.id)
    db.add(po)
    db.flush()
    apply_po(po, body, db)
    db.commit()
    db.refresh(po)
    return po_dict(db, po)


@router.put("/pos/{pid}")
def update_po(pid: int, body: POIn, db: Session = Depends(get_db), current_user: User = Depends(editor)):
    po = db.query(ClientPO).get(pid)
    if not po:
        raise HTTPException(404, "PO not found")
    apply_po(po, body, db)
    db.commit()
    db.refresh(po)
    return po_dict(db, po)


@router.delete("/pos/{pid}")
def delete_po(pid: int, db: Session = Depends(get_db), current_user: User = Depends(editor)):
    po = db.query(ClientPO).get(pid)
    if not po:
        raise HTTPException(404, "PO not found")
    db.delete(po)
    db.commit()
    return {"ok": True}


@router.post("/pos/{pid}/pdf")
def upload_po_pdf(pid: int, file: UploadFile = File(...), db: Session = Depends(get_db),
                  current_user: User = Depends(editor)):
    po = db.query(ClientPO).get(pid)
    if not po:
        raise HTTPException(404, "PO not found")
    data = file.file.read()
    if not data:
        raise HTTPException(400, "Empty file")
    if len(data) > 15 * 1024 * 1024:
        raise HTTPException(400, "PDF too large (max 15 MB)")
    po.pdf_data = data
    po.pdf_filename = file.filename or f"PO-{pid}.pdf"
    po.pdf_mime = file.content_type or "application/pdf"
    db.commit()
    return {"ok": True, "pdf_filename": po.pdf_filename}


@router.get("/pos/{pid}/pdf")
def download_po_pdf(pid: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    po = db.query(ClientPO).get(pid)
    if not po or not po.pdf_data:
        raise HTTPException(404, "No PDF on this PO")
    return StreamingResponse(
        io.BytesIO(po.pdf_data),
        media_type=po.pdf_mime or "application/pdf",
        headers={"Content-Disposition": f'inline; filename="{po.pdf_filename or "po.pdf"}"'},
    )


@router.delete("/pos/{pid}/pdf")
def delete_po_pdf(pid: int, db: Session = Depends(get_db), current_user: User = Depends(editor)):
    po = db.query(ClientPO).get(pid)
    if not po:
        raise HTTPException(404, "PO not found")
    po.pdf_data = None
    po.pdf_filename = None
    po.pdf_mime = None
    db.commit()
    return {"ok": True}
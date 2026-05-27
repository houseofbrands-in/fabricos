from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from database import get_db
from models import User
from auth import hash_pin, create_token, get_current_user

router = APIRouter(prefix="/auth", tags=["auth"])


class PinLogin(BaseModel):
    pin: str


class SelectUser(BaseModel):
    user_id: int
    pin: str


@router.post("/login")
def login(body: PinLogin, db: Session = Depends(get_db)):
    pin_h = hash_pin(body.pin)
    users = db.query(User).filter_by(pin_hash=pin_h, is_active=1).all()
    if not users:
        raise HTTPException(status_code=401, detail="Invalid PIN")
    if len(users) == 1:
        u = users[0]
        return {
            "token": create_token(u.id, u.role),
            "user": {"id": u.id, "name": u.name, "role": u.role},
        }
    # Multiple users share the same PIN — return list for selection
    return {
        "multiple": True,
        "users": [{"id": u.id, "name": u.name, "role": u.role} for u in users],
    }


@router.post("/select")
def select_user(body: SelectUser, db: Session = Depends(get_db)):
    pin_h = hash_pin(body.pin)
    u = db.query(User).filter_by(id=body.user_id, pin_hash=pin_h, is_active=1).first()
    if not u:
        raise HTTPException(status_code=401, detail="Invalid selection")
    return {
        "token": create_token(u.id, u.role),
        "user": {"id": u.id, "name": u.name, "role": u.role},
    }


@router.get("/me")
def me(current_user: User = Depends(get_current_user)):
    return {"id": current_user.id, "name": current_user.name, "role": current_user.role}

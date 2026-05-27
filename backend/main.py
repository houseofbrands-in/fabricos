import os
import shutil
from pathlib import Path
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from database import create_tables, SessionLocal
from models import User
from auth import hash_pin

from routes.auth import router as auth_router
from routes.designs import router as designs_router
from routes.bundles import router as bundles_router
from routes.tailor import router as tailor_router
from routes.qc import router as qc_router
from routes.admin import router as admin_router

app = FastAPI(title="FabricOS API", version="1.0.0")

FRONTEND_URL = os.environ.get("FRONTEND_URL", "http://localhost:3000")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[FRONTEND_URL, "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Routers
app.include_router(auth_router)
app.include_router(designs_router)
app.include_router(bundles_router)
app.include_router(tailor_router)
app.include_router(qc_router)
app.include_router(admin_router)


# File serving (uploads + QR codes from /tmp)
UPLOAD_DIR = Path("/tmp/fabricos_uploads")
QR_DIR = Path("/tmp/fabricos_qr")


@app.get("/uploads/{filename}")
def serve_upload(filename: str):
    path = UPLOAD_DIR / filename
    if not path.exists():
        from fastapi import HTTPException
        raise HTTPException(404)
    return FileResponse(path)


@app.get("/health")
def health():
    return {"status": "ok"}


# ── Startup ────────────────────────────────────────────────────────────────────
@app.on_event("startup")
def startup():
    create_tables()
    db = SessionLocal()
    try:
        if not db.query(User).filter_by(role="admin").first():
            admin = User(name="Admin", role="admin", pin_hash=hash_pin("1234"))
            db.add(admin)
            db.commit()
            print("✅ Default admin seeded — PIN: 1234")
    finally:
        db.close()

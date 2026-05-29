import os
import shutil
from pathlib import Path
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from database import create_tables, SessionLocal, engine
from sqlalchemy import inspect, text
from models import User
from auth import hash_pin

from routes.auth import router as auth_router
from routes.designs import router as designs_router
from routes.bundles import router as bundles_router
from routes.tailor import router as tailor_router
from routes.qc import router as qc_router
from routes.admin import router as admin_router
from routes.ironing import router as ironing_router
from routes.packing import router as packing_router
from routes.fabric import router as fabric_router

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
app.include_router(ironing_router)
app.include_router(packing_router)
app.include_router(fabric_router)


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


# ── Light auto-migrations ──────────────────────────────────────────────────────
# create_tables() makes NEW tables, but never adds NEW columns to tables that
# already exist. This safely adds any such columns on startup, with no data loss.
LIGHT_MIGRATIONS = [
    # (table, column, column definition)
    ("qc_logs", "scrapped_qty", "INTEGER DEFAULT 0"),
]


def run_light_migrations():
    try:
        insp = inspect(engine)
        existing_tables = insp.get_table_names()
        for table, column, ddl in LIGHT_MIGRATIONS:
            if table not in existing_tables:
                continue  # brand-new table — create_tables already built it in full
            cols = [c["name"] for c in insp.get_columns(table)]
            if column not in cols:
                with engine.begin() as conn:
                    conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {column} {ddl}"))
                print(f"✅ Added missing column {table}.{column}")
    except Exception as e:
        print("⚠️ Light migration skipped:", e)


# ── Startup ────────────────────────────────────────────────────────────────────
@app.on_event("startup")
def startup():
    create_tables()
    run_light_migrations()
    db = SessionLocal()
    try:
        if not db.query(User).filter_by(role="admin").first():
            admin = User(name="Admin", role="admin", pin_hash=hash_pin("1234"))
            db.add(admin)
            db.commit()
            print("✅ Default admin seeded — PIN: 1234")
        if not db.query(User).filter_by(role="store").first():
            store = User(name="Store", role="store", pin_hash=hash_pin("1111"))
            db.add(store)
            db.commit()
            print("✅ Default storekeeper seeded — PIN: 1111")
    finally:
        db.close()

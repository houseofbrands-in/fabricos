from datetime import datetime
from sqlalchemy import Column, Integer, String, DateTime, Text, ForeignKey, Numeric
from sqlalchemy.orm import relationship, declarative_base

Base = declarative_base()


class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True)
    name = Column(String(100), nullable=False)
    # admin | designer | cutting | tailor | qc | ironing | packing | store
    role = Column(String(20), nullable=False)
    pin_hash = Column(String(128), nullable=False)
    is_active = Column(Integer, default=1)
    created_at = Column(DateTime, default=datetime.utcnow)

    designs = relationship("Design", back_populates="creator")
    tailor_jobs = relationship("TailorJob", back_populates="tailor")
    qc_logs = relationship("QCLog", back_populates="inspector")


class Design(Base):
    __tablename__ = "designs"
    id = Column(Integer, primary_key=True)
    created_by = Column(Integer, ForeignKey("users.id"))
    design_name = Column(String(200), nullable=False)
    design_code = Column(String(50), unique=True, nullable=False)
    image_url = Column(String(500))
    stitch_rate = Column(Integer, nullable=False)
    target_qty = Column(Integer, nullable=False)
    status = Column(String(20), default="active")
    created_at = Column(DateTime, default=datetime.utcnow)

    # ── Phase 2: Fabric link (both optional — old designs keep working) ──
    fabric_id = Column(Integer, ForeignKey("fabrics.id"), nullable=True)
    metres_per_piece = Column(Numeric(10, 3), nullable=True)

    creator = relationship("User", back_populates="designs")
    bundles = relationship("Bundle", back_populates="design")
    fabric = relationship("Fabric", back_populates="designs")


class Bundle(Base):
    __tablename__ = "bundles"
    id = Column(Integer, primary_key=True)
    design_id = Column(Integer, ForeignKey("designs.id"))
    bundle_code = Column(String(50), unique=True, nullable=False)
    qty = Column(Integer, nullable=False)
    # cut | in_progress | qc_pending | passed | alteration | ironing | packed
    status = Column(String(20), default="cut")
    qr_url = Column(String(500))
    created_at = Column(DateTime, default=datetime.utcnow)

    design = relationship("Design", back_populates="bundles")
    tailor_jobs = relationship("TailorJob", back_populates="bundle")
    qc_logs = relationship("QCLog", back_populates="bundle")


class TailorJob(Base):
    __tablename__ = "tailor_jobs"
    id = Column(Integer, primary_key=True)
    bundle_id = Column(Integer, ForeignKey("bundles.id"))
    tailor_id = Column(Integer, ForeignKey("users.id"))
    started_at = Column(DateTime, default=datetime.utcnow)
    submitted_at = Column(DateTime)
    status = Column(String(20), default="in_progress")  # in_progress | submitted

    bundle = relationship("Bundle", back_populates="tailor_jobs")
    tailor = relationship("User", back_populates="tailor_jobs")
    qc_logs = relationship("QCLog", back_populates="tailor_job")


class QCLog(Base):
    __tablename__ = "qc_logs"
    id = Column(Integer, primary_key=True)
    bundle_id = Column(Integer, ForeignKey("bundles.id"))
    tailor_job_id = Column(Integer, ForeignKey("tailor_jobs.id"))
    qc_by = Column(Integer, ForeignKey("users.id"))
    passed_qty = Column(Integer, default=0)
    alteration_qty = Column(Integer, default=0)
    scrapped_qty = Column(Integer, default=0)  # pieces ruined / unfixable — never paid
    alteration_reasons = Column(Text)  # JSON array string
    checked_at = Column(DateTime, default=datetime.utcnow)

    bundle = relationship("Bundle", back_populates="qc_logs")
    tailor_job = relationship("TailorJob", back_populates="qc_logs")
    inspector = relationship("User", back_populates="qc_logs")


# ════════════════════════════════════════════════════════════════════════════
#  PHASE 2 — FABRIC MODULE
# ════════════════════════════════════════════════════════════════════════════

class Supplier(Base):
    """Master list of suppliers (fabric) and vendors (job work). One per party."""
    __tablename__ = "suppliers"
    id = Column(Integer, primary_key=True)
    name = Column(String(200), nullable=False)
    phone = Column(String(40))
    gst = Column(String(40))
    city = Column(String(100))
    contact_person = Column(String(120))
    notes = Column(Text)
    kind = Column(String(20), default="fabric")   # fabric | jobwork | both
    created_at = Column(DateTime, default=datetime.utcnow)


class Fabric(Base):
    """Master list of every fabric the factory buys."""
    __tablename__ = "fabrics"
    id = Column(Integer, primary_key=True)
    fabric_name = Column(String(200), nullable=False)      # e.g. "Cotton Poplin White 60s"
    fabric_type = Column(String(20), nullable=False)       # grey | dyed
    composition = Column(String(200))                       # e.g. "100% Cotton, 60s"
    supplier_id = Column(Integer, ForeignKey("suppliers.id"), nullable=True)
    supplier_name = Column(String(200))
    low_stock_threshold = Column(Numeric(10, 2), default=0)  # alert below this many metres
    created_at = Column(DateTime, default=datetime.utcnow)

    intakes = relationship("FabricIntake", back_populates="fabric")
    job_works = relationship("JobWork", back_populates="fabric")
    consumptions = relationship("FabricConsumption", back_populates="fabric")
    designs = relationship("Design", back_populates="fabric")


class PurchaseBill(Base):
    """One supplier bill / invoice — can contain several fabrics (each becomes a lot)."""
    __tablename__ = "purchase_bills"
    id = Column(Integer, primary_key=True)
    supplier_id = Column(Integer, ForeignKey("suppliers.id"), nullable=True)
    supplier_name = Column(String(200), nullable=False)   # snapshot at time of bill
    invoice_number = Column(String(100))
    purchase_date = Column(DateTime, default=datetime.utcnow)
    notes = Column(Text)
    created_by = Column(Integer, ForeignKey("users.id"))
    created_at = Column(DateTime, default=datetime.utcnow)

    lots = relationship("FabricIntake", back_populates="bill")


class FabricIntake(Base):
    """One received lot. Many lots can belong to one purchase bill."""
    __tablename__ = "fabric_intake"
    id = Column(Integer, primary_key=True)
    fabric_id = Column(Integer, ForeignKey("fabrics.id"))
    purchase_bill_id = Column(Integer, ForeignKey("purchase_bills.id"), nullable=True)
    lot_code = Column(String(50), unique=True, nullable=False)
    intake_date = Column(DateTime, default=datetime.utcnow)
    metres_received = Column(Numeric(10, 2), nullable=False)
    num_rolls = Column(Integer, default=0)
    cost_per_metre = Column(Numeric(10, 2), default=0)
    total_cost = Column(Numeric(12, 2), default=0)
    notes = Column(Text)
    created_at = Column(DateTime, default=datetime.utcnow)

    fabric = relationship("Fabric", back_populates="intakes")
    bill = relationship("PurchaseBill", back_populates="lots")
    qc = relationship("FabricQC", back_populates="intake", uselist=False,
                      foreign_keys="FabricQC.fabric_intake_id")


class FabricQC(Base):
    """Incoming inspection of a received lot. Only ACCEPTED metres enter stock."""
    __tablename__ = "fabric_qc"
    id = Column(Integer, primary_key=True)
    fabric_intake_id = Column(Integer, ForeignKey("fabric_intake.id"))
    qc_by = Column(Integer, ForeignKey("users.id"))
    metres_checked = Column(Numeric(10, 2), default=0)
    metres_accepted = Column(Numeric(10, 2), default=0)
    metres_rejected = Column(Numeric(10, 2), default=0)
    result = Column(String(20))            # accept | partial | reject
    defect_types = Column(Text)            # JSON array string
    notes = Column(Text)
    checked_at = Column(DateTime, default=datetime.utcnow)

    intake = relationship("FabricIntake", back_populates="qc")


class JobWork(Base):
    """Fabric sent out to a printer / embroiderer and (later) returned."""
    __tablename__ = "job_work"
    id = Column(Integer, primary_key=True)
    fabric_id = Column(Integer, ForeignKey("fabrics.id"))
    design_id = Column(Integer, ForeignKey("designs.id"), nullable=True)
    vendor_id = Column(Integer, ForeignKey("suppliers.id"), nullable=True)
    job_type = Column(String(20))          # printing | embroidery
    vendor_name = Column(String(200))
    date_sent = Column(DateTime, default=datetime.utcnow)
    metres_sent = Column(Numeric(10, 2), nullable=False)
    date_returned = Column(DateTime, nullable=True)
    metres_returned = Column(Numeric(10, 2), nullable=True)
    shrinkage_metres = Column(Numeric(10, 2), nullable=True)
    shrinkage_percent = Column(Numeric(6, 2), nullable=True)
    re_qc_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    status = Column(String(20), default="sent")  # sent | returned
    notes = Column(Text)
    created_at = Column(DateTime, default=datetime.utcnow)

    fabric = relationship("Fabric", back_populates="job_works")
    design = relationship("Design")


class FabricConsumption(Base):
    """Fabric used up when the cutting master records a cut."""
    __tablename__ = "fabric_consumption"
    id = Column(Integer, primary_key=True)
    design_id = Column(Integer, ForeignKey("designs.id"))
    fabric_id = Column(Integer, ForeignKey("fabrics.id"))
    pieces_cut = Column(Integer, nullable=False)
    metres_consumed = Column(Numeric(10, 2), nullable=False)
    cut_by = Column(Integer, ForeignKey("users.id"))
    consumed_at = Column(DateTime, default=datetime.utcnow)

    fabric = relationship("Fabric", back_populates="consumptions")
    design = relationship("Design")


class DefectiveFabric(Base):
    """Register of rejected fabric — what we decided to do about it (decided later)."""
    __tablename__ = "defective_fabric"
    id = Column(Integer, primary_key=True)
    fabric_id = Column(Integer, ForeignKey("fabrics.id"))
    fabric_intake_id = Column(Integer, ForeignKey("fabric_intake.id"))
    metres_rejected = Column(Numeric(10, 2), nullable=False)
    defect_types = Column(Text)             # JSON array string
    # pending | return | replacement | downgrade | scrap
    decision = Column(String(20), default="pending")
    amount_debited = Column(Numeric(12, 2), nullable=True)   # ₹ debited to vendor (downgrade/return)
    replacement_intake_id = Column(Integer, ForeignKey("fabric_intake.id"), nullable=True)
    status = Column(String(20), default="open")              # open | resolved
    notes = Column(Text)
    opened_at = Column(DateTime, default=datetime.utcnow)
    resolved_at = Column(DateTime, nullable=True)
    resolved_by = Column(Integer, ForeignKey("users.id"), nullable=True)

    fabric = relationship("Fabric")
    intake = relationship("FabricIntake", foreign_keys=[fabric_intake_id])


class FabricStageHistory(Base):
    """Append-only timeline of everything that happens to a fabric / lot."""
    __tablename__ = "fabric_stage_history"
    id = Column(Integer, primary_key=True)
    fabric_id = Column(Integer, ForeignKey("fabrics.id"))
    fabric_intake_id = Column(Integer, ForeignKey("fabric_intake.id"), nullable=True)
    event = Column(String(40), nullable=False)   # received | qc | issued_cutting | sent_printing ...
    detail = Column(Text)
    metres = Column(Numeric(10, 2), nullable=True)
    created_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    fabric = relationship("Fabric")


# ════════════════════════════════════════════════════════════════════════════
#  WAREHOUSE — Finished-goods inventory (master/sub SKU, racks, stock ledger)
# ════════════════════════════════════════════════════════════════════════════

class WarehouseSku(Base):
    """Master SKU = the real product+size. Holds the stock."""
    __tablename__ = "wh_skus"
    id = Column(Integer, primary_key=True)
    sku_code = Column(String(100), nullable=False)                 # canonical master code
    normalized_code = Column(String(100), unique=True, index=True, nullable=False)
    name = Column(String(200))
    size = Column(String(20))
    barcode = Column(String(120))
    design_code = Column(String(50))                               # optional link to design (later)
    created_at = Column(DateTime, default=datetime.utcnow)

    subs = relationship("WarehouseSubSku", back_populates="master",
                        cascade="all, delete-orphan")


class WarehouseSubSku(Base):
    """A channel/brand code (DressBerry, Amarasha, Myntra…) that maps to one master."""
    __tablename__ = "wh_sub_skus"
    id = Column(Integer, primary_key=True)
    master_id = Column(Integer, ForeignKey("wh_skus.id"))
    sub_code = Column(String(100), nullable=False)
    normalized_code = Column(String(100), unique=True, index=True, nullable=False)
    channel = Column(String(80))                                   # e.g. Amarasha, Myntra
    barcode = Column(String(120))
    created_at = Column(DateTime, default=datetime.utcnow)

    master = relationship("WarehouseSku", back_populates="subs")


class WarehouseRack(Base):
    """A physical, barcoded location. Stock is tracked per (master SKU × rack)."""
    __tablename__ = "wh_racks"
    id = Column(Integer, primary_key=True)
    code = Column(String(50), nullable=False)
    normalized_code = Column(String(50), unique=True, index=True, nullable=False)
    barcode = Column(String(120))
    zone = Column(String(80))
    created_at = Column(DateTime, default=datetime.utcnow)


class WarehouseMovement(Base):
    """Append-only stock ledger. Live stock = sum of signed qty."""
    __tablename__ = "wh_movements"
    id = Column(Integer, primary_key=True)
    master_id = Column(Integer, ForeignKey("wh_skus.id"))
    rack_id = Column(Integer, ForeignKey("wh_racks.id"), nullable=True)
    bucket = Column(String(20), default="sellable")    # sellable | quarantine
    qty = Column(Integer, nullable=False)              # signed: +in, -out
    move_type = Column(String(30))                     # inward|outward|return_in|restock|scrap|adjust
    source = Column(String(40))                        # manual|myntra|flipkart|...
    reference = Column(String(200))
    note = Column(Text)
    created_by = Column(Integer, ForeignKey("users.id"))
    created_at = Column(DateTime, default=datetime.utcnow)

    master = relationship("WarehouseSku")
    rack = relationship("WarehouseRack")


class MarketplaceTemplate(Base):
    """Configurable column-mapping for a marketplace's order/return file.
    If a marketplace renames columns, upload a dummy file and re-map here."""
    __tablename__ = "wh_templates"
    id = Column(Integer, primary_key=True)
    name = Column(String(80), nullable=False)            # e.g. Myntra
    sku_column = Column(String(120), nullable=False)     # column holding our seller SKU
    qty_column = Column(String(120))                     # blank => each row = 1 unit
    order_id_column = Column(String(120))
    status_column = Column(String(120))
    status_include = Column(String(300))                 # csv of statuses to keep (blank = all)
    created_at = Column(DateTime, default=datetime.utcnow)


class WarehouseUploadBatch(Base):
    """A record of each committed file upload (outward or return)."""
    __tablename__ = "wh_upload_batches"
    id = Column(Integer, primary_key=True)
    marketplace = Column(String(80))
    kind = Column(String(20))                 # outward | return
    filename = Column(String(300))
    rows_total = Column(Integer, default=0)
    rows_matched = Column(Integer, default=0)
    rows_unmatched = Column(Integer, default=0)
    units = Column(Integer, default=0)        # units deducted / quarantined
    unmatched_json = Column(Text)             # list of {code, qty}
    created_by = Column(Integer, ForeignKey("users.id"))
    created_at = Column(DateTime, default=datetime.utcnow)

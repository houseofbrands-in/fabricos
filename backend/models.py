from datetime import datetime
from sqlalchemy import Column, Integer, String, DateTime, Text, ForeignKey, Numeric
from sqlalchemy.orm import relationship, declarative_base

Base = declarative_base()


class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True)
    name = Column(String(100), nullable=False)
    role = Column(String(20), nullable=False)  # admin | designer | cutting | tailor | qc
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

    creator = relationship("User", back_populates="designs")
    bundles = relationship("Bundle", back_populates="design")


class Bundle(Base):
    __tablename__ = "bundles"
    id = Column(Integer, primary_key=True)
    design_id = Column(Integer, ForeignKey("designs.id"))
    bundle_code = Column(String(50), unique=True, nullable=False)
    qty = Column(Integer, nullable=False)
    # cut | in_progress | qc_pending | passed | alteration
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
    alteration_reasons = Column(Text)  # JSON array string
    checked_at = Column(DateTime, default=datetime.utcnow)

    bundle = relationship("Bundle", back_populates="qc_logs")
    tailor_job = relationship("TailorJob", back_populates="qc_logs")
    inspector = relationship("User", back_populates="qc_logs")

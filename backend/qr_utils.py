import io
import os
import qrcode
from PIL import Image
from pathlib import Path
from fastapi.responses import StreamingResponse

QR_DIR = Path("/tmp/fabricos_qr")
QR_DIR.mkdir(parents=True, exist_ok=True)


def generate_qr_png(bundle_code: str) -> Path:
    """Generate a QR code PNG and return its path."""
    path = QR_DIR / f"{bundle_code}.png"
    if not path.exists():
        qr = qrcode.QRCode(version=1, box_size=10, border=4)
        qr.add_data(bundle_code)
        qr.make(fit=True)
        img = qr.make_image(fill_color="black", back_color="white")
        img.save(path)
    return path


def qr_response(bundle_code: str) -> StreamingResponse:
    """Return a StreamingResponse for the QR PNG."""
    path = generate_qr_png(bundle_code)
    buf = io.BytesIO(path.read_bytes())
    buf.seek(0)
    return StreamingResponse(buf, media_type="image/png")

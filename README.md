# FabricOS — Factory Floor & Warehouse Management System

> A full-stack web-based ERP for garment factories. Tracks production from fabric sourcing
> to dispatch, plus a finished-goods warehouse driven by marketplace files.
> Built by a non-coder (Rupesh, House of Brands, Surat) with Claude AI assistance.

---

## 🌐 Live URLs

| Service | URL |
|---|---|
| **Frontend (Vercel)** | https://fabricos-eight.vercel.app |
| **Backend API (Railway)** | https://fabricos-production.up.railway.app |
| **API Health Check** | https://fabricos-production.up.railway.app/health |
| **API Docs (Swagger)** | https://fabricos-production.up.railway.app/docs |
| **GitHub Repo** | https://github.com/houseofbrands-in/fabricos |

---

## 🔑 Default Logins

| Role | PIN | Notes |
|---|---|---|
| Admin | 1234 | Full access incl. all modules + delete |
| Store (storekeeper) | 1111 | Fabric Store |
| Warehouse | 2222 | Finished-goods warehouse |

> Admin can reach the **Fabric** store and the **Warehouse** from buttons in the top nav bar.
> Change default PINs in the Admin → Users tab.

---

## 🏭 About This Factory

**Owner:** Rupesh, House of Brands, Surat, Gujarat
**Business:** Garment manufacturing — sells B2C (Myntra, Flipkart, Ajio, Amazon, Meesho, Snapdeal) and FOB (client orders). Brands include DressBerry, Amarasha, etc.
**Production model:** One tailor stitches one complete garment (piece-rate pay)

**Real factory flow:**
```
Fabric Order → Fabric QC → [Printing / Embroidery / Direct] → Re-QC → Cut → Stitch
   → QC → Iron → Pack → Warehouse (finished goods) → Dispatch (marketplace / client)
```

---

## ✅ What's Built (Current State)

### Phase 1 — Core Floor Tracking (COMPLETE ✅)

| Stage | Role | What they do |
|---|---|---|
| Design | `designer` | Upload product image, set design code, stitching rate per piece, target qty |
| Cutting | `cutting` | Select design, enter pieces cut, system auto-generates bundles + QR codes |
| Stitching | `tailor` | Scan bundle QR → see product image → work → submit for QC |
| QC | `qc` | Scan finished bundle, enter passed qty + alteration qty (+ scrap), select reasons |
| Ironing | `ironing` | Scan QC-passed bundle, mark as ironed |
| Packing | `packing` | Scan ironed bundle, enter size breakup, carton no, mark as packed |
| Fabric Store | `store` | Fabrics, purchase bills, fabric QC, defective register, suppliers, job work, live stock |
| Warehouse | `warehouse` | Finished-goods SKUs, racks, inward, marketplace outward, returns, quarantine |
| Admin | `admin` | WIP dashboard, tailor performance, payroll, user management, all modules |

**Bundle flow (statuses):**
```
cut → in_progress → qc_pending → passed → ironing → packed
                               ↘ alteration (rework — goes back to the same tailor)
```

**Key Phase-1 features:**
- 4-digit PIN login (multiple users can share a PIN → name picker)
- QR code auto-generation for every bundle
- Tailor sees alteration feedback in real time (polling)
- Weekly payroll auto-calculated: passed pieces × stitch rate per design
- **Rework & re-QC loop:** QC entry must add up to the pieces being checked (passed + alteration + scrap). A tailor is paid only for pieces that PASS. Rejected pieces return to the same tailor as a rework job, get re-stitched and re-checked — pay is added only when the fixed piece finally passes. "Scrap" marks a ruined piece that is never paid.

---

### Phase 2 — Fabric Module (COMPLETE ✅)

> Tracks fabric from purchase → incoming QC → job work → cutting. Live stock is always
> computed fresh from events (never stored), so the number can never drift.

**Live fabric-stock formula (computed, never stored):**
```
available = accepted_in        (metres that passed incoming QC)
          + downgraded_kept    (rejected metres we decided to keep & use)   ← Slice A
          - at_vendor          (metres currently out at a job-work vendor)
          - shrinkage_lost     (metres permanently lost on returned job work)
          - consumed           (metres used by cutting)
```

**Fabric Store page (`store` role) — 6 tabs:**

- **Fabrics** — add a fabric (grey/dyed, composition, default supplier from master, low-stock alert). Live stock with full breakdown + low-stock highlighting. Each fabric has a **History** timeline (received → QC → job work → issued to cutting → defective decisions). Admin can delete (cascades).
- **Suppliers** — combined **Supplier & Vendor master** (see below).
- **Purchase** — record one **multi-fabric purchase bill** (supplier from master + invoice number + several fabric lines; each line becomes its own auto-coded lot `LOT-00001…`). Bill total computed live. Purchase history with per-lot QC status.
- **Fabric QC** — inspect a received lot. **You type Rejected; Accepted = received − rejected is computed automatically** (prevents stock over-count). Only accepted metres enter stock. Backend rejects entries that don't add up to the lot size. Rejected metres open a **defective entry**.
- **Defective** — register of rejected fabric, decided later: **return / replacement / downgrade / scrap**. Downgrade adds the metres back into usable stock; return & scrap keep them out. Vendor debit pre-fills as rejected metres × that lot's purchase rate (editable).
- **Job Work** — send fabric to a printing/embroidery **vendor (from master)**; receive it back recording metres returned → auto shrinkage metres + %.

**Design + Cutting integration:**
- A designer can attach a fabric + metres-per-piece to a design (optional; old designs untouched).
- At cutting, fabric auto-deducts (metres/piece × pieces cut). If it would go below zero it **warns but never blocks** the floor.

**Slice A enhancements (COMPLETE ✅):** multi-fabric purchase bills, defective register, append-only stage history, the QC over-count fix, admin-only delete across all fabric entities (with cascade + empty-bill cleanup), and the supplier master.

---

### Supplier & Vendor Master (COMPLETE ✅)

> One master list so the same party is never typed twice ("Surat Mills" / "surat mills" / "SS").

- One combined list, each tagged **fabric supplier**, **job-work vendor**, or **both**.
- Fields: name, phone, GST, city, contact person, notes. **Names are duplicate-protected** (case-insensitive). Fabric names are duplicate-protected too.
- Picked from **dropdowns** on the purchase bill, job work, and a fabric's default supplier, each with an inline **+ New** quick-add.
- Every record **stores the supplier's name as a snapshot at time of use**, so renaming/deleting a supplier never rewrites old bills.
- **Supplier history** view: total purchased, total debited for defects, recent bills (+ job-work totals for vendors).

---

### Warehouse Module — Finished Goods (COMPLETE ✅)

> A finished-goods inventory that runs on barcodes, racks, and marketplace file uploads.
> Role: `warehouse` (PIN 2222); admin can access too.

**Core model:**
- **Master SKU + Sub-SKUs.** The master SKU is the real product+size and holds the stock. Sub-SKUs are channel/brand codes (DressBerry, Amarasha, Myntra…) that map to one master, each with its own barcode. Any scanned/uploaded code (master or sub, code or barcode) resolves to the master.
- **Normalization:** all codes are matched uppercased with separators stripped, so `DB-D011DR-A-L` and `DB_D011DR_A_L` are the same SKU.
- **Racks:** barcoded locations. Stock is tracked **per (Master SKU × Rack)**, in two buckets: **sellable** and **quarantine**.
- Stock is an **append-only movement ledger** (live stock = sum of signed quantities).

**Warehouse page — 8 tabs:**

- **Inward** — *scan flow:* scan/lock a rack, then scan SKUs onto it one after another (each Enter adds qty and refocuses). Plus **Bulk Inward** by file (columns `rack, sku, qty`).
- **Outward** — upload a marketplace **pick list / order file** (CSV/Excel). **Preview** shows, before anything changes: matched SKUs, available stock, a **rack-wise FIFO pick guide** (oldest rack first), shortfalls flagged, and unmatched SKUs listed (skipped — never deducted). **Confirm & Deduct** writes the deduction; the pick guide is **printable**.
- **Returns** — upload a return file; matched items go into **quarantine** (not sellable).
- **Quarantine** — returns-to-inspect; per SKU **Restock** (scan a rack to put good ones back into sellable) or **Scrap**.
- **Stock** — live sellable + quarantine per SKU with rack-wise breakdown.
- **SKUs** — add master SKUs (size auto-fills from the code's last segment) + attach sub-SKUs; **Bulk Upload** SKUs by CSV/Excel. Duplicate-protected, separator-agnostic.
- **Racks** — add barcoded racks; see units + distinct SKUs; view rack contents. Delete blocked while a rack holds stock.
- **Templates** — **configurable column mapping** per marketplace. If a marketplace renames columns, upload a sample file → the mapping fields become dropdowns of that file's actual columns → re-map without code. **Myntra** template is seeded automatically.

**All uploads (SKUs, inward, outward, returns) skip + report bad/unmatched rows — never silently drop or auto-create.**

---

## 🗺️ Roadmap / What's Next

- **Warehouse Pass 2** — more marketplace templates (Flipkart / Amazon / Meesho / Snapdeal) as sample files arrive; **barcode label generation/printing** for SKUs and racks; **scan-picking** (scan rack while pulling, vs the current pick-guide); **link warehouse stock to production** so packed goods auto-inward.
- **Slice B — Orders / PO / Job Cards** (designed, not yet built): clients master (FOB / B2C), POs (one PO → many job cards), job cards (one per design; fabric + one stitch rate + urgent flag + size breakup), repeat pre-fill from last order, stitch-rate alert, urgent highlight for cutting.
- **Dispatch Module** — packing slips (PDF), link packed bundles to outgoing orders, B2C vs FOB flows, fulfilment status.
- **Reporting & Analytics** — cost per garment, fabric utilisation, tailor quality over time, design profitability, vendor performance.
- **AI layer** — admin asks plain-English questions about the database.

---

## 🛠️ Tech Stack

| Layer | Technology |
|---|---|
| Backend | FastAPI (Python) |
| Database | PostgreSQL (Railway) |
| Frontend | React (Create React App) |
| Auth | JWT tokens + PIN hashing |
| QR Codes | python-qrcode + Pillow |
| File parsing | openpyxl (Excel) + csv (built-in) — shared by all uploads |
| Frontend Deploy | Vercel (auto on git push) |
| Backend Deploy | Railway (auto on git push, manages PostgreSQL) |

---

## 📁 Project Structure

```
fabricos/
├── backend/                        → FastAPI backend (Railway)
│   ├── main.py                     → App entry, CORS, routers, startup seed + light migrations
│   ├── models.py                   → All SQLAlchemy models
│   ├── database.py                 → PostgreSQL connection, create_tables()
│   ├── auth.py                     → JWT, PIN hashing, role guards
│   ├── qr_utils.py                 → QR PNG generation
│   ├── fabric_utils.py             → Live fabric-stock maths + stage-history logger
│   ├── requirements.txt            → Python deps (incl. openpyxl)
│   └── routes/
│       ├── auth.py                 → login / select / me
│       ├── designs.py              → designer CRUD + set fabric/piece
│       ├── bundles.py              → cut → bundles + QR; logs fabric "issued_cutting"
│       ├── tailor.py               → scan / submit / dashboard (rework loop)
│       ├── qc.py                   → garment QC (passed/alteration/scrap)
│       ├── ironing.py              → ironing stage
│       ├── packing.py              → packing + size breakup + summary
│       ├── admin.py                → WIP, performance, payroll, user CRUD (roles incl. warehouse)
│       ├── fabric.py               → fabrics, purchase bills, fabric QC, defective, history, job work, deletes
│       ├── suppliers.py            → supplier/vendor master + history          ← Slice A
│       └── warehouse.py            → SKUs/subs, racks, inward (scan+bulk), outward, returns,
│                                     quarantine, templates, movements, batches  ← Warehouse
│
├── frontend/                       → React frontend (Vercel)
│   └── src/
│       ├── App.js                  → Routes + role guards (incl. /store, /warehouse)
│       ├── api.js                  → Axios + JWT auto-attach + 401 redirect
│       ├── context/AuthContext.js  → Auth state, roleHome() (store, warehouse)
│       ├── components/Layout.js    → Navbar; admin buttons for Fabric + Warehouse
│       └── pages/
│           ├── Login.js  Designer.js  Cutting.js  Tailor.js  QC.js
│           ├── Ironing.js  Packing.js  Admin.js
│           ├── Store.js            → Fabric Store (Fabrics/Suppliers/Purchase/QC/Defective/Job Work)
│           └── Warehouse.js        → Warehouse (Inward/Outward/Returns/Quarantine/Stock/SKUs/Racks/Templates)
│
└── README.md
```

---

## 🗄️ Database Schema (Current)

**Core (Phase 1):**
```
users          id, name, role, pin_hash, is_active, created_at
               roles: admin|designer|cutting|tailor|qc|ironing|packing|store|warehouse
designs        id, created_by, design_name, design_code (unique), image_url,
               stitch_rate, target_qty, status, created_at,
               fabric_id (nullable), metres_per_piece (nullable)
bundles        id, design_id, bundle_code (unique), qty, status, qr_url, created_at
tailor_jobs    id, bundle_id, tailor_id, started_at, submitted_at, status
qc_logs        id, bundle_id, tailor_job_id, qc_by, passed_qty, alteration_qty,
               scrapped_qty, alteration_reasons (JSON), checked_at
```

**Fabric module (Phase 2 + Slice A):**
```
suppliers           id, name, phone, gst, city, contact_person, notes,
                    kind (fabric|jobwork|both), created_at
fabrics             id, fabric_name, fabric_type (grey|dyed), composition,
                    supplier_id (nullable), supplier_name, low_stock_threshold, created_at
purchase_bills      id, supplier_id (nullable), supplier_name (snapshot),
                    invoice_number, purchase_date, notes, created_by, created_at
fabric_intake       id, fabric_id, purchase_bill_id (nullable), lot_code (unique),
                    intake_date, metres_received, num_rolls, cost_per_metre,
                    total_cost, notes, created_at
fabric_qc           id, fabric_intake_id, qc_by, metres_checked, metres_accepted,
                    metres_rejected, result (accept|partial|reject),
                    defect_types (JSON), notes, checked_at
defective_fabric    id, fabric_id, fabric_intake_id, metres_rejected, defect_types (JSON),
                    decision (pending|return|replacement|downgrade|scrap), amount_debited,
                    replacement_intake_id (nullable), status (open|resolved), notes,
                    opened_at, resolved_at, resolved_by
fabric_stage_history id, fabric_id, fabric_intake_id (nullable), event, detail,
                    metres (nullable), created_by, created_at
job_work            id, fabric_id, design_id (nullable), vendor_id (nullable),
                    job_type (printing|embroidery), vendor_name, date_sent, metres_sent,
                    date_returned, metres_returned, shrinkage_metres, shrinkage_percent,
                    re_qc_by, status (sent|returned), notes, created_at
fabric_consumption  id, design_id, fabric_id, pieces_cut, metres_consumed, cut_by, consumed_at
```

**Warehouse module:**
```
wh_skus           id, sku_code, normalized_code (unique), name, size, barcode,
                  design_code, created_at
wh_sub_skus       id, master_id, sub_code, normalized_code (unique), channel, barcode, created_at
wh_racks          id, code, normalized_code (unique), barcode, zone, created_at
wh_movements      id, master_id, rack_id (nullable), bucket (sellable|quarantine),
                  qty (signed), move_type (inward|outward|return_in|restock|scrap|adjust),
                  source (manual|myntra|...), reference, note, created_by, created_at
wh_templates      id, name, sku_column, qty_column, order_id_column, status_column,
                  status_include, created_at
wh_upload_batches id, marketplace, kind (outward|return), filename, rows_total,
                  rows_matched, rows_unmatched, units, unmatched_json, created_by, created_at
```

---

## 🔌 Key API Endpoints

**Fabric** (`/fabric`) — list/create fabrics (+ bulk), stock, detail, **history**, purchase bills
(`POST /fabric/purchase`, `GET /fabric/purchase/list`), single intake, fabric QC, **defective**
(`GET /fabric/defective`, `POST /fabric/defective/{id}/resolve`), job work send/return, and
admin-only deletes for fabric / purchase / intake / defective / job-work.

**Suppliers** (`/suppliers`) — list (`?kind=`), create, patch, **detail+history** (`GET /suppliers/{id}`), delete (admin).

**Warehouse** (`/warehouse`):
```
GET  /skus                         list master SKUs (+subs, stock, rack breakdown)
POST /skus                         create master SKU
POST /skus/bulk                    bulk upload SKUs (CSV/XLSX)
POST /skus/{id}/subs               add a sub-SKU      DELETE /skus/{id}/subs/{sub}
GET  /resolve?code=                resolve any code → master
GET/POST /racks                    racks            DELETE /racks/{id}    GET /rack/{id} contents
POST /inward                       scan inward (rack + sku + qty)
POST /inward/bulk                  bulk inward (CSV/XLSX: rack, sku, qty)
GET  /stock                        live stock (sellable + quarantine + racks)
GET/POST/PATCH/DELETE /templates   marketplace column-mapping templates
POST /templates/headers            read a sample file's column names (for mapping)
POST /upload/preview               parse a pick list → pick guide + unmatched (no change)
POST /upload/commit                deduct stock (FIFO oldest rack first) + log batch
POST /returns/upload               returns → quarantine
GET  /quarantine                   quarantine list
POST /quarantine/restock           quarantine → sellable on a rack
POST /quarantine/scrap             write off from quarantine
GET  /movements   GET /batches     ledger + upload history
```
Reads allow any logged-in user; mutations require `warehouse`/`admin`; deletes are admin-only.

---

## ⚙️ Railway Environment Variables (IMPORTANT)

| Variable | Value |
|---|---|
| `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` (reference to the Postgres service) |
| `FRONTEND_URL` | https://fabricos-eight.vercel.app |
| `SECRET_KEY` | your secret string |
| **`MISE_PYTHON_GITHUB_ATTESTATIONS`** | **`false`** ← required, or the backend build fails on Python install |

> ⚠️ If a backend deploy "succeeds" but the API behaves like the old version, check the build log:
> a failed `mise` Python install (attestation error) makes Railway keep serving the previous build.
> The env var above is the fix. Vercel needs `frontend/.env.production` →
> `REACT_APP_API_URL=https://fabricos-production.up.railway.app` (no trailing slash).

---

## 🔁 Schema Migrations (self-healing)

`create_tables()` creates any brand-new **tables** on startup. For new **columns on existing
tables**, `main.py` runs `LIGHT_MIGRATIONS` — it `ALTER`-adds missing columns automatically,
with no data loss. **No database reset is needed when adding columns.** Current list:
```
qc_logs.scrapped_qty, fabrics.composition, fabric_intake.purchase_bill_id,
fabrics.supplier_id, purchase_bills.supplier_id, job_work.vendor_id
```

---

## 🚀 Deploy (after any change)

```bash
cd C:\Users\ASUS\Projects\fabricos
git add -A          # -A stages everything, including backend files
git commit -m "describe what changed"
git push            # Railway + Vercel auto-redeploy (~1-2 min each)
```
Local dev: backend `uvicorn main:app --reload` (:8000); frontend `npm start` (:3000).

---

## 📋 Session Log

| Session | Date | What was built |
|---|---|---|
| Session 1 | May 2026 | Project setup: FastAPI + React + PostgreSQL on Railway/Vercel. Roles: designer, cutting, tailor, qc, admin. Core bundle flow: cut → stitch → qc → payroll. |
| Session 2 | May 2026 | Phase 1 complete: ironing + packing (size breakup, packing summary). Roles: ironing, packing. WIP dashboard, edit-PIN. |
| Session 3 | May 2026 | **Phase 2: Fabric Module.** 5 fabric tables + fabric_id/metres_per_piece on designs. `store` role + Fabric Store. Live stock from events; auto deduction at cutting (warns, never blocks); job-work shrinkage. **Plus** the per-piece rework/re-QC loop + scrap; `qc_logs.scrapped_qty` via self-healing migration. |
| Session 4 | Jun 2026 | **Slice A — Fabric enhancements.** Multi-fabric purchase bills (invoice + lots), defective register (return/replacement/downgrade/scrap with vendor debit), append-only fabric stage history, Fabric QC over-count fix (type Rejected, Accepted computed), admin-only delete across all fabric entities (cascade + empty-bill cleanup), all tabs refresh together. **Supplier & Vendor master** (combined list, tags, duplicate protection, name snapshots, supplier history; dropdowns + inline quick-add on purchase/job-work/fabric). Debugged deployment: `MISE_PYTHON_GITHUB_ATTESTATIONS=false`, DATABASE_URL reference, API URL placeholder, stale-tab refresh. |
| Session 5 | Jun 2026 | **Warehouse Module.** *Pass 1A:* `warehouse` role (PIN 2222) + Warehouse page; master SKU + sub-SKUs (channel mapping, barcodes, normalization); racks; scan-rack-then-scan-SKU inward; live stock per SKU and per rack. *Pass 1B:* marketplace upload (preview → FIFO rack-wise pick guide → commit deduction), returns → quarantine → restock/scrap, configurable column-mapping templates (seeded Myntra; header detection from a sample file), upload-batch log. **Bulk SKU upload** and **bulk inward** by CSV/Excel, both with skip-and-report. Shared openpyxl/csv file reader. |

---

## 🤖 Prompt for Next Claude Session

> Copy this block at the start of your next conversation and upload this README.md.

```
I am building FabricOS, a garment factory + warehouse management system.
I am a non-coder factory owner in Surat, India, building with Claude session by session.
The README.md I'm uploading has the full project: tech stack, schema, file structure,
live URLs, API list, and session history. Please read it before writing any code.

GitHub: https://github.com/houseofbrands-in/fabricos  (may be private — I'll make it
public briefly so you can read my real code, then private again).
Backend: https://fabricos-production.up.railway.app    Frontend: https://fabricos-eight.vercel.app
I deploy by pushing to GitHub (Railway + Vercel auto-deploy). I work in VS Code on Windows
at C:\Users\ASUS\Projects\fabricos.

DONE so far: Phase 1 (design->cut->stitch->qc->iron->pack, payroll, rework loop),
Phase 2 Fabric Module + Slice A (purchase bills, defective register, history, supplier
master), and the Warehouse Module (master/sub SKUs, racks, scan + bulk inward, marketplace
outward with FIFO pick guide, returns->quarantine->restock/scrap, configurable templates).
Roles: designer, cutting, tailor, qc, ironing, packing, store, warehouse, admin.

What I might build next (pick one): Warehouse Pass 2 (more marketplace templates,
barcode label printing, scan-picking, link production->warehouse auto-inward); OR
Slice B (orders/PO/job cards); OR Dispatch module; OR reporting/analytics.

Rules for our sessions:
- I'm a non-coder - explain simply.
- Give me COMPLETE changed files (I asked for individual files, not zips).
- Never break existing features; warn me before anything risky.
- New tables auto-create on startup; new columns self-heal via LIGHT_MIGRATIONS in main.py
  (no DB reset needed) - add new columns there if you add any.
- Confirm the plan/schema with me before coding.
- Update this README's Session Log at the end when I say so.
```

---

*This README is a living document. Update the Session Log and any changed sections when asked.*
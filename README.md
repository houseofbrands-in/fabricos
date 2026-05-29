# FabricOS — Factory Floor Management System

> A full-stack web-based ERP for garment factories. Tracks production from fabric sourcing to dispatch.
> Built by a non-coder (Rupesh, House of Brands, Surat) with Claude AI assistance.

---

## 🌐 Live URLs

| Service | URL |
|---|---|
| **Frontend (Vercel)** | https://fabricos-eight.vercel.app |
| **Backend API (Railway)** | https://fabricos-production.up.railway.app |
| **API Health Check** | https://fabricos-production.up.railway.app/health |
| **GitHub Repo** | https://github.com/houseofbrands-in/fabricos |

---

## 🔑 Default Login

| Role | PIN | First Login Action |
|---|---|---|
| Admin | 1234 | Change this immediately in Users tab |
| Store (storekeeper) | 1111 | Change this immediately in Users tab |

---

## 🏭 About This Factory

**Owner:** Rupesh, House of Brands, Surat, Gujarat  
**Business:** Garment manufacturing — sells B2C (Myntra, Flipkart, Ajio) and FOB (client orders)  
**Production model:** One tailor stitches one complete garment (piece-rate pay)

**Real factory flow:**
```
Fabric Order → Fabric QC → [Printing / Embroidery / Direct] → Re-QC → Cut → Stitch → QC → Iron → Pack → Warehouse → Dispatch
```

---

## ✅ What's Built (Current State)

### Phase 1 — Core Floor Tracking (COMPLETE)

| Stage | Role | What they do |
|---|---|---|
| Design | `designer` | Upload product image, set design code, stitching rate per piece, target qty |
| Cutting | `cutting` | Select design, enter pieces cut, system auto-generates bundles + QR codes |
| Stitching | `tailor` | Scan bundle QR → see product image → work → submit for QC |
| QC | `qc` | Scan finished bundle, enter passed qty + alteration qty, select reasons |
| Ironing | `ironing` | Scan QC-passed bundle, mark as ironed |
| Packing | `packing` | Scan ironed bundle, enter size breakup (S/M/L/XL), enter carton no, mark as packed |
| Fabric Store | `store` | Manage fabrics, record intake, fabric QC, send/receive job work, live stock (Phase 2) |
| Admin | `admin` | WIP dashboard, tailor performance, weekly payroll, user management, fabric overview |

**Bundle flow (statuses):**
```
cut → in_progress → qc_pending → passed → ironing → packed
                               ↘ alteration (goes back to tailor)
```

**Key features working:**
- 4-digit PIN login (no passwords — fast for factory floor)
- Multiple users can share a PIN (system shows name picker)
- QR code auto-generation for every bundle
- Tailor sees alteration feedback in real-time (15-second polling)
- Weekly payroll auto-calculated: passed pieces × stitching rate per design
- Tailor earnings dashboard with total pieces and total earnings
- Admin can create/deactivate users and change any user's PIN
- Packing summary report showing total packed pieces per design

---

## 🗺️ Full Roadmap (All Phases)

### Phase 2 — Fabric Module (COMPLETE ✅)
> Tracks fabric from purchase → incoming QC → job work → cutting. Live stock is always
> computed fresh from events (never stored), so the number can never drift.

**Tables added:** `fabrics`, `fabric_intake`, `fabric_qc`, `job_work`, `fabric_consumption`
(plus two new optional columns on `designs`: `fabric_id`, `metres_per_piece`).

**Live stock formula (computed, never stored):**
```
available = accepted_in        (metres that passed incoming QC)
          - at_vendor          (metres currently out at a job-work vendor)
          - shrinkage_lost     (metres permanently lost on returned job work)
          - consumed           (metres used by cutting)
```

**What the storekeeper (`store` role) can do — Fabric Store page, 4 tabs:**
- **Fabrics** — add a fabric (grey/dyed, supplier, low-stock alert level); see live stock per fabric with full breakdown (available / at vendor / consumed / shrinkage) and low-stock highlighting
- **Intake** — record a purchase lot (unique lot code, metres, rolls, cost/metre → auto total cost); intake history with QC status
- **Fabric QC** — inspect a received lot, accept/reject metres, tag defects (shade variation / weave defect / width short). **Only accepted metres enter stock.** Result auto-set to accept / partial / reject
- **Job Work** — send fabric to a printing/embroidery vendor (stock drops immediately); receive it back recording metres returned → system computes shrinkage metres + %; full job-work history

**Design + Cutting integration:**
- A designer can attach a fabric + metres-per-piece to any design (optional — old designs keep working untouched)
- When the cutting master records a cut, the system **auto-deducts** fabric (metres/piece × pieces cut) and shows metres consumed + remaining stock
- If a cut would push stock below zero it **warns but never blocks** the floor (cutting must never be held up)
- The cutting screen shows the design's fabric, live stock, and metres this cut needs (with a "not enough" hint)

### Phase 3 — Dispatch Module
> Track what leaves the factory. Generate packing slips. Handle both B2C and FOB orders.

**Tables to add:**
- `orders` — order type (B2C/FOB), client name, order date, required qty
- `dispatch_notes` — bundles dispatched, date, courier/transporter
- `packing_slips` — auto-generated PDF with design, qty, sizes, carton details

**Features:**
- Link packed bundles to outgoing orders
- Separate flows for B2C (to warehouse/3PL) vs FOB (direct to client)
- Dispatch history per design
- Outstanding order fulfilment status

### Phase 4 — Reporting & Analytics
> Understand your factory's performance with data.

**Reports:**
- Cost per garment (fabric cost + stitching cost + job work cost)
- Fabric utilisation % per design (planned vs actual consumption)
- Tailor-wise quality score over time
- Design-wise profitability (for B2C: selling price − cost)
- Vendor performance (job work turnaround time, shrinkage rates)
- Weekly/monthly production summary

---

## 🛠️ Tech Stack

| Layer | Technology | Why |
|---|---|---|
| Backend | FastAPI (Python) | Fast, clean API. Same stack as Project M |
| Database | PostgreSQL (Railway) | Reliable, scales well |
| Frontend | React (Create React App) | Mobile-friendly, no page reloads |
| Auth | JWT tokens + PIN hashing (SHA-256) | Fast login for factory workers |
| QR Codes | python-qrcode + Pillow | Auto-generated, served via API |
| Frontend Deploy | Vercel | Auto-deploys on git push |
| Backend Deploy | Railway | Auto-deploys on git push, manages PostgreSQL |

---

## 📁 Project Structure

```
fabricos/
├── backend/                        → FastAPI backend (deployed on Railway)
│   ├── main.py                     → App entry point, CORS, router registration, startup seed
│   ├── models.py                   → SQLAlchemy database models (all tables)
│   ├── database.py                 → PostgreSQL connection, SessionLocal, create_tables()
│   ├── auth.py                     → JWT token creation/decode, PIN hashing, role guards
│   ├── qr_utils.py                 → QR code PNG generation (saved to /tmp)
│   ├── fabric_utils.py             → Live fabric-stock maths (computed, never stored)
│   ├── requirements.txt            → Python dependencies
│   └── routes/
│       ├── auth.py                 → POST /auth/login, /auth/select, GET /auth/me
│       ├── designs.py              → GET/POST /designs/ — designer CRUD
│       ├── bundles.py              → POST /bundles/cut, GET /bundles/qr/{code}
│       ├── tailor.py               → POST /tailor/scan, /tailor/submit, GET /tailor/dashboard
│       ├── qc.py                   → GET /qc/pending, POST /qc/submit
│       ├── ironing.py              → GET /ironing/pending, POST /ironing/scan, /ironing/submit
│       ├── packing.py              → GET /packing/pending, POST /packing/scan, /packing/submit, GET /packing/summary
│       └── admin.py                → WIP, tailor performance, payroll, user CRUD
│
├── frontend/                       → React frontend (deployed on Vercel)
│   ├── public/index.html           → HTML shell
│   ├── .env                        → Local dev: REACT_APP_API_URL=http://localhost:8000
│   ├── .env.production             → Prod: REACT_APP_API_URL=https://fabricos-production.up.railway.app
│   ├── vercel.json                 → SPA routing fix (all paths → index.html)
│   ├── package.json                → React dependencies
│   └── src/
│       ├── index.js                → React entry point
│       ├── App.js                  → Routes + role-based guards
│       ├── api.js                  → Axios instance with JWT auto-attach + 401 redirect
│       ├── context/
│       │   └── AuthContext.js      → Global auth state, login/logout, roleHome()
│       ├── components/
│       │   └── Layout.js           → Shared navbar with role badge + logout
│       └── pages/
│           ├── Login.js            → 4-digit PIN keypad, multi-user selector
│           ├── Designer.js         → Create designs, upload product images
│           ├── Cutting.js          → Record cuts, generate bundles + QR codes, print QRs
│           ├── Tailor.js           → Scan bundle, active job view, earnings, alteration feed
│           ├── QC.js               → Scan bundle, pass/fail entry, alteration reasons
│           ├── Ironing.js          → Scan QC-passed bundle, mark as ironed
│           ├── Packing.js          → Scan ironed bundle, size breakup, packing summary
│           ├── Admin.js            → WIP dashboard, performance, payroll, user management
│           └── Store.js            → Fabric Store: fabrics, intake, fabric QC, job work (Phase 2)
│
└── README.md                       → This file — always updated after each session
```

---

## 🗄️ Database Schema (Current)

```
users
  id, name, role, pin_hash, is_active, created_at
  roles: admin | designer | cutting | tailor | qc | ironing | packing | store

designs
  id, created_by (→users), design_name, design_code (unique),
  image_url, stitch_rate, target_qty, status, created_at,
  fabric_id (→fabrics, nullable), metres_per_piece (nullable)   ← Phase 2

bundles
  id, design_id (→designs), bundle_code (unique), qty,
  status (cut|in_progress|qc_pending|passed|alteration|ironing|packed),
  qr_url, created_at

tailor_jobs
  id, bundle_id (→bundles), tailor_id (→users),
  started_at, submitted_at, status (in_progress|submitted)

qc_logs
  id, bundle_id (→bundles), tailor_job_id (→tailor_jobs),
  qc_by (→users), passed_qty, alteration_qty,
  alteration_reasons (JSON string), checked_at
```

**Phase 2 fabric tables (BUILT):**
```
fabrics
  id, fabric_name, fabric_type (grey|dyed), supplier_name,
  low_stock_threshold, created_at

fabric_intake
  id, fabric_id (→fabrics), lot_code (unique), intake_date,
  metres_received, num_rolls, cost_per_metre, total_cost, notes, created_at

fabric_qc
  id, fabric_intake_id (→fabric_intake), qc_by (→users),
  metres_checked, metres_accepted, metres_rejected,
  result (accept|partial|reject), defect_types (JSON string), notes, checked_at

job_work
  id, fabric_id (→fabrics), design_id (→designs, nullable),
  job_type (printing|embroidery), vendor_name, date_sent, metres_sent,
  date_returned, metres_returned, shrinkage_metres, shrinkage_percent,
  re_qc_by (→users), status (sent|returned), notes, created_at

fabric_consumption
  id, design_id (→designs), fabric_id (→fabrics),
  pieces_cut, metres_consumed, cut_by (→users), consumed_at
```

**Fabric API (all under /fabric):**
```
GET  /fabric/                 list fabrics + live stock + low-stock flag   (any logged-in user)
POST /fabric/                 create fabric                                (store|admin)
GET  /fabric/stock            compact stock summary + low-stock list       (any logged-in user)
GET  /fabric/{id}             fabric detail + stock breakdown              (any logged-in user)
POST /fabric/intake           record a purchase lot                        (store|admin)
GET  /fabric/intake/list      intake history (optional ?fabric_id=)        (any logged-in user)
GET  /fabric/qc/pending       lots awaiting incoming QC                    (any logged-in user)
POST /fabric/qc               submit incoming QC (only accepted enters stock) (store|admin)
POST /fabric/job-work         send fabric to a vendor                      (store|admin)
POST /fabric/job-work/{id}/return   receive back + auto shrinkage          (store|admin)
GET  /fabric/job-work/list    job-work history (optional ?status=)         (any logged-in user)

PATCH /designs/{id}/fabric    set/update a design's fabric + metres/piece  (designer|admin)
```

---

## ⚙️ Railway Environment Variables

| Variable | Value |
|---|---|
| `DATABASE_URL` | Set automatically by Railway PostgreSQL |
| `SECRET_KEY` | Your secret string (change from default) |
| `FRONTEND_URL` | https://fabricos-eight.vercel.app |

---

## 🚀 How to Run Locally

**Backend:**
```bash
cd backend
pip install -r requirements.txt
uvicorn main:app --reload
# Runs at http://localhost:8000
```

**Frontend:**
```bash
cd frontend
npm install
npm start
# Runs at http://localhost:3000
```

---

## 📦 How to Deploy (After Any Code Change)

```bash
# In VS Code terminal, from the fabricos/ root folder:
git add .
git commit -m "describe what you changed"
git push
# Railway auto-redeploys backend (~2 min)
# Vercel auto-redeploys frontend (~2 min)
```

---

## 📋 Session Log

| Session | Date | What was built |
|---|---|---|
| Session 1 | May 2026 | Full project setup: FastAPI backend, React frontend, PostgreSQL on Railway, Vercel deploy. Roles: designer, cutting, tailor, qc, admin. Core bundle flow: cut → stitch → qc → payroll. |
| Session 2 | May 2026 | Phase 1 complete: Ironing stage, Packing stage with size breakup + packing summary. New roles: ironing, packing. WIP dashboard updated to 7 stages. Edit user PIN feature added. |
| Session 3 | May 2026 | **Phase 2 complete: Fabric Module.** 5 new tables (fabrics, fabric_intake, fabric_qc, job_work, fabric_consumption) + fabric_id/metres_per_piece on designs. New `store` role + Fabric Store page (Fabrics / Intake / Fabric QC / Job Work tabs). Live stock computed from events. Auto fabric deduction at cutting (warns, never blocks). Job-work shrinkage tracking. Designer can set fabric/piece; cutting screen shows live stock + metres needed. Backend smoke-tested end-to-end. |

---

## 🤖 Prompt for Next Claude Session (Phase 3 — Dispatch Module)

> Copy this entire block and paste it at the start of your next Claude conversation.
> Also upload this README.md file so Claude has full context.

---

```
I am building a garment factory management system called FabricOS.
I am a non-coder and factory owner based in Surat, India.

I am working with Claude AI to build this system session by session.
The README.md I am uploading has the full project details, tech stack,
database schema, file structure, live URLs, and session history.

Please read the README carefully before writing any code.

My GitHub repo: https://github.com/houseofbrands-in/fabricos
Backend live at: https://fabricos-production.up.railway.app
Frontend live at: https://fabricos-eight.vercel.app

The repo may be PRIVATE. If you cannot read it, I will make it public
for a few minutes so you can read my actual code, then I will make it
private again. Please always read my real code before changing anything.

I deploy by pushing to GitHub — Railway and Vercel auto-deploy.
I work in VS Code on Windows. My projects are at C:\Users\ASUS\Projects\fabricos

Phases 1 and 2 are COMPLETE:
- Phase 1: Design → Cut → Stitch → QC → Iron → Pack, payroll, admin (roles:
  designer, cutting, tailor, qc, ironing, packing, admin)
- Phase 2: Fabric Module (role: store) — fabrics, intake, fabric QC, job work,
  live stock, auto fabric deduction at cutting

Today I want to build Phase 3: Dispatch Module.

Phase 3 scope (from README):
- Track what leaves the factory; generate packing slips; handle B2C and FOB orders
- Tables: orders (B2C/FOB, client, date, qty), dispatch_notes (bundles dispatched,
  date, courier), packing_slips (PDF with design, qty, sizes, carton details)
- Link packed bundles to outgoing orders
- Separate B2C (warehouse/3PL) vs FOB (direct to client) flows
- Dispatch history per design; outstanding order fulfilment status

Please:
1. First confirm you have read the README and understand the current system
2. Show me what new database tables you will add (just the schema first, no code)
3. Wait for my approval before writing any code
4. After we finish, update the README.md session log with what we built today

Important rules for our sessions:
- I am a non-coder so explain things simply
- Always give me complete files, not just the changed parts
- After each session, update README.md with what was built
- Never break existing features — only add new ones
- If something might break existing code, warn me first
- Backend has a /home/claude-style fresh DB note: new tables auto-create on
  startup, but NEW COLUMNS on existing tables do NOT get added automatically by
  SQLAlchemy create_all — so if you add columns to an existing table, tell me to
  reset the database (the system is not yet holding real production data)
```

---

*This README is a living document. Claude must update the Session Log and any changed sections at the end of every working session.*

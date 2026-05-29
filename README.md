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
| Admin | `admin` | WIP dashboard, tailor performance, weekly payroll, user management |

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

### Phase 2 — Fabric Module (NEXT)
> Track fabric from purchase to cutting. Know exactly how much fabric you have, what's been sent for job work, and what's been consumed.

**Tables to add:**
- `fabrics` — fabric name, type (grey/dyed), supplier
- `fabric_intake` — purchase date, metres received, cost per metre, roll IDs
- `fabric_qc` — incoming QC check per roll (accept/reject/partial)
- `job_work` — sent to printer/embroiderer, metres out, metres returned, shrinkage %
- `fabric_consumption` — metres consumed per design per cutting session

**Features:**
- Each design gets a "fabric requirement" (metres per piece)
- System auto-deducts fabric when cutting master records a cut
- Low stock alert when fabric balance drops below threshold
- Job work tracking: vendor name, date sent, date returned, loss recorded
- Fabric QC: defect types (shade variation, weave defect, width short)

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
│           └── Admin.js            → WIP dashboard, performance, payroll, user management
│
└── README.md                       → This file — always updated after each session
```

---

## 🗄️ Database Schema (Current)

```
users
  id, name, role, pin_hash, is_active, created_at
  roles: admin | designer | cutting | tailor | qc | ironing | packing

designs
  id, created_by (→users), design_name, design_code (unique),
  image_url, stitch_rate, target_qty, status, created_at

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

**Tables to be added in Phase 2:**
```
fabrics, fabric_intake, fabric_qc, job_work, fabric_consumption
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

---

## 🤖 Prompt for Next Claude Session (Phase 2 — Fabric Module)

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

I deploy by pushing to GitHub — Railway and Vercel auto-deploy.
I work in VS Code on Windows. My projects are at C:\Users\ASUS\Projects\fabricos

Today I want to build Phase 2: Fabric Module.

Phase 2 scope (from README):
- Track fabric from purchase to cutting
- Tables: fabrics, fabric_intake, fabric_qc, job_work, fabric_consumption
- Each design gets a fabric requirement (metres per piece)
- System auto-deducts when cutting master records a cut
- Job work tracking: sent to printer/embroiderer, metres returned, shrinkage %
- Fabric QC: incoming check per roll (accept/partial/reject), defect types

My factory process for fabric:
1. We source grey or dyed fabric from the market
2. Some designs need printing (sent to external printing unit)
3. Some designs need embroidery (sent to external embroidery unit)
4. Some go direct to cutting
5. When fabric comes back from job work, we do a re-QC (shrinkage happens here)
6. Then fabric goes to cutting master

Please:
1. First confirm you have read the README and understand the current system
2. Show me what new database tables you will add (just the schema first, no code yet)
3. Wait for my approval before writing any code
4. After we finish, update the README.md session log with what we built today

Important rules for our sessions:
- I am a non-coder so explain things simply
- Always give me complete files, not just the changed parts
- After each session, update README.md with what was built
- Never break existing features — only add new ones
- If something might break existing code, warn me first
```

---

*This README is a living document. Claude must update the Session Log and any changed sections at the end of every working session.*

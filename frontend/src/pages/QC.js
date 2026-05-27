import { useState, useEffect, useRef } from "react";
import Layout from "../components/Layout";
import api from "../api";
import { ClipboardCheck, ScanLine, Check } from "lucide-react";

const REASONS_DEFAULT = ["Loose thread","Wrong stitch length","Seam misalignment","Fabric pull","Button misplaced","Zip issue","Measurement off","Dirty mark","Other"];

export default function QC() {
  const [pending, setPending] = useState([]);
  const [reasons, setReasons] = useState(REASONS_DEFAULT);
  const [scanCode, setScanCode] = useState("");
  const [bundle, setBundle] = useState(null);
  const [form, setForm] = useState({ passed_qty: "", alteration_qty: "0", reasons: [] });
  const [msg, setMsg] = useState(null);
  const [loading, setLoading] = useState(false);
  const scanRef = useRef(null);

  const loadPending = () => api.get("/qc/pending").then(r => setPending(r.data));
  useEffect(() => {
    loadPending();
    api.get("/qc/reasons").then(r => setReasons(r.data));
  }, []);

  const scan = async (code) => {
    const c = (code || scanCode).trim().toUpperCase();
    if (!c) return;
    setMsg(null);
    try {
      const { data } = await api.get(`/bundles/${c}/info`);
      if (data.status !== "qc_pending") {
        setMsg({ type: "error", text: `Bundle status is '${data.status}', not ready for QC.` });
        return;
      }
      setBundle(data);
      setForm({ passed_qty: String(data.qty), alteration_qty: "0", reasons: [] });
    } catch (e) {
      setMsg({ type: "error", text: e.response?.data?.detail || "Bundle not found" });
    }
  };

  const toggleReason = (r) => setForm(f => ({
    ...f,
    reasons: f.reasons.includes(r) ? f.reasons.filter(x => x !== r) : [...f.reasons, r],
  }));

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await api.post("/qc/submit", {
        bundle_id: bundle.id,
        job_id: bundle.job_id,
        passed_qty: parseInt(form.passed_qty),
        alteration_qty: parseInt(form.alteration_qty),
        reasons: form.reasons,
      });
      setMsg({ type: "success", text: `✅ QC saved! Bundle marked as ${parseInt(form.alteration_qty) > 0 ? "alteration" : "passed"}.` });
      setBundle(null);
      setScanCode("");
      loadPending();
    } catch (e) {
      setMsg({ type: "error", text: e.response?.data?.detail || "Error" });
    } finally {
      setLoading(false);
    }
  };

  const API = process.env.REACT_APP_API_URL;
  const showReasons = parseInt(form.alteration_qty) > 0;

  return (
    <Layout>
      <h2 style={{ fontWeight: 900, marginBottom: 4 }}>QC Inspection</h2>
      <p style={{ color: "#6c757d", marginBottom: 20, fontSize: 14 }}>{pending.length} bundles pending review</p>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(300px,420px) 1fr", gap: 20, alignItems: "start" }}>

        {/* Scan + Form */}
        <div style={{ background: "white", borderRadius: 16, boxShadow: "0 2px 12px rgba(0,0,0,0.06)", overflow: "hidden" }}>
          <div style={{ background: "linear-gradient(135deg,#1a1a2e,#0f3460)", color: "white", padding: "14px 20px" }}>
            <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}><ScanLine size={15} style={{ marginRight: 6 }} />Scan Bundle</h3>
          </div>
          <div style={{ padding: 20 }}>
            {msg && (
              <div style={{ background: msg.type === "success" ? "#d1f5ea" : "#ffe0e3", borderRadius: 8, padding: "10px 14px", marginBottom: 14, fontSize: 13, color: msg.type === "success" ? "#1b5e20" : "#b71c1c" }}>{msg.text}</div>
            )}

            <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
              <input ref={scanRef} value={scanCode} onChange={e => setScanCode(e.target.value.toUpperCase())}
                onKeyDown={e => e.key === "Enter" && scan()}
                placeholder="Bundle code e.g. SK-001-B001"
                style={{ flex: 1, border: "1.5px solid #dee2e6", borderRadius: 10, padding: "10px 12px", fontSize: 13, outline: "none" }} />
              <button onClick={() => scan()} style={{ background: "#e94560", color: "white", border: "none", borderRadius: 10, padding: "10px 14px", fontWeight: 700, cursor: "pointer", fontSize: 13 }}>Scan</button>
            </div>

            {bundle && (
              <form onSubmit={submit}>
                <div style={{ background: "#f0f7ff", border: "1px solid #cce0ff", borderRadius: 10, padding: 14, marginBottom: 16 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start" }}>
                    <div>
                      <div style={{ fontWeight: 800, fontFamily: "monospace" }}>{bundle.bundle_code}</div>
                      <div style={{ color: "#6c757d", fontSize: 13 }}>{bundle.design_name}</div>
                      <div style={{ fontSize: 13, marginTop: 4 }}>Tailor: <strong>{bundle.tailor_name || "—"}</strong></div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontWeight: 900, fontSize: 22, color: "#0f3460" }}>{bundle.qty}</div>
                      <div style={{ fontSize: 12, color: "#6c757d" }}>pieces</div>
                    </div>
                  </div>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
                  <div>
                    <label style={{ fontSize: 12, fontWeight: 700, color: "#1b5e20", display: "block", marginBottom: 4 }}>✓ Passed Qty</label>
                    <input type="number" value={form.passed_qty} min="0" max={bundle.qty}
                      onChange={e => setForm(f => ({ ...f, passed_qty: e.target.value }))} required
                      style={{ width: "100%", border: "2px solid #1b5e20", borderRadius: 10, padding: "10px", fontSize: 18, fontWeight: 800, outline: "none", boxSizing: "border-box" }} />
                  </div>
                  <div>
                    <label style={{ fontSize: 12, fontWeight: 700, color: "#b71c1c", display: "block", marginBottom: 4 }}>✗ Alteration Qty</label>
                    <input type="number" value={form.alteration_qty} min="0" max={bundle.qty}
                      onChange={e => setForm(f => ({ ...f, alteration_qty: e.target.value, reasons: [] }))}
                      style={{ width: "100%", border: "2px solid #b71c1c", borderRadius: 10, padding: "10px", fontSize: 18, fontWeight: 800, outline: "none", boxSizing: "border-box" }} />
                  </div>
                </div>

                {showReasons && (
                  <div style={{ marginBottom: 16 }}>
                    <label style={{ fontSize: 12, fontWeight: 700, color: "#495057", display: "block", marginBottom: 8 }}>Alteration Reasons (select all that apply)</label>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                      {reasons.map(r => (
                        <button type="button" key={r} onClick={() => toggleReason(r)} style={{
                          border: `2px solid ${form.reasons.includes(r) ? "#e94560" : "#dee2e6"}`,
                          background: form.reasons.includes(r) ? "#fff0f3" : "white",
                          color: form.reasons.includes(r) ? "#e94560" : "#495057",
                          borderRadius: 10, padding: "6px 12px", fontSize: 13, cursor: "pointer", fontWeight: form.reasons.includes(r) ? 700 : 400,
                        }}>{r}</button>
                      ))}
                    </div>
                  </div>
                )}

                <button type="submit" disabled={loading} style={{
                  background: "#1a1a2e", color: "white", border: "none", borderRadius: 10,
                  padding: "12px", fontWeight: 700, fontSize: 14, width: "100%", cursor: "pointer",
                }}>
                  <ClipboardCheck size={15} style={{ marginRight: 6 }} />
                  {loading ? "Saving..." : "Save QC Log"}
                </button>
              </form>
            )}
          </div>
        </div>

        {/* Pending Bundles */}
        <div style={{ background: "white", borderRadius: 16, boxShadow: "0 2px 12px rgba(0,0,0,0.06)", overflow: "hidden" }}>
          <div style={{ background: "linear-gradient(135deg,#1a1a2e,#0f3460)", color: "white", padding: "14px 20px" }}>
            <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>Pending Bundles ({pending.length})</h3>
          </div>
          {pending.length === 0 ? (
            <div style={{ textAlign: "center", padding: 48, color: "#adb5bd" }}>
              <Check size={40} color="#1b5e20" style={{ opacity: 0.4 }} />
              <p style={{ marginTop: 12, fontSize: 14 }}>All clear — no bundles pending QC</p>
            </div>
          ) : (
            pending.map(b => (
              <div key={b.id} onClick={() => { setScanCode(b.bundle_code); scan(b.bundle_code); }}
                style={{ padding: "14px 20px", borderBottom: "1px solid #f0f0f0", cursor: "pointer", transition: "background .15s" }}
                onMouseEnter={e => e.currentTarget.style.background = "#f8f9fc"}
                onMouseLeave={e => e.currentTarget.style.background = "white"}
              >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <div>
                    <div style={{ fontWeight: 700, fontFamily: "monospace", fontSize: 14 }}>{b.bundle_code}</div>
                    <div style={{ color: "#6c757d", fontSize: 12, marginTop: 2 }}>{b.design_name} · {b.qty} pcs</div>
                  </div>
                  <span style={{ background: "#f3e5f5", color: "#7b1fa2", borderRadius: 20, padding: "3px 10px", fontSize: 12, fontWeight: 700 }}>QC Pending</span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </Layout>
  );
}

import { useState, useEffect, useRef } from "react";
import Layout from "../components/Layout";
import { useAuth } from "../context/AuthContext";
import api from "../api";
import { IndianRupee, ScanLine, CheckCircle, AlertTriangle, Clock, History } from "lucide-react";

export default function Tailor() {
  const { user } = useAuth();
  const [dashboard, setDashboard] = useState(null);
  const [history, setHistory] = useState([]);
  const [showHistory, setShowHistory] = useState(false);
  const [scanCode, setScanCode] = useState("");
  const [scanMsg, setScanMsg] = useState(null);
  const [scanning, setScanning] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const scanRef = useRef(null);
  const pollRef = useRef(null);

  const load = () => api.get("/tailor/dashboard").then(r => setDashboard(r.data));
  const loadHistory = () => api.get("/tailor/history").then(r => setHistory(r.data)).catch(() => setHistory([]));

  useEffect(() => {
    load();
    loadHistory();
    pollRef.current = setInterval(load, 15000); // live alteration feed every 15s
    return () => clearInterval(pollRef.current);
  }, []);

  useEffect(() => { if (!dashboard?.active_job) scanRef.current?.focus(); }, [dashboard]);

  const scan = async () => {
    if (!scanCode.trim()) return;
    setScanning(true);
    setScanMsg(null);
    try {
      const { data } = await api.post("/tailor/scan", { bundle_code: scanCode.trim() });
      const szTxt = data.size ? ` (${data.size})` : "";
      const text = data.is_rework
        ? `Rework started! Fix ${data.pieces_to_make} piece(s)${data.rework_reasons?.length ? " — " + data.rework_reasons.join(", ") : ""}`
        : `Started! ${data.pieces_to_make} pieces · ${data.design_name}${szTxt}`;
      setScanMsg({ type: "success", text });
      setScanCode("");
      load();
    } catch (e) {
      setScanMsg({ type: "error", text: e.response?.data?.detail || "Error scanning bundle" });
    } finally {
      setScanning(false);
    }
  };

  const submit = async (jobId) => {
    if (!window.confirm("Submit this bundle for QC?")) return;
    setSubmitting(true);
    try {
      await api.post(`/tailor/submit/${jobId}`);
      load();
      loadHistory();
    } catch (e) {
      alert(e.response?.data?.detail || "Error");
    } finally {
      setSubmitting(false);
    }
  };

  const API = process.env.REACT_APP_API_URL;
  const d = dashboard;

  return (
    <Layout>
      <div style={{ maxWidth: 480, margin: "0 auto" }}>

        {/* Earnings Card */}
        <div style={{
          background: "linear-gradient(135deg,#1a1a2e,#0f3460)", color: "white",
          borderRadius: 20, padding: "24px 20px", marginBottom: 16,
        }}>
          <p style={{ margin: "0 0 4px", opacity: 0.7, fontSize: 13 }}>Hello, {user?.name} 👋</p>
          <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 2 }}>
            <IndianRupee size={28} />
            <span style={{ fontSize: 36, fontWeight: 900, letterSpacing: -1 }}>
              {(d?.total_earnings || 0).toLocaleString("en-IN")}
            </span>
          </div>
          <p style={{ margin: 0, opacity: 0.7, fontSize: 13 }}>Total Earnings · {d?.total_pieces || 0} pieces passed</p>
        </div>

        {/* Active Bundle or Scan */}
        {d?.active_job ? (
          <div style={{ background: "white", borderRadius: 16, boxShadow: "0 2px 12px rgba(0,0,0,0.08)", overflow: "hidden", marginBottom: 16 }}>
            <div style={{ background: d.active_job.is_rework ? "#ffe0e3" : "#fff8e1", padding: "10px 16px", display: "flex", alignItems: "center", gap: 8 }}>
              <Clock size={14} color={d.active_job.is_rework ? "#b71c1c" : "#f57f17"} />
              <span style={{ fontSize: 13, fontWeight: 700, color: d.active_job.is_rework ? "#b71c1c" : "#f57f17" }}>{d.active_job.is_rework ? "Rework In Progress" : "In Progress"}</span>
              <span style={{ fontSize: 12, color: "#6c757d", marginLeft: "auto" }}>{d.active_job.bundle_code}</span>
            </div>
            {d.active_job.image_url && (
              <img src={`${API}${d.active_job.image_url}`} alt="" style={{ width: "100%", maxHeight: 220, objectFit: "cover" }} />
            )}
            <div style={{ padding: 16 }}>
              <h3 style={{ margin: "0 0 4px", fontWeight: 800 }}>{d.active_job.design_name}</h3>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
                <span style={{ fontFamily: "monospace", fontSize: 13, color: "#6c757d" }}>{d.active_job.design_code}</span>
                {d.active_job.size && <span style={{ background: "#eef2ff", color: "#283593", borderRadius: 6, padding: "2px 10px", fontSize: 13, fontWeight: 800 }}>Size {d.active_job.size}</span>}
              </div>
              {d.active_job.is_rework && d.active_job.rework_reasons?.length > 0 && (
                <div style={{ background: "#fff5f7", borderLeft: "3px solid #e94560", borderRadius: "0 8px 8px 0", padding: "8px 12px", marginBottom: 12, fontSize: 13, color: "#b71c1c" }}>
                  Fix these: {d.active_job.rework_reasons.join(", ")}
                </div>
              )}
              <div style={{ display: "flex", gap: 20, marginBottom: 16 }}>
                <div><div style={{ fontWeight: 800, fontSize: 20 }}>{d.active_job.pieces_to_make}</div><div style={{ fontSize: 12, color: "#6c757d" }}>{d.active_job.is_rework ? "To fix" : "Pieces"}</div></div>
                <div><div style={{ fontWeight: 800, fontSize: 20, color: "#1b5e20" }}>₹{d.active_job.stitch_rate}</div><div style={{ fontSize: 12, color: "#6c757d" }}>Per piece</div></div>
                <div><div style={{ fontWeight: 800, fontSize: 20, color: "#0f3460" }}>₹{d.active_job.pieces_to_make * d.active_job.stitch_rate}</div><div style={{ fontSize: 12, color: "#6c757d" }}>{d.active_job.is_rework ? "To earn" : "Potential"}</div></div>
              </div>
              <button onClick={() => submit(d.active_job.job_id)} disabled={submitting} style={{
                background: "#1b5e20", color: "white", border: "none", borderRadius: 12,
                padding: "13px", fontWeight: 700, fontSize: 15, width: "100%", cursor: "pointer",
              }}>
                <CheckCircle size={16} style={{ marginRight: 6 }} />
                {submitting ? "Submitting..." : "Submit for QC"}
              </button>
            </div>
          </div>
        ) : (
          <div style={{ background: "white", borderRadius: 16, boxShadow: "0 2px 12px rgba(0,0,0,0.08)", padding: 20, marginBottom: 16 }}>
            <h3 style={{ margin: "0 0 14px", fontWeight: 700, fontSize: 15, display: "flex", alignItems: "center", gap: 8 }}>
              <ScanLine size={16} color="#e94560" /> Scan Bundle QR Code
            </h3>
            {scanMsg && (
              <div style={{ background: scanMsg.type === "success" ? "#d1f5ea" : "#ffe0e3", borderRadius: 8, padding: "8px 12px", marginBottom: 12, fontSize: 13, color: scanMsg.type === "success" ? "#1b5e20" : "#b71c1c" }}>
                {scanMsg.text}
              </div>
            )}
            <input ref={scanRef} value={scanCode} onChange={e => setScanCode(e.target.value.toUpperCase())}
              onKeyDown={e => e.key === "Enter" && scan()}
              placeholder="e.g. SK-001-B001" style={{
                width: "100%", border: "2px solid #dee2e6", borderRadius: 12,
                padding: "12px", fontSize: 16, fontWeight: 700, outline: "none",
                boxSizing: "border-box", textAlign: "center", letterSpacing: 1,
              }} />
            <button onClick={scan} disabled={scanning || !scanCode} style={{
              background: "#e94560", color: "white", border: "none", borderRadius: 12,
              padding: "12px", fontWeight: 700, fontSize: 14, width: "100%",
              marginTop: 10, cursor: "pointer", opacity: scanning || !scanCode ? 0.6 : 1,
            }}>
              {scanning ? "Scanning..." : "Start Working"}
            </button>
            <p style={{ fontSize: 12, color: "#adb5bd", textAlign: "center", marginTop: 8, marginBottom: 0 }}>
              You can work on one bundle at a time
            </p>
          </div>
        )}

        {/* Alteration Feed */}
        <div style={{ background: "white", borderRadius: 16, boxShadow: "0 2px 12px rgba(0,0,0,0.08)", overflow: "hidden" }}>
          <div style={{ padding: "14px 16px", borderBottom: "1px solid #f0f0f0", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, display: "flex", alignItems: "center", gap: 6 }}>
              <AlertTriangle size={15} color="#e94560" /> Alteration Feedback
            </h3>
            {d?.alterations?.length > 0 && (
              <span style={{ background: "#e94560", color: "white", borderRadius: 20, padding: "2px 8px", fontSize: 12, fontWeight: 700 }}>
                {d.alterations.length}
              </span>
            )}
          </div>
          <div style={{ padding: 12 }}>
            {d?.alterations?.length === 0 || !d?.alterations ? (
              <div style={{ textAlign: "center", padding: "24px 0", color: "#adb5bd" }}>
                <CheckCircle size={32} color="#1b5e20" style={{ opacity: 0.4 }} />
                <p style={{ marginTop: 8, fontSize: 13 }}>No alterations — great work!</p>
              </div>
            ) : (
              d.alterations.map((alt, i) => (
                <div key={i} style={{
                  borderLeft: "3px solid #e94560", background: "#fff5f7",
                  borderRadius: "0 10px 10px 0", padding: "10px 12px", marginBottom: 8,
                }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                    <span style={{ fontWeight: 700, fontSize: 13, fontFamily: "monospace" }}>{alt.bundle_code}</span>
                    <span style={{ fontSize: 11, color: "#6c757d" }}>
                      {new Date(alt.checked_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                    <span style={{ background: "#ffe0e3", color: "#b71c1c", borderRadius: 20, padding: "2px 8px", fontSize: 11, fontWeight: 700 }}>
                      {alt.alteration_qty} pcs to fix
                    </span>
                    {alt.reasons.map(r => (
                      <span key={r} style={{ background: "#f0f0f0", color: "#495057", borderRadius: 20, padding: "2px 8px", fontSize: 11 }}>{r}</span>
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* My Work — history */}
        <div style={{ background: "white", borderRadius: 16, boxShadow: "0 2px 12px rgba(0,0,0,0.08)", overflow: "hidden" }}>
          <div onClick={() => setShowHistory(v => !v)} style={{ padding: "14px 16px", borderBottom: showHistory ? "1px solid #f0f0f0" : "none", display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer" }}>
            <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, display: "flex", alignItems: "center", gap: 6 }}>
              <History size={15} color="#283593" /> My Work
            </h3>
            <span style={{ fontSize: 12, color: "#6c757d", fontWeight: 700 }}>{history.length} bundles · tap to {showHistory ? "hide" : "view"}</span>
          </div>
          {showHistory && (
            <div style={{ padding: 12 }}>
              {history.length === 0 ? (
                <div style={{ textAlign: "center", padding: "24px 0", color: "#adb5bd", fontSize: 13 }}>No completed bundles yet</div>
              ) : (
                history.map(h => (
                  <div key={h.job_id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 8px", borderBottom: "1px solid #f5f5f5" }}>
                    {h.image_url
                      ? <img src={`${API}${h.image_url}`} alt="" style={{ width: 40, height: 40, objectFit: "cover", borderRadius: 8, border: "1px solid #dee2e6" }} />
                      : <div style={{ width: 40, height: 40, background: "#f0f0f0", borderRadius: 8 }} />}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                        <span style={{ fontWeight: 700, fontSize: 13, fontFamily: "monospace" }}>{h.bundle_code}</span>
                        {h.size && <span style={{ background: "#eef2ff", color: "#283593", borderRadius: 5, padding: "1px 7px", fontSize: 11, fontWeight: 700 }}>{h.size}</span>}
                      </div>
                      <div style={{ fontSize: 12, color: "#6c757d" }}>
                        {h.design_name} · {h.qty} pcs{h.passed ? ` · ${h.passed} passed` : ""}
                        {h.submitted_at ? ` · ${new Date(h.submitted_at).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}` : ""}
                      </div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontWeight: 800, color: "#1b5e20", fontSize: 14 }}>₹{h.earned}</div>
                      <div style={{ fontSize: 10.5, color: "#adb5bd" }}>earned</div>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}
import { useState, useEffect, useRef } from "react";
import Layout from "../components/Layout";
import api from "../api";
import { Flame, ScanLine, CheckCircle, Package } from "lucide-react";

export default function Ironing() {
  const [pending, setPending] = useState([]);
  const [scanCode, setScanCode] = useState("");
  const [bundle, setBundle] = useState(null);
  const [msg, setMsg] = useState(null);
  const [loading, setLoading] = useState(false);
  const scanRef = useRef(null);

  const loadPending = () => api.get("/ironing/pending").then(r => setPending(r.data));
  useEffect(() => { loadPending(); }, []);
  useEffect(() => { if (!bundle) scanRef.current?.focus(); }, [bundle]);

  const scan = async (code) => {
    const c = (code || scanCode).trim().toUpperCase();
    if (!c) return;
    setMsg(null);
    try {
      const { data } = await api.post("/ironing/scan", { bundle_code: c });
      setBundle(data);
      setScanCode("");
    } catch (e) {
      setMsg({ type: "error", text: e.response?.data?.detail || "Bundle not found" });
    }
  };

  const submit = async () => {
    if (!bundle) return;
    setLoading(true);
    try {
      await api.post("/ironing/submit", { bundle_id: bundle.id });
      setMsg({ type: "success", text: `✅ ${bundle.bundle_code} marked as ironed!` });
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

  return (
    <Layout>
      <h2 style={{ fontWeight: 900, marginBottom: 4 }}>Ironing Station</h2>
      <p style={{ color: "#6c757d", marginBottom: 20, fontSize: 14 }}>
        <Flame size={14} style={{ marginRight: 4, color: "#e94560" }} />
        {pending.length} bundles ready for ironing
      </p>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(300px,420px) 1fr", gap: 20, alignItems: "start" }}>

        {/* Scan + Confirm */}
        <div style={{ background: "white", borderRadius: 16, boxShadow: "0 2px 12px rgba(0,0,0,0.06)", overflow: "hidden" }}>
          <div style={{ background: "linear-gradient(135deg,#1a1a2e,#0f3460)", color: "white", padding: "14px 20px" }}>
            <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>
              <ScanLine size={15} style={{ marginRight: 6 }} />Scan Bundle
            </h3>
          </div>
          <div style={{ padding: 20 }}>
            {msg && (
              <div style={{
                background: msg.type === "success" ? "#d1f5ea" : "#ffe0e3",
                borderRadius: 8, padding: "10px 14px", marginBottom: 14, fontSize: 13,
                color: msg.type === "success" ? "#1b5e20" : "#b71c1c"
              }}>{msg.text}</div>
            )}

            <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
              <input
                ref={scanRef}
                value={scanCode}
                onChange={e => setScanCode(e.target.value.toUpperCase())}
                onKeyDown={e => e.key === "Enter" && scan()}
                placeholder="Bundle code e.g. SK-001-B001"
                style={{ flex: 1, border: "1.5px solid #dee2e6", borderRadius: 10, padding: "10px 12px", fontSize: 13, outline: "none" }}
              />
              <button onClick={() => scan()} style={{
                background: "#e94560", color: "white", border: "none",
                borderRadius: 10, padding: "10px 14px", fontWeight: 700, cursor: "pointer", fontSize: 13,
              }}>Scan</button>
            </div>

            {bundle && (
              <div>
                <div style={{ background: "#f0f7ff", border: "1px solid #cce0ff", borderRadius: 10, padding: 14, marginBottom: 16 }}>
                  {bundle.image_url && (
                    <img src={`${API}${bundle.image_url}`} alt="" style={{ width: "100%", maxHeight: 160, objectFit: "cover", borderRadius: 8, marginBottom: 10 }} />
                  )}
                  <div style={{ fontWeight: 800, fontFamily: "monospace", fontSize: 15 }}>{bundle.bundle_code}</div>
                  <div style={{ color: "#6c757d", fontSize: 13, marginTop: 2 }}>{bundle.design_name}</div>
                  <div style={{ display: "flex", gap: 20, marginTop: 10 }}>
                    <div><div style={{ fontWeight: 800, fontSize: 20 }}>{bundle.qty}</div><div style={{ fontSize: 12, color: "#6c757d" }}>Pieces</div></div>
                    <div>
                      <div style={{ background: "#d1f5ea", color: "#1b5e20", borderRadius: 20, padding: "2px 10px", fontSize: 12, fontWeight: 700, marginTop: 4 }}>
                        QC Passed ✓
                      </div>
                    </div>
                  </div>
                </div>
                <button onClick={submit} disabled={loading} style={{
                  background: "#1a1a2e", color: "white", border: "none", borderRadius: 12,
                  padding: "13px", fontWeight: 700, fontSize: 15, width: "100%", cursor: "pointer",
                  opacity: loading ? 0.7 : 1,
                }}>
                  <Flame size={16} style={{ marginRight: 6 }} />
                  {loading ? "Saving..." : "Mark as Ironed"}
                </button>
                <button onClick={() => { setBundle(null); setScanCode(""); }} style={{
                  background: "none", border: "1px solid #dee2e6", borderRadius: 10,
                  padding: "8px", width: "100%", marginTop: 8, cursor: "pointer", fontSize: 13, color: "#6c757d",
                }}>Cancel</button>
              </div>
            )}
          </div>
        </div>

        {/* Pending List */}
        <div style={{ background: "white", borderRadius: 16, boxShadow: "0 2px 12px rgba(0,0,0,0.06)", overflow: "hidden" }}>
          <div style={{ background: "linear-gradient(135deg,#1a1a2e,#0f3460)", color: "white", padding: "14px 20px" }}>
            <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>
              <Package size={15} style={{ marginRight: 6 }} />Ready for Ironing ({pending.length})
            </h3>
          </div>
          {pending.length === 0 ? (
            <div style={{ textAlign: "center", padding: 48, color: "#adb5bd" }}>
              <CheckCircle size={40} color="#1b5e20" style={{ opacity: 0.4 }} />
              <p style={{ marginTop: 12, fontSize: 14 }}>No bundles waiting — all clear!</p>
            </div>
          ) : (
            pending.map(b => (
              <div key={b.id}
                onClick={() => { setScanCode(b.bundle_code); scan(b.bundle_code); }}
                style={{ padding: "14px 20px", borderBottom: "1px solid #f0f0f0", cursor: "pointer", transition: "background .15s" }}
                onMouseEnter={e => e.currentTarget.style.background = "#f8f9fc"}
                onMouseLeave={e => e.currentTarget.style.background = "white"}
              >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    {b.image_url
                      ? <img src={`${API}${b.image_url}`} alt="" style={{ width: 40, height: 40, objectFit: "cover", borderRadius: 8, border: "1px solid #dee2e6" }} />
                      : <div style={{ width: 40, height: 40, background: "#f0f0f0", borderRadius: 8 }} />
                    }
                    <div>
                      <div style={{ fontWeight: 700, fontFamily: "monospace", fontSize: 13 }}>{b.bundle_code}</div>
                      <div style={{ color: "#6c757d", fontSize: 12 }}>{b.design_name} · {b.qty} pcs</div>
                    </div>
                  </div>
                  <span style={{ background: "#d1f5ea", color: "#1b5e20", borderRadius: 20, padding: "3px 10px", fontSize: 12, fontWeight: 700 }}>
                    QC Passed
                  </span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </Layout>
  );
}

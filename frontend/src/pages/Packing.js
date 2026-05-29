import { useState, useEffect, useRef } from "react";
import Layout from "../components/Layout";
import api from "../api";
import { Package, ScanLine, CheckCircle, BarChart2 } from "lucide-react";

const SIZES = ["XS", "S", "M", "L", "XL", "XXL"];

export default function Packing() {
  const [pending, setPending] = useState([]);
  const [summary, setSummary] = useState([]);
  const [scanCode, setScanCode] = useState("");
  const [bundle, setBundle] = useState(null);
  const [sizes, setSizes] = useState({});
  const [cartonNo, setCartonNo] = useState("");
  const [msg, setMsg] = useState(null);
  const [loading, setLoading] = useState(false);
  const [view, setView] = useState("scan"); // scan | summary
  const scanRef = useRef(null);

  const loadData = () => {
    api.get("/packing/pending").then(r => setPending(r.data));
    api.get("/packing/summary").then(r => setSummary(r.data));
  };
  useEffect(() => { loadData(); }, []);
  useEffect(() => { if (!bundle) scanRef.current?.focus(); }, [bundle]);

  const scan = async (code) => {
    const c = (code || scanCode).trim().toUpperCase();
    if (!c) return;
    setMsg(null);
    try {
      const { data } = await api.post("/packing/scan", { bundle_code: c });
      setBundle(data);
      setSizes({});
      setCartonNo("");
      setScanCode("");
    } catch (e) {
      setMsg({ type: "error", text: e.response?.data?.detail || "Bundle not found" });
    }
  };

  const totalSizes = Object.values(sizes).reduce((a, b) => a + (parseInt(b) || 0), 0);

  const submit = async () => {
    setLoading(true);
    try {
      await api.post("/packing/submit", {
        bundle_id: bundle.id,
        sizes: Object.fromEntries(Object.entries(sizes).map(([k, v]) => [k, parseInt(v) || 0])),
        carton_no: cartonNo,
      });
      setMsg({ type: "success", text: `✅ ${bundle.bundle_code} packed! ${bundle.qty} pieces.` });
      setBundle(null);
      setSizes({});
      setCartonNo("");
      loadData();
    } catch (e) {
      setMsg({ type: "error", text: e.response?.data?.detail || "Error" });
    } finally {
      setLoading(false);
    }
  };

  const API = process.env.REACT_APP_API_URL;

  return (
    <Layout>
      <h2 style={{ fontWeight: 900, marginBottom: 4 }}>Packing Station</h2>
      <p style={{ color: "#6c757d", marginBottom: 16, fontSize: 14 }}>
        <Package size={14} style={{ marginRight: 4, color: "#e94560" }} />
        {pending.length} bundles ready to pack · {summary.reduce((a, b) => a + b.total_pieces, 0)} pieces packed total
      </p>

      {/* Tab toggle */}
      <div style={{ display: "flex", gap: 4, marginBottom: 20, background: "white", borderRadius: 12, padding: 4, boxShadow: "0 2px 8px rgba(0,0,0,0.05)", width: "fit-content" }}>
        {[["scan", "Scan & Pack"], ["summary", "Packing Summary"]].map(([key, label]) => (
          <button key={key} onClick={() => setView(key)} style={{
            background: view === key ? "#1a1a2e" : "transparent",
            color: view === key ? "white" : "#6c757d",
            border: "none", borderRadius: 9, padding: "8px 18px",
            fontWeight: 700, fontSize: 13, cursor: "pointer",
          }}>{label}</button>
        ))}
      </div>

      {view === "scan" && (
        <div style={{ display: "grid", gridTemplateColumns: "minmax(300px,440px) 1fr", gap: 20, alignItems: "start" }}>

          {/* Scan + Form */}
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
                  color: msg.type === "success" ? "#1b5e20" : "#b71c1c",
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
                      <img src={`${API}${bundle.image_url}`} alt="" style={{ width: "100%", maxHeight: 140, objectFit: "cover", borderRadius: 8, marginBottom: 8 }} />
                    )}
                    <div style={{ fontWeight: 800, fontFamily: "monospace" }}>{bundle.bundle_code}</div>
                    <div style={{ color: "#6c757d", fontSize: 13 }}>{bundle.design_name} · {bundle.qty} pcs</div>
                  </div>

                  {/* Size Breakup */}
                  <div style={{ marginBottom: 14 }}>
                    <label style={{ fontSize: 12, fontWeight: 700, color: "#495057", display: "block", marginBottom: 8 }}>
                      Size Breakup <span style={{ color: "#adb5bd", fontWeight: 400 }}>(optional — leave blank if not applicable)</span>
                    </label>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 8 }}>
                      {SIZES.map(s => (
                        <div key={s}>
                          <label style={{ fontSize: 11, fontWeight: 700, color: "#6c757d", display: "block", marginBottom: 2 }}>{s}</label>
                          <input
                            type="number" min="0" value={sizes[s] || ""}
                            onChange={e => setSizes(prev => ({ ...prev, [s]: e.target.value }))}
                            style={{ width: "100%", border: "1.5px solid #dee2e6", borderRadius: 8, padding: "8px", fontSize: 14, fontWeight: 700, outline: "none", boxSizing: "border-box", textAlign: "center" }}
                            placeholder="0"
                          />
                        </div>
                      ))}
                    </div>
                    {totalSizes > 0 && (
                      <div style={{ marginTop: 8, fontSize: 12, color: totalSizes === bundle.qty ? "#1b5e20" : "#f57f17", fontWeight: 700 }}>
                        {totalSizes === bundle.qty ? "✓ Sizes match bundle qty" : `⚠ Total ${totalSizes} ≠ bundle qty ${bundle.qty}`}
                      </div>
                    )}
                  </div>

                  {/* Carton No */}
                  <div style={{ marginBottom: 16 }}>
                    <label style={{ fontSize: 12, fontWeight: 700, color: "#495057", display: "block", marginBottom: 4 }}>
                      Carton No. <span style={{ color: "#adb5bd", fontWeight: 400 }}>(optional)</span>
                    </label>
                    <input
                      value={cartonNo}
                      onChange={e => setCartonNo(e.target.value)}
                      placeholder="e.g. CTN-001"
                      style={{ width: "100%", border: "1.5px solid #dee2e6", borderRadius: 10, padding: "10px 12px", fontSize: 13, outline: "none", boxSizing: "border-box" }}
                    />
                  </div>

                  <button onClick={submit} disabled={loading} style={{
                    background: "#1a1a2e", color: "white", border: "none", borderRadius: 12,
                    padding: "13px", fontWeight: 700, fontSize: 15, width: "100%", cursor: "pointer",
                    opacity: loading ? 0.7 : 1,
                  }}>
                    <Package size={16} style={{ marginRight: 6 }} />
                    {loading ? "Saving..." : "Mark as Packed"}
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
              <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>Ready for Packing ({pending.length})</h3>
            </div>
            {pending.length === 0 ? (
              <div style={{ textAlign: "center", padding: 48, color: "#adb5bd" }}>
                <CheckCircle size={40} color="#1b5e20" style={{ opacity: 0.4 }} />
                <p style={{ marginTop: 12, fontSize: 14 }}>No bundles waiting</p>
              </div>
            ) : (
              pending.map(b => (
                <div key={b.id}
                  onClick={() => { setScanCode(b.bundle_code); scan(b.bundle_code); }}
                  style={{ padding: "14px 20px", borderBottom: "1px solid #f0f0f0", cursor: "pointer" }}
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
                    <span style={{ background: "#e8f4fd", color: "#1565c0", borderRadius: 20, padding: "3px 10px", fontSize: 12, fontWeight: 700 }}>Ironed ✓</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Packing Summary */}
      {view === "summary" && (
        <div style={{ background: "white", borderRadius: 16, boxShadow: "0 2px 12px rgba(0,0,0,0.06)", overflow: "hidden" }}>
          <div style={{ background: "linear-gradient(135deg,#1a1a2e,#0f3460)", color: "white", padding: "14px 20px" }}>
            <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>
              <BarChart2 size={15} style={{ marginRight: 6 }} />Packed Stock Summary
            </h3>
          </div>
          {summary.length === 0 ? (
            <div style={{ textAlign: "center", padding: 48, color: "#adb5bd" }}>
              <Package size={40} style={{ opacity: 0.3 }} />
              <p style={{ marginTop: 12, fontSize: 14 }}>No packed stock yet</p>
            </div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
                <thead>
                  <tr style={{ background: "#f8f9fc" }}>
                    {["Design", "Code", "Bundles", "Total Pieces"].map(h => (
                      <th key={h} style={{ padding: "10px 16px", textAlign: "left", fontSize: 12, fontWeight: 700, color: "#6c757d" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {summary.map((s, i) => (
                    <tr key={i} style={{ borderTop: "1px solid #f0f0f0" }}>
                      <td style={{ padding: "12px 16px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          {s.image_url
                            ? <img src={`${API}${s.image_url}`} alt="" style={{ width: 36, height: 36, objectFit: "cover", borderRadius: 6, border: "1px solid #dee2e6" }} />
                            : <div style={{ width: 36, height: 36, background: "#f0f0f0", borderRadius: 6 }} />
                          }
                          <span style={{ fontWeight: 600 }}>{s.design_name}</span>
                        </div>
                      </td>
                      <td style={{ padding: "12px 16px", fontFamily: "monospace", fontSize: 13 }}>{s.design_code}</td>
                      <td style={{ padding: "12px 16px" }}>{s.bundles}</td>
                      <td style={{ padding: "12px 16px", fontWeight: 800, fontSize: 16, color: "#1b5e20" }}>{s.total_pieces}</td>
                    </tr>
                  ))}
                  <tr style={{ background: "#f8f9fc", borderTop: "2px solid #dee2e6" }}>
                    <td colSpan={3} style={{ padding: "12px 16px", fontWeight: 800 }}>Total Packed</td>
                    <td style={{ padding: "12px 16px", fontWeight: 900, fontSize: 18, color: "#e94560" }}>
                      {summary.reduce((a, b) => a + b.total_pieces, 0)} pcs
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </Layout>
  );
}

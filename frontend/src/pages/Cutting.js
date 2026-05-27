import { useState, useEffect } from "react";
import Layout from "../components/Layout";
import api from "../api";
import { Scissors, QrCode, Printer, ChevronRight } from "lucide-react";

const STATUS_STYLE = {
  cut: { background: "#e8f4fd", color: "#1565c0" },
  in_progress: { background: "#fff8e1", color: "#f57f17" },
  qc_pending: { background: "#f3e5f5", color: "#7b1fa2" },
  passed: { background: "#d1f5ea", color: "#1b5e20" },
  alteration: { background: "#ffe0e3", color: "#b71c1c" },
};

export default function Cutting() {
  const [designs, setDesigns] = useState([]);
  const [selected, setSelected] = useState(null);
  const [bundles, setBundles] = useState([]);
  const [cutQty, setCutQty] = useState("");
  const [bundleSize, setBundleSize] = useState(10);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => { api.get("/designs/").then(r => setDesigns(r.data)); }, []);

  const loadBundles = (designId) => {
    api.get(`/bundles/?design_id=${designId}`).then(r => setBundles(r.data));
  };

  const selectDesign = (d) => { setSelected(d); loadBundles(d.id); setMsg(""); };

  const preview = () => {
    const qty = parseInt(cutQty) || 0;
    const size = parseInt(bundleSize) || 10;
    if (!qty) return null;
    const full = Math.floor(qty / size);
    const rem = qty % size;
    return { qty, full, rem, total: full + (rem > 0 ? 1 : 0) };
  };

  const recordCut = async (e) => {
    e.preventDefault();
    if (!selected) return;
    setLoading(true);
    setMsg("");
    try {
      const { data } = await api.post("/bundles/cut", {
        design_id: selected.id,
        cut_qty: parseInt(cutQty),
        bundle_size: parseInt(bundleSize),
      });
      setMsg(`✅ ${data.created} bundles created!`);
      setCutQty("");
      loadBundles(selected.id);
    } catch (e) {
      setMsg(e.response?.data?.detail || "Error");
    } finally {
      setLoading(false);
    }
  };

  const p = preview();
  const API = process.env.REACT_APP_API_URL;

  return (
    <Layout>
      <h2 style={{ fontWeight: 900, marginBottom: 4 }}>Cutting Station</h2>
      <p style={{ color: "#6c757d", marginBottom: 20, fontSize: 14 }}>Record fabric cuts and generate bundle QR codes</p>

      <div style={{ display: "grid", gridTemplateColumns: "260px 1fr", gap: 20, alignItems: "start" }}>

        {/* Design Selector */}
        <div style={{ background: "white", borderRadius: 16, boxShadow: "0 2px 12px rgba(0,0,0,0.06)", overflow: "hidden" }}>
          <div style={{ background: "linear-gradient(135deg,#1a1a2e,#0f3460)", color: "white", padding: "14px 16px" }}>
            <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700 }}>Select Design</h3>
          </div>
          {designs.map(d => (
            <div key={d.id} onClick={() => selectDesign(d)} style={{
              padding: "12px 16px", cursor: "pointer", borderBottom: "1px solid #f0f0f0",
              background: selected?.id === d.id ? "#f0f5ff" : "white",
              borderLeft: selected?.id === d.id ? "3px solid #e94560" : "3px solid transparent",
              transition: "all .15s",
            }}>
              <div style={{ fontWeight: 600, fontSize: 13 }}>{d.design_name}</div>
              <div style={{ color: "#6c757d", fontSize: 11, marginTop: 2 }}>{d.design_code} · ₹{d.stitch_rate}/pc</div>
            </div>
          ))}
        </div>

        {/* Cut Form + Bundles */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {selected && (
            <div style={{ background: "white", borderRadius: 16, boxShadow: "0 2px 12px rgba(0,0,0,0.06)", overflow: "hidden" }}>
              <div style={{ background: "linear-gradient(135deg,#1a1a2e,#0f3460)", color: "white", padding: "14px 20px" }}>
                <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}><Scissors size={15} style={{ marginRight: 6 }} />Record Cut — {selected.design_name}</h3>
              </div>
              <form onSubmit={recordCut} style={{ padding: 20 }}>
                {msg && <div style={{ background: msg.startsWith("✅") ? "#d1f5ea" : "#ffe0e3", borderRadius: 8, padding: "8px 12px", marginBottom: 14, fontSize: 13, color: msg.startsWith("✅") ? "#1b5e20" : "#b71c1c" }}>{msg}</div>}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
                  <div>
                    <label style={{ fontSize: 12, fontWeight: 700, color: "#495057", display: "block", marginBottom: 4 }}>Pieces Cut</label>
                    <input type="number" value={cutQty} onChange={e => setCutQty(e.target.value)} min="1" required
                      style={{ width: "100%", border: "1.5px solid #dee2e6", borderRadius: 10, padding: "12px", fontSize: 20, fontWeight: 800, outline: "none", boxSizing: "border-box" }} placeholder="100" />
                  </div>
                  <div>
                    <label style={{ fontSize: 12, fontWeight: 700, color: "#495057", display: "block", marginBottom: 4 }}>Bundle Size</label>
                    <input type="number" value={bundleSize} onChange={e => setBundleSize(e.target.value)} min="1"
                      style={{ width: "100%", border: "1.5px solid #dee2e6", borderRadius: 10, padding: "12px", fontSize: 20, fontWeight: 800, outline: "none", boxSizing: "border-box" }} />
                  </div>
                </div>

                {p && (
                  <div style={{ background: "#f8f9fc", border: "1px dashed #dee2e6", borderRadius: 10, padding: 16, marginBottom: 16, display: "flex", justifyContent: "space-around", textAlign: "center" }}>
                    {[["Pieces", p.qty, "#1565c0"], ["Bundles", p.total, "#1b5e20"], p.full > 0 && [`${p.full}×${bundleSize}`, "Full", "#f57f17"], p.rem > 0 && [`1×${p.rem}`, "Partial", "#7b1fa2"]].filter(Boolean).map(([val, label, color]) => (
                      <div key={label}>
                        <div style={{ fontSize: 24, fontWeight: 900, color }}>{val}</div>
                        <div style={{ fontSize: 11, color: "#6c757d" }}>{label}</div>
                      </div>
                    ))}
                  </div>
                )}

                <button type="submit" disabled={loading || !cutQty} style={{
                  background: "#e94560", color: "white", border: "none", borderRadius: 10,
                  padding: "12px 20px", fontWeight: 700, cursor: "pointer", fontSize: 14,
                  width: "100%", opacity: loading || !cutQty ? 0.6 : 1,
                }}>
                  <QrCode size={16} style={{ marginRight: 6 }} />
                  {loading ? "Generating..." : "Generate Bundles & QR Codes"}
                </button>
              </form>
            </div>
          )}

          {/* Bundles Table */}
          {selected && bundles.length > 0 && (
            <div style={{ background: "white", borderRadius: 16, boxShadow: "0 2px 12px rgba(0,0,0,0.06)", overflow: "hidden" }}>
              <div style={{ background: "linear-gradient(135deg,#1a1a2e,#0f3460)", color: "white", padding: "14px 20px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>Bundles ({bundles.length})</h3>
                <button onClick={() => window.print()} style={{ background: "rgba(255,255,255,0.15)", border: "none", borderRadius: 8, color: "white", padding: "6px 12px", cursor: "pointer", fontSize: 12, fontWeight: 600 }}>
                  <Printer size={13} style={{ marginRight: 4 }} />Print All QR
                </button>
              </div>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: "#f8f9fc" }}>
                      {["Bundle Code", "Qty", "Status", "QR Code"].map(h => (
                        <th key={h} style={{ padding: "10px 16px", textAlign: "left", fontSize: 12, fontWeight: 700, color: "#6c757d" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {bundles.map((b, i) => (
                      <tr key={b.id} style={{ borderTop: "1px solid #f0f0f0" }}>
                        <td style={{ padding: "10px 16px", fontFamily: "monospace", fontWeight: 700 }}>{b.bundle_code}</td>
                        <td style={{ padding: "10px 16px" }}>{b.qty} pcs</td>
                        <td style={{ padding: "10px 16px" }}>
                          <span style={{ ...(STATUS_STYLE[b.status] || {}), borderRadius: 20, padding: "2px 10px", fontSize: 12, fontWeight: 700 }}>
                            {b.status.replace("_", " ")}
                          </span>
                        </td>
                        <td style={{ padding: "10px 16px" }}>
                          <img src={`${API}${b.qr_url}`} alt={b.bundle_code}
                            style={{ width: 64, height: 64, border: "1px solid #dee2e6", borderRadius: 8, cursor: "pointer" }}
                            onClick={() => window.open(`${API}${b.qr_url}`, "_blank")} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {!selected && (
            <div style={{ background: "white", borderRadius: 16, padding: 48, textAlign: "center", color: "#adb5bd", boxShadow: "0 2px 12px rgba(0,0,0,0.06)" }}>
              <Scissors size={40} style={{ opacity: 0.3 }} />
              <p style={{ marginTop: 12 }}>Select a design from the left to begin</p>
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}

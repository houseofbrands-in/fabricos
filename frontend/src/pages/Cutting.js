import { useState, useEffect } from "react";
import Layout from "../components/Layout";
import api from "../api";
import { Scissors, QrCode, Printer, Layers, AlertTriangle } from "lucide-react";

const STATUS_STYLE = {
  cut: { background: "#e8f4fd", color: "#1565c0" },
  in_progress: { background: "#fff8e1", color: "#f57f17" },
  qc_pending: { background: "#f3e5f5", color: "#7b1fa2" },
  passed: { background: "#d1f5ea", color: "#1b5e20" },
  alteration: { background: "#ffe0e3", color: "#b71c1c" },
  ironing: { background: "#e0f7fa", color: "#00838f" },
  packed: { background: "#e8eaf6", color: "#283593" },
};

export default function Cutting() {
  const [designs, setDesigns] = useState([]);
  const [selected, setSelected] = useState(null);
  const [bundles, setBundles] = useState([]);
  const [progress, setProgress] = useState(null);
  const [cutBySize, setCutBySize] = useState({});   // size -> qty to cut now
  const [legacyQty, setLegacyQty] = useState("");   // for designs with no size plan
  const [bundleSize, setBundleSize] = useState(10);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");
  const [fabrics, setFabrics] = useState([]);

  const loadDesigns = () => api.get("/designs/").then(r => setDesigns(r.data));
  const loadFabrics = () => api.get("/fabric/").then(r => setFabrics(r.data)).catch(() => setFabrics([]));
  useEffect(() => { loadDesigns(); loadFabrics(); }, []);

  const selFabric = selected && selected.fabric_id ? fabrics.find(f => f.id === selected.fabric_id) : null;

  const loadBundles = (id) => api.get(`/bundles/?design_id=${id}`).then(r => setBundles(r.data));
  const loadProgress = (id) => api.get(`/bundles/cut-progress?design_id=${id}`).then(r => setProgress(r.data));

  const selectDesign = (d) => { setSelected(d); setMsg(""); setCutBySize({}); setLegacyQty(""); loadBundles(d.id); loadProgress(d.id); };

  const totalToCut = progress && progress.has_plan
    ? Object.values(cutBySize).reduce((a, v) => a + (parseInt(v) || 0), 0)
    : (parseInt(legacyQty) || 0);
  const bsize = parseInt(bundleSize) || 10;
  const bundlesToMake = progress && progress.has_plan
    ? progress.rows.reduce((a, r) => { const q = parseInt(cutBySize[r.size]) || 0; return a + Math.ceil(q / bsize); }, 0)
    : Math.ceil((parseInt(legacyQty) || 0) / bsize);
  const metresNeeded = (selected && selected.metres_per_piece && totalToCut)
    ? +(selected.metres_per_piece * totalToCut).toFixed(2) : null;

  const recordCut = async (e) => {
    e.preventDefault();
    if (!selected || totalToCut <= 0) return;
    setLoading(true); setMsg("");
    try {
      const payload = { design_id: selected.id, bundle_size: bsize };
      if (progress && progress.has_plan) {
        payload.lines = progress.rows
          .map(r => ({ size: r.size, qty: parseInt(cutBySize[r.size]) || 0 }))
          .filter(l => l.qty > 0);
      } else {
        payload.cut_qty = parseInt(legacyQty) || 0;
      }
      const { data } = await api.post("/bundles/cut", payload);
      let m = `✅ ${data.created} bundles created (${data.pieces_cut} pcs)!`;
      if (data.fabric) {
        m += ` Fabric used: ${data.fabric.metres_consumed} m · stock left: ${data.fabric.remaining} m`;
        if (data.fabric.warning) m = `⚠️ ${data.created} bundles created, BUT ${data.fabric.warning}`;
      }
      setMsg(m); setCutBySize({}); setLegacyQty("");
      loadBundles(selected.id); loadProgress(selected.id); loadFabrics();
    } catch (e) { setMsg(e.response?.data?.detail || "Error"); }
    finally { setLoading(false); }
  };

  const API = process.env.REACT_APP_API_URL;

  return (
    <Layout>
      <h2 style={{ fontWeight: 900, marginBottom: 4 }}>Cutting Station</h2>
      <p style={{ color: "#6c757d", marginBottom: 20, fontSize: 14 }}>Cut per size and generate bundle QR codes</p>

      <div style={{ display: "grid", gridTemplateColumns: "260px 1fr", gap: 20, alignItems: "start" }}>
        <div style={{ background: "white", borderRadius: 16, boxShadow: "0 2px 12px rgba(0,0,0,0.06)", overflow: "hidden" }}>
          <div style={{ background: "linear-gradient(135deg,#1a1a2e,#0f3460)", color: "white", padding: "14px 16px" }}>
            <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700 }}>Select Design</h3>
          </div>
          {designs.map(d => (
            <div key={d.id} onClick={() => selectDesign(d)} style={{
              padding: "12px 16px", cursor: "pointer", borderBottom: "1px solid #f0f0f0",
              background: selected?.id === d.id ? "#f0f5ff" : "white",
              borderLeft: selected?.id === d.id ? "3px solid #e94560" : "3px solid transparent",
            }}>
              <div style={{ fontWeight: 600, fontSize: 13 }}>{d.design_name}</div>
              <div style={{ color: "#6c757d", fontSize: 11, marginTop: 2 }}>{d.design_code} · ₹{d.stitch_rate}/pc</div>
            </div>
          ))}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {selected && (
            <div style={{ background: "white", borderRadius: 16, boxShadow: "0 2px 12px rgba(0,0,0,0.06)", overflow: "hidden" }}>
              <div style={{ background: "linear-gradient(135deg,#1a1a2e,#0f3460)", color: "white", padding: "14px 20px" }}>
                <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}><Scissors size={15} style={{ marginRight: 6 }} />Record Cut — {selected.design_name}</h3>
              </div>
              <form onSubmit={recordCut} style={{ padding: 20 }}>
                {selected.fabric_id && (
                  <div style={{ background: selFabric && selFabric.low_stock ? "#fff8f8" : "#f8f9fc", border: "1px solid " + (selFabric && selFabric.low_stock ? "#f5c2c7" : "#e9ecef"), borderRadius: 10, padding: 12, marginBottom: 14, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
                    <div style={{ fontSize: 13, color: "#495057" }}>
                      <Layers size={14} style={{ verticalAlign: -2, marginRight: 4, color: "#5d4037" }} />
                      <b>{selected.fabric_name}</b> · {selected.metres_per_piece} m/piece
                    </div>
                    <div style={{ fontSize: 13 }}>
                      Stock: <b style={{ color: selFabric && selFabric.low_stock ? "#b71c1c" : "#1b5e20" }}>{selFabric ? selFabric.available + " m" : "…"}</b>
                      {metresNeeded != null && <span style={{ color: "#6c757d" }}> · this cut needs <b>{metresNeeded} m</b></span>}
                      {selFabric && metresNeeded != null && metresNeeded > selFabric.available &&
                        <span style={{ color: "#b71c1c", fontWeight: 700, marginLeft: 6 }}><AlertTriangle size={12} style={{ verticalAlign: -1 }} /> not enough</span>}
                    </div>
                  </div>
                )}
                {msg && <div style={{ background: msg.startsWith("✅") ? "#d1f5ea" : "#fff3cd", borderRadius: 8, padding: "8px 12px", marginBottom: 14, fontSize: 13, color: msg.startsWith("✅") ? "#1b5e20" : "#7a5b00" }}>{msg}</div>}

                {progress && progress.has_plan ? (
                  <div style={{ marginBottom: 16 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: "#495057", marginBottom: 8 }}>Cut per size (planned vs already cut)</div>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                      <thead><tr style={{ background: "#f8f9fc" }}>{["Size", "Planned", "Cut", "Left", "Cut now"].map(h => <th key={h} style={{ padding: "8px 10px", textAlign: "left", fontSize: 11, color: "#6c757d" }}>{h}</th>)}</tr></thead>
                      <tbody>
                        {progress.rows.map(r => {
                          const left = Math.max(0, r.planned - r.cut);
                          return (
                            <tr key={r.size} style={{ borderTop: "1px solid #f0f0f0" }}>
                              <td style={{ padding: "8px 10px" }}><span style={{ background: "#eef2ff", color: "#283593", borderRadius: 6, padding: "2px 9px", fontWeight: 700, fontSize: 12 }}>{r.size}</span></td>
                              <td style={{ padding: "8px 10px" }}>{r.planned}</td>
                              <td style={{ padding: "8px 10px" }}>{r.cut}</td>
                              <td style={{ padding: "8px 10px", fontWeight: 700, color: left > 0 ? "#e94560" : "#1b5e20" }}>{left}</td>
                              <td style={{ padding: "8px 10px" }}>
                                <input type="number" min="0" value={cutBySize[r.size] || ""} placeholder={left ? String(left) : "0"}
                                  onChange={e => setCutBySize(s => ({ ...s, [r.size]: e.target.value }))}
                                  style={{ width: 80, border: "1.5px solid #dee2e6", borderRadius: 8, padding: "7px 8px", fontSize: 15, fontWeight: 700, outline: "none" }} />
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div style={{ marginBottom: 16 }}>
                    <div style={{ fontSize: 12, color: "#7a5b00", background: "#fff3cd", borderRadius: 8, padding: "6px 10px", marginBottom: 10 }}>This design has no size plan — cutting the old way (no size).</div>
                    <label style={{ fontSize: 12, fontWeight: 700, color: "#495057", display: "block", marginBottom: 4 }}>Pieces Cut</label>
                    <input type="number" value={legacyQty} onChange={e => setLegacyQty(e.target.value)} min="1"
                      style={{ width: "100%", border: "1.5px solid #dee2e6", borderRadius: 10, padding: "12px", fontSize: 20, fontWeight: 800, outline: "none", boxSizing: "border-box" }} placeholder="100" />
                  </div>
                )}

                <div style={{ display: "flex", gap: 16, alignItems: "flex-end", marginBottom: 16 }}>
                  <div style={{ width: 130 }}>
                    <label style={{ fontSize: 12, fontWeight: 700, color: "#495057", display: "block", marginBottom: 4 }}>Bundle Size</label>
                    <input type="number" value={bundleSize} onChange={e => setBundleSize(e.target.value)} min="1"
                      style={{ width: "100%", border: "1.5px solid #dee2e6", borderRadius: 10, padding: "10px", fontSize: 16, fontWeight: 800, outline: "none", boxSizing: "border-box" }} />
                  </div>
                  <div style={{ flex: 1, background: "#f8f9fc", border: "1px dashed #dee2e6", borderRadius: 10, padding: "10px 16px", display: "flex", justifyContent: "space-around", textAlign: "center" }}>
                    <div><div style={{ fontSize: 22, fontWeight: 900, color: "#1565c0" }}>{totalToCut}</div><div style={{ fontSize: 11, color: "#6c757d" }}>Pieces</div></div>
                    <div><div style={{ fontSize: 22, fontWeight: 900, color: "#1b5e20" }}>{bundlesToMake}</div><div style={{ fontSize: 11, color: "#6c757d" }}>Bundles</div></div>
                  </div>
                </div>

                <button type="submit" disabled={loading || totalToCut <= 0} style={{
                  background: "#e94560", color: "white", border: "none", borderRadius: 10,
                  padding: "12px 20px", fontWeight: 700, cursor: "pointer", fontSize: 14,
                  width: "100%", opacity: loading || totalToCut <= 0 ? 0.6 : 1,
                }}>
                  <QrCode size={16} style={{ marginRight: 6 }} />
                  {loading ? "Generating..." : "Generate Bundles & QR Codes"}
                </button>
              </form>
            </div>
          )}

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
                      {["Bundle Code", "Size", "Qty", "Status", "QR Code"].map(h => (
                        <th key={h} style={{ padding: "10px 16px", textAlign: "left", fontSize: 12, fontWeight: 700, color: "#6c757d" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {bundles.map(b => (
                      <tr key={b.id} style={{ borderTop: "1px solid #f0f0f0" }}>
                        <td style={{ padding: "10px 16px", fontFamily: "monospace", fontWeight: 700 }}>{b.bundle_code}</td>
                        <td style={{ padding: "10px 16px" }}>{b.size ? <span style={{ background: "#eef2ff", color: "#283593", borderRadius: 6, padding: "2px 9px", fontWeight: 700, fontSize: 12 }}>{b.size}</span> : "—"}</td>
                        <td style={{ padding: "10px 16px" }}>{b.qty} pcs</td>
                        <td style={{ padding: "10px 16px" }}>
                          <span style={{ ...(STATUS_STYLE[b.status] || {}), borderRadius: 20, padding: "2px 10px", fontSize: 12, fontWeight: 700 }}>{b.status.replace("_", " ")}</span>
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
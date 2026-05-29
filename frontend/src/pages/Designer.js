import { useState, useEffect } from "react";
import Layout from "../components/Layout";
import api from "../api";
import { Plus, Image, Package } from "lucide-react";

const S = {
  card: { background: "white", borderRadius: 16, boxShadow: "0 2px 12px rgba(0,0,0,0.06)", overflow: "hidden" },
  header: { background: "linear-gradient(135deg,#1a1a2e,#0f3460)", color: "white", padding: "14px 20px" },
  input: { width: "100%", border: "1.5px solid #dee2e6", borderRadius: 10, padding: "10px 12px", fontSize: 14, outline: "none", boxSizing: "border-box" },
  label: { fontSize: 12, fontWeight: 700, color: "#495057", display: "block", marginBottom: 4 },
  btn: { background: "#e94560", color: "white", border: "none", borderRadius: 10, padding: "11px 20px", fontWeight: 700, cursor: "pointer", fontSize: 14 },
};

export default function Designer() {
  const [designs, setDesigns] = useState([]);
  const [fabrics, setFabrics] = useState([]);
  const [form, setForm] = useState({ design_name: "", design_code: "", stitch_rate: "", target_qty: "", fabric_id: "", metres_per_piece: "" });
  const [image, setImage] = useState(null);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");

  const load = () => api.get("/designs/").then((r) => setDesigns(r.data));
  const loadFabrics = () => api.get("/fabric/").then((r) => setFabrics(r.data)).catch(() => setFabrics([]));
  useEffect(() => { load(); loadFabrics(); }, []);

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMsg("");
    try {
      const fd = new FormData();
      Object.entries(form).forEach(([k, v]) => {
        // only send fabric fields when actually filled in
        if ((k === "fabric_id" || k === "metres_per_piece") && (v === "" || v == null)) return;
        fd.append(k, v);
      });
      if (image) fd.append("image", image);
      await api.post("/designs/", fd, { headers: { "Content-Type": "multipart/form-data" } });
      setMsg("Design created!");
      setForm({ design_name: "", design_code: "", stitch_rate: "", target_qty: "", fabric_id: "", metres_per_piece: "" });
      setImage(null);
      load();
    } catch (e) {
      setMsg(e.response?.data?.detail || "Error creating design");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Layout>
      <h2 style={{ fontWeight: 900, marginBottom: 4 }}>Design Studio</h2>
      <p style={{ color: "#6c757d", marginBottom: 20, fontSize: 14 }}>Create product designs and set stitching rates</p>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(300px,420px) 1fr", gap: 20, alignItems: "start" }}>

        {/* Create Form */}
        <div style={S.card}>
          <div style={S.header}><h3 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}><Plus size={15} style={{ marginRight: 6 }} />New Design</h3></div>
          <form onSubmit={submit} style={{ padding: 20 }}>
            {msg && <div style={{ background: msg.includes("!") ? "#d1f5ea" : "#ffe0e3", borderRadius: 8, padding: "8px 12px", marginBottom: 14, fontSize: 13, color: msg.includes("!") ? "#1b5e20" : "#b71c1c" }}>{msg}</div>}

            <div style={{ marginBottom: 14 }}>
              <label style={S.label}>Design Name</label>
              <input style={S.input} placeholder="e.g. Summer Kurta v2" value={form.design_name}
                onChange={e => setForm(f => ({ ...f, design_name: e.target.value }))} required />
            </div>
            <div style={{ marginBottom: 14 }}>
              <label style={S.label}>Design Code (unique ID)</label>
              <input style={{ ...S.input, textTransform: "uppercase" }} placeholder="e.g. SK-001" value={form.design_code}
                onChange={e => setForm(f => ({ ...f, design_code: e.target.value }))} required />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 14 }}>
              <div>
                <label style={S.label}>Stitching Rate (₹)</label>
                <input style={S.input} type="number" placeholder="35" min="1" value={form.stitch_rate}
                  onChange={e => setForm(f => ({ ...f, stitch_rate: e.target.value }))} required />
              </div>
              <div>
                <label style={S.label}>Target Qty</label>
                <input style={S.input} type="number" placeholder="500" min="1" value={form.target_qty}
                  onChange={e => setForm(f => ({ ...f, target_qty: e.target.value }))} required />
              </div>
            </div>
            <div style={{ background: "#f8f9fc", border: "1px dashed #dee2e6", borderRadius: 10, padding: 12, marginBottom: 14 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#5d4037", marginBottom: 8 }}>FABRIC REQUIREMENT (optional)</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div>
                  <label style={S.label}>Fabric</label>
                  <select style={S.input} value={form.fabric_id}
                    onChange={e => setForm(f => ({ ...f, fabric_id: e.target.value }))}>
                    <option value="">None</option>
                    {fabrics.map(fb => <option key={fb.id} value={fb.id}>{fb.fabric_name}</option>)}
                  </select>
                </div>
                <div>
                  <label style={S.label}>Metres / piece</label>
                  <input style={S.input} type="number" step="0.001" min="0" placeholder="1.5" value={form.metres_per_piece}
                    onChange={e => setForm(f => ({ ...f, metres_per_piece: e.target.value }))} />
                </div>
              </div>
              <div style={{ fontSize: 11, color: "#adb5bd", marginTop: 6 }}>Used to auto-deduct fabric stock when cutting records a cut.</div>
            </div>
            <div style={{ marginBottom: 18 }}>
              <label style={S.label}>Product Image (optional)</label>
              <input type="file" accept="image/*" style={{ fontSize: 13 }} onChange={e => setImage(e.target.files[0])} />
            </div>
            <button type="submit" style={{ ...S.btn, width: "100%", opacity: loading ? 0.7 : 1 }} disabled={loading}>
              {loading ? "Creating..." : "Create Design"}
            </button>
          </form>
        </div>

        {/* Designs List */}
        <div style={S.card}>
          <div style={S.header}><h3 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}><Package size={15} style={{ marginRight: 6 }} />All Designs ({designs.length})</h3></div>
          {designs.length === 0 ? (
            <div style={{ textAlign: "center", padding: 48, color: "#adb5bd" }}>
              <Image size={40} style={{ opacity: 0.3 }} />
              <p style={{ marginTop: 12, fontSize: 14 }}>No designs yet</p>
            </div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
                <thead>
                  <tr style={{ background: "#f8f9fc" }}>
                    {["Design", "Code", "Rate", "Target", "Fabric", "Bundles Cut"].map(h => (
                      <th key={h} style={{ padding: "10px 16px", textAlign: "left", fontSize: 12, fontWeight: 700, color: "#6c757d" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {designs.map((d, i) => (
                    <tr key={d.id} style={{ borderTop: "1px solid #f0f0f0", background: i % 2 ? "#fafafa" : "white" }}>
                      <td style={{ padding: "12px 16px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          {d.image_url
                            ? <img src={`${process.env.REACT_APP_API_URL}${d.image_url}`} alt="" style={{ width: 44, height: 44, objectFit: "cover", borderRadius: 8, border: "1px solid #dee2e6" }} />
                            : <div style={{ width: 44, height: 44, background: "#f0f0f0", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center" }}><Image size={18} color="#adb5bd" /></div>
                          }
                          <span style={{ fontWeight: 600 }}>{d.design_name}</span>
                        </div>
                      </td>
                      <td style={{ padding: "12px 16px", fontFamily: "monospace", fontSize: 13 }}>{d.design_code}</td>
                      <td style={{ padding: "12px 16px", fontWeight: 700, color: "#1b5e20" }}>₹{d.stitch_rate}</td>
                      <td style={{ padding: "12px 16px" }}>{d.target_qty}</td>
                      <td style={{ padding: "12px 16px", fontSize: 12 }}>
                        {d.fabric_name
                          ? <span style={{ color: "#5d4037" }}>{d.fabric_name}<br/><span style={{ color: "#adb5bd" }}>{d.metres_per_piece} m/pc</span></span>
                          : <span style={{ color: "#ced4da" }}>—</span>}
                      </td>
                      <td style={{ padding: "12px 16px" }}>
                        <span style={{ background: "#e8f4fd", color: "#1565c0", borderRadius: 20, padding: "2px 10px", fontSize: 12, fontWeight: 700 }}>
                          {d.bundle_count} bundles · {d.cut_qty} pcs
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}

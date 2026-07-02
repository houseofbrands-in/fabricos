import { useState, useEffect } from "react";
import Layout from "../components/Layout";
import api from "../api";
import { Plus, Image, Package, Calculator, X, Trash2, History, Save } from "lucide-react";

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
  const [form, setForm] = useState({ design_name: "", design_code: "", stitch_rate: "", fabric_id: "", metres_per_piece: "" });
  const [sizes, setSizes] = useState({});   // size -> qty (presence = selected)
  const [image, setImage] = useState(null);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");
  const [costFor, setCostFor] = useState(null);

  const load = () => api.get("/designs/").then((r) => setDesigns(r.data));
  const loadFabrics = () => api.get("/fabric/").then((r) => setFabrics(r.data)).catch(() => setFabrics([]));
  useEffect(() => { load(); loadFabrics(); }, []);

  const submit = async (e) => {
    e.preventDefault();
    const sizeList = Object.entries(sizes)
      .map(([size, qty]) => ({ size, qty: parseInt(qty) || 0 }))
      .filter(s => s.qty > 0);
    if (sizeList.length === 0) { setMsg("Select at least one size and enter its quantity"); return; }
    setLoading(true);
    setMsg("");
    try {
      const fd = new FormData();
      Object.entries(form).forEach(([k, v]) => {
        if ((k === "fabric_id" || k === "metres_per_piece") && (v === "" || v == null)) return;
        fd.append(k, v);
      });
      fd.append("sizes", JSON.stringify(sizeList));
      if (image) fd.append("image", image);
      await api.post("/designs/", fd, { headers: { "Content-Type": "multipart/form-data" } });
      setMsg("Design created!");
      setForm({ design_name: "", design_code: "", stitch_rate: "", fabric_id: "", metres_per_piece: "" });
      setSizes({});
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
            <div style={{ marginBottom: 14 }}>
              <label style={S.label}>Stitching Rate (₹ per piece)</label>
              <input style={S.input} type="number" placeholder="35" min="1" value={form.stitch_rate}
                onChange={e => setForm(f => ({ ...f, stitch_rate: e.target.value }))} required />
            </div>
            <div style={{ marginBottom: 14 }}>
              <label style={S.label}>Size Plan — tick sizes and enter quantity</label>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 6 }}>
                {["XS", "S", "M", "L", "XL", "XXL", "3XL", "4XL"].map(sz => {
                  const on = sizes[sz] !== undefined;
                  return (
                    <div key={sz} style={{ border: `1.5px solid ${on ? "#283593" : "#dee2e6"}`, borderRadius: 8, padding: "5px 6px", background: on ? "#eef2ff" : "white" }}>
                      <label style={{ display: "flex", alignItems: "center", gap: 5, cursor: "pointer", fontSize: 12, fontWeight: 700 }}>
                        <input type="checkbox" checked={on} onChange={() => setSizes(s => { const n = { ...s }; if (on) delete n[sz]; else n[sz] = ""; return n; })} />
                        {sz}
                      </label>
                      {on && <input autoFocus type="number" min="1" placeholder="qty" value={sizes[sz]} onChange={e => setSizes(s => ({ ...s, [sz]: e.target.value }))} style={{ width: "100%", marginTop: 4, border: "1px solid #dee2e6", borderRadius: 6, padding: "4px 6px", fontSize: 13, boxSizing: "border-box" }} />}
                    </div>
                  );
                })}
              </div>
              <div style={{ fontSize: 12, color: "#6c757d", marginTop: 6, fontWeight: 700 }}>
                Total target: {Object.values(sizes).reduce((a, v) => a + (parseInt(v) || 0), 0)} pcs
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
                    {["Design", "Code", "Rate", "Target", "Fabric", "Bundles Cut", "Cost Sheet"].map(h => (
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
                      <td style={{ padding: "12px 16px" }}>
                        <div style={{ fontWeight: 700 }}>{d.target_qty}</div>
                        {d.sizes && d.sizes.length > 0 && (
                          <div style={{ display: "flex", flexWrap: "wrap", gap: 3, marginTop: 3 }}>
                            {d.sizes.map(s => <span key={s.size} style={{ background: "#eef2ff", color: "#283593", borderRadius: 5, padding: "1px 5px", fontSize: 10.5, fontWeight: 700 }}>{s.size}:{s.qty}</span>)}
                          </div>
                        )}
                      </td>
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
                      <td style={{ padding: "12px 16px" }}>
                        <button onClick={() => setCostFor(d)} style={{ background: "#283593", color: "white", border: "none", borderRadius: 8, padding: "7px 12px", fontWeight: 700, fontSize: 12, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 5 }}>
                          <Calculator size={13} /> Cost
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
      {costFor && <CostSheetModal design={costFor} onClose={() => setCostFor(null)} />}
    </Layout>
  );
}

/* ─────────────────────────── COST SHEET MODAL ─────────────────────────── */
const CAT_LABEL = { jobwork: "Job work", trim: "Trim / accessory", other: "Other / overhead" };
const money = (n) => `₹${(Number(n) || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function CostSheetModal({ design, onClose }) {
  const [sheet, setSheet] = useState(null);
  const [info, setInfo] = useState(null);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [versions, setVersions] = useState(null);

  const load = () => api.get(`/designs/${design.id}/costsheet`).then(r => {
    const d = r.data;
    setInfo(d.design);
    setSheet({
      metres_per_piece: d.metres_per_piece, fabric_rate: d.fabric_rate, stitch_cost: d.stitch_cost,
      wastage_pct: d.wastage_pct, margin_pct: d.margin_pct, selling_price: d.selling_price,
      notes: d.notes, items: d.items.map(it => ({ category: it.category, label: it.label, cost_per_piece: it.cost_per_piece })),
      version_count: d.version_count, exists: d.exists,
    });
  });
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [design.id]);

  if (!sheet) return null;

  const num = (v) => Number(v) || 0;
  const set = (k, v) => setSheet(s => ({ ...s, [k]: v }));
  const setItem = (i, k, v) => setSheet(s => ({ ...s, items: s.items.map((it, j) => j === i ? { ...it, [k]: v } : it) }));
  const addItem = (category) => setSheet(s => ({ ...s, items: [...s.items, { category, label: "", cost_per_piece: 0 }] }));
  const delItem = (i) => setSheet(s => ({ ...s, items: s.items.filter((_, j) => j !== i) }));

  // live computation (mirrors backend)
  const fabricCost = num(sheet.metres_per_piece) * num(sheet.fabric_rate);
  const itemsTotal = sheet.items.reduce((a, it) => a + num(it.cost_per_piece), 0);
  const subtotal = fabricCost + num(sheet.stitch_cost) + itemsTotal;
  const wastageAmt = subtotal * num(sheet.wastage_pct) / 100;
  const totalCost = subtotal + wastageAmt;
  const mp = num(sheet.margin_pct);
  const suggested = mp > 0 && mp < 100 ? totalCost / (1 - mp / 100) : null;
  const sp = num(sheet.selling_price);
  const realMargin = sp > 0 ? (sp - totalCost) / sp * 100 : null;
  const profit = sp > 0 ? sp - totalCost : null;

  const payload = () => ({
    metres_per_piece: num(sheet.metres_per_piece), fabric_rate: num(sheet.fabric_rate),
    stitch_cost: num(sheet.stitch_cost), wastage_pct: num(sheet.wastage_pct),
    margin_pct: num(sheet.margin_pct), selling_price: num(sheet.selling_price),
    notes: sheet.notes || "", items: sheet.items.map(it => ({ category: it.category, label: it.label, cost_per_piece: num(it.cost_per_piece) })),
  });

  const save = async () => {
    setBusy(true); setMsg("");
    try { await api.put(`/designs/${design.id}/costsheet`, payload()); setMsg("✅ Saved"); await load(); setTimeout(() => setMsg(""), 2500); }
    catch (e) { setMsg(e.response?.data?.detail || "Error"); }
    finally { setBusy(false); }
  };
  const snapshot = async () => {
    setBusy(true); setMsg("");
    try { await api.put(`/designs/${design.id}/costsheet`, payload()); const { data } = await api.post(`/designs/${design.id}/costsheet/version`); setMsg(`✅ Saved as version ${data.version}`); await load(); if (versions) showVersions(); setTimeout(() => setMsg(""), 3000); }
    catch (e) { setMsg(e.response?.data?.detail || "Error"); }
    finally { setBusy(false); }
  };
  const showVersions = async () => { const { data } = await api.get(`/designs/${design.id}/costsheet/versions`); setVersions(data); };

  const inp = { width: "100%", border: "1.5px solid #dee2e6", borderRadius: 8, padding: "8px 10px", fontSize: 14, outline: "none", boxSizing: "border-box" };
  const lab = { fontSize: 11, fontWeight: 700, color: "#6c757d", display: "block", marginBottom: 3 };
  const row = (label, value, bold) => (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", fontWeight: bold ? 800 : 400, fontSize: bold ? 15 : 13.5, borderTop: bold ? "2px solid #1a1a2e" : "1px solid #f0f0f0" }}>
      <span>{label}</span><span>{value}</span>
    </div>
  );

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "flex-start", justifyContent: "center", padding: 16, zIndex: 300, overflowY: "auto" }}>
      <div onClick={e => e.stopPropagation()} style={{ background: "white", borderRadius: 16, width: "100%", maxWidth: 860, margin: "20px 0", overflow: "hidden" }}>
        <div style={{ background: "linear-gradient(135deg,#1a1a2e,#283593)", color: "white", padding: "16px 22px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontWeight: 800, fontSize: 16, display: "flex", alignItems: "center", gap: 8 }}><Calculator size={17} /> Cost Sheet — {info?.design_code}</div>
            <div style={{ fontSize: 12, opacity: 0.85 }}>{info?.design_name}{info?.fabric_name ? ` · ${info.fabric_name}` : ""}</div>
          </div>
          <X size={20} style={{ cursor: "pointer" }} onClick={onClose} />
        </div>

        <div style={{ padding: 22 }}>
          {msg && <div style={{ background: msg.startsWith("✅") ? "#d1f5ea" : "#ffe0e3", color: msg.startsWith("✅") ? "#1b5e20" : "#b71c1c", borderRadius: 8, padding: "8px 12px", marginBottom: 14, fontSize: 13, fontWeight: 600 }}>{msg}</div>}

          <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 24, alignItems: "start" }}>
            {/* LEFT: inputs */}
            <div>
              <div style={{ fontWeight: 800, fontSize: 13, color: "#283593", marginBottom: 8 }}>FABRIC & STITCHING</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 18 }}>
                <div><label style={lab}>Metres / piece</label><input style={inp} type="number" step="0.001" value={sheet.metres_per_piece} onChange={e => set("metres_per_piece", e.target.value)} /></div>
                <div><label style={lab}>Fabric rate ₹/m{info?.suggested_fabric_rate ? "" : ""}</label><input style={inp} type="number" step="0.01" value={sheet.fabric_rate} onChange={e => set("fabric_rate", e.target.value)} /></div>
                <div><label style={lab}>Stitching ₹/pc</label><input style={inp} type="number" step="0.01" value={sheet.stitch_cost} onChange={e => set("stitch_cost", e.target.value)} /></div>
              </div>

              {["jobwork", "trim", "other"].map(cat => (
                <div key={cat} style={{ marginBottom: 16 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                    <span style={{ fontWeight: 800, fontSize: 13, color: "#283593" }}>{CAT_LABEL[cat].toUpperCase()}</span>
                    <button onClick={() => addItem(cat)} style={{ background: "#eef2ff", color: "#3730a3", border: "none", borderRadius: 7, padding: "4px 10px", fontWeight: 700, fontSize: 12, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 4 }}><Plus size={12} /> Add</button>
                  </div>
                  {sheet.items.map((it, i) => it.category === cat ? (
                    <div key={i} style={{ display: "flex", gap: 8, marginBottom: 6 }}>
                      <input style={{ ...inp, flex: 1 }} placeholder={cat === "jobwork" ? "e.g. Printing" : cat === "trim" ? "e.g. Buttons, Zip, Label" : "e.g. Cutting, Finishing"} value={it.label} onChange={e => setItem(i, "label", e.target.value)} />
                      <input style={{ ...inp, width: 110 }} type="number" step="0.01" placeholder="₹/pc" value={it.cost_per_piece} onChange={e => setItem(i, "cost_per_piece", e.target.value)} />
                      <button onClick={() => delItem(i)} style={{ background: "#ffe0e3", border: "none", borderRadius: 8, padding: "0 10px", cursor: "pointer", color: "#b71c1c" }}><Trash2 size={13} /></button>
                    </div>
                  ) : null)}
                  {!sheet.items.some(it => it.category === cat) && <div style={{ fontSize: 12, color: "#ced4da" }}>None added</div>}
                </div>
              ))}

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 6 }}>
                <div><label style={lab}>Wastage %</label><input style={inp} type="number" step="0.01" value={sheet.wastage_pct} onChange={e => set("wastage_pct", e.target.value)} /></div>
                <div><label style={lab}>Target margin %</label><input style={inp} type="number" step="0.01" value={sheet.margin_pct} onChange={e => set("margin_pct", e.target.value)} /></div>
              </div>
              <div style={{ marginTop: 10 }}>
                <label style={lab}>Your / marketplace selling price ₹ (optional)</label>
                <input style={inp} type="number" step="0.01" value={sheet.selling_price} onChange={e => set("selling_price", e.target.value)} />
              </div>
              <div style={{ marginTop: 10 }}>
                <label style={lab}>Notes</label>
                <textarea style={{ ...inp, minHeight: 50, resize: "vertical" }} value={sheet.notes} onChange={e => set("notes", e.target.value)} />
              </div>
            </div>

            {/* RIGHT: summary */}
            <div style={{ background: "#f8f9fc", borderRadius: 12, padding: 16, position: "sticky", top: 0 }}>
              <div style={{ fontWeight: 800, fontSize: 13, color: "#283593", marginBottom: 6 }}>COST / PIECE</div>
              {row("Fabric", money(fabricCost))}
              {row("Stitching", money(num(sheet.stitch_cost)))}
              {row("Job work", money(sheet.items.filter(i => i.category === "jobwork").reduce((a, i) => a + num(i.cost_per_piece), 0)))}
              {row("Trims", money(sheet.items.filter(i => i.category === "trim").reduce((a, i) => a + num(i.cost_per_piece), 0)))}
              {row("Other", money(sheet.items.filter(i => i.category === "other").reduce((a, i) => a + num(i.cost_per_piece), 0)))}
              {row(`Wastage (${num(sheet.wastage_pct)}%)`, money(wastageAmt))}
              {row("Total cost", money(totalCost), true)}
              <div style={{ height: 14 }} />
              {suggested != null && row(`Suggested price @${num(sheet.margin_pct)}%`, money(suggested), false)}
              {sp > 0 && row("Selling price", money(sp))}
              {profit != null && <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 10px", marginTop: 8, borderRadius: 8, background: profit >= 0 ? "#d1f5ea" : "#ffe0e3", fontWeight: 800, fontSize: 14, color: profit >= 0 ? "#1b5e20" : "#b71c1c" }}><span>{profit >= 0 ? "Profit" : "Loss"} · {realMargin.toFixed(1)}%</span><span>{money(profit)}</span></div>}

              <button onClick={save} disabled={busy} style={{ width: "100%", marginTop: 16, background: "#1b5e20", color: "white", border: "none", borderRadius: 10, padding: "11px", fontWeight: 700, fontSize: 14, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6, opacity: busy ? 0.7 : 1 }}><Save size={15} /> Save</button>
              <button onClick={snapshot} disabled={busy} style={{ width: "100%", marginTop: 8, background: "#283593", color: "white", border: "none", borderRadius: 10, padding: "10px", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>Save as new version</button>
              <button onClick={showVersions} style={{ width: "100%", marginTop: 8, background: "white", color: "#283593", border: "1.5px solid #dee2e6", borderRadius: 10, padding: "9px", fontWeight: 700, fontSize: 13, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}><History size={14} /> Version history ({sheet.version_count})</button>
            </div>
          </div>

          {versions && (
            <div style={{ marginTop: 18, border: "1px solid #eee", borderRadius: 12, overflow: "hidden" }}>
              <div style={{ background: "#f8f9fc", padding: "10px 14px", fontWeight: 800, fontSize: 13, display: "flex", justifyContent: "space-between" }}>
                <span>Version history</span><X size={16} style={{ cursor: "pointer" }} onClick={() => setVersions(null)} />
              </div>
              {versions.length === 0 ? <div style={{ padding: 16, color: "#adb5bd", fontSize: 13 }}>No saved versions yet — use "Save as new version" to snapshot the current cost.</div> : (
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead><tr style={{ background: "#fafafa" }}>{["Version", "Total cost", "Selling", "Margin", "By", "When"].map(h => <th key={h} style={{ padding: "8px 14px", textAlign: "left", fontSize: 11, color: "#6c757d" }}>{h}</th>)}</tr></thead>
                  <tbody>
                    {versions.map(v => (
                      <tr key={v.version} style={{ borderTop: "1px solid #f0f0f0" }}>
                        <td style={{ padding: "8px 14px", fontWeight: 700 }}>v{v.version}</td>
                        <td style={{ padding: "8px 14px" }}>{money(v.total_cost)}</td>
                        <td style={{ padding: "8px 14px" }}>{v.selling_price > 0 ? money(v.selling_price) : "—"}</td>
                        <td style={{ padding: "8px 14px" }}>{v.margin_pct ? `${v.margin_pct}%` : "—"}</td>
                        <td style={{ padding: "8px 14px" }}>{v.by}</td>
                        <td style={{ padding: "8px 14px", color: "#6c757d" }}>{v.at ? new Date(v.at).toLocaleDateString("en-IN") : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
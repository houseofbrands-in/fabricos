import { useState, useEffect, useRef } from "react";
import Layout from "../components/Layout";
import api from "../api";
import { useAuth } from "../context/AuthContext";
import { Boxes, Plus, Layers, ScanLine, Trash2, X, MapPin, PackagePlus } from "lucide-react";

const S = {
  card: { background: "white", borderRadius: 16, boxShadow: "0 2px 12px rgba(0,0,0,0.06)", overflow: "hidden" },
  header: { background: "linear-gradient(135deg,#1a1a2e,#283593)", color: "white", padding: "14px 20px" },
  h3: { margin: 0, fontSize: 15, fontWeight: 700, display: "flex", alignItems: "center", gap: 6 },
  input: { width: "100%", border: "1.5px solid #dee2e6", borderRadius: 10, padding: "10px 12px", fontSize: 14, outline: "none", boxSizing: "border-box" },
  label: { fontSize: 12, fontWeight: 700, color: "#495057", display: "block", marginBottom: 4 },
  btn: { background: "#3949ab", color: "white", border: "none", borderRadius: 10, padding: "11px 20px", fontWeight: 700, cursor: "pointer", fontSize: 14 },
  th: { padding: "10px 16px", textAlign: "left", fontSize: 12, fontWeight: 700, color: "#6c757d" },
  td: { padding: "10px 16px", fontSize: 13 },
  pill: (bg, c) => ({ background: bg, color: c, borderRadius: 20, padding: "2px 10px", fontSize: 12, fontWeight: 700, display: "inline-block" }),
};

function Msg({ msg }) {
  if (!msg) return null;
  const ok = msg.startsWith("✅");
  return <div style={{ background: ok ? "#d1f5ea" : "#ffe0e3", borderRadius: 8, padding: "8px 12px", marginBottom: 14, fontSize: 13, color: ok ? "#1b5e20" : "#b71c1c" }}>{msg}</div>;
}

function DelBtn({ onClick }) {
  return <button onClick={onClick} title="Delete" style={{ background: "#ffe0e3", border: "none", borderRadius: 8, padding: "6px 8px", cursor: "pointer", color: "#b71c1c", display: "inline-flex", alignItems: "center" }}><Trash2 size={13} /></button>;
}

async function doDelete(url, reload) {
  if (!window.confirm("Delete this permanently? This cannot be undone.")) return;
  try { await api.delete(url); } catch (e) { if (e.response?.status !== 404) alert(e.response?.data?.detail || "Could not delete"); }
  reload();
}

const normCode = (s) => (s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");

export default function Warehouse() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const [tab, setTab] = useState("inward");
  const [skus, setSkus] = useState([]);
  const [racks, setRacks] = useState([]);
  const [stock, setStock] = useState({ skus: [], total_units: 0, total_quarantine: 0 });

  const loadSkus = () => api.get("/warehouse/skus").then(r => setSkus(r.data));
  const loadRacks = () => api.get("/warehouse/racks").then(r => setRacks(r.data));
  const loadStock = () => api.get("/warehouse/stock").then(r => setStock(r.data));
  const loadAll = () => { loadSkus(); loadRacks(); loadStock(); };
  useEffect(loadAll, []);

  const tabs = [
    ["inward", "Inward", ScanLine],
    ["stock", "Stock", Boxes],
    ["skus", "SKUs", Layers],
    ["racks", "Racks", MapPin],
  ];

  return (
    <Layout>
      <h2 style={{ fontWeight: 900, marginBottom: 4 }}>Warehouse</h2>
      <p style={{ color: "#6c757d", marginBottom: 16, fontSize: 14 }}>Finished-goods inventory — scan rack, scan SKU, track stock</p>

      <div style={{ display: "flex", gap: 14, marginBottom: 16, flexWrap: "wrap" }}>
        <div style={{ ...S.card, padding: "12px 20px", display: "flex", alignItems: "center", gap: 10 }}>
          <Boxes size={18} color="#3949ab" />
          <div><div style={{ fontSize: 22, fontWeight: 900 }}>{stock.total_units}</div><div style={{ fontSize: 11, color: "#6c757d" }}>Sellable units</div></div>
        </div>
        {stock.total_quarantine > 0 && (
          <div style={{ ...S.card, padding: "12px 20px", display: "flex", alignItems: "center", gap: 10 }}>
            <div><div style={{ fontSize: 22, fontWeight: 900, color: "#b71c1c" }}>{stock.total_quarantine}</div><div style={{ fontSize: 11, color: "#6c757d" }}>In quarantine</div></div>
          </div>
        )}
      </div>

      <div style={{ display: "flex", gap: 4, marginBottom: 20, background: "white", borderRadius: 12, padding: 4, boxShadow: "0 2px 8px rgba(0,0,0,0.05)", width: "fit-content", flexWrap: "wrap" }}>
        {tabs.map(([key, label, Icon]) => (
          <button key={key} onClick={() => setTab(key)} style={{
            background: tab === key ? "#1a1a2e" : "transparent", color: tab === key ? "white" : "#6c757d",
            border: "none", borderRadius: 9, padding: "8px 16px", fontWeight: 700, fontSize: 13, cursor: "pointer",
            display: "flex", alignItems: "center", gap: 6,
          }}><Icon size={14} /> {label}</button>
        ))}
      </div>

      {tab === "inward" && <InwardTab racks={racks} reload={loadAll} />}
      {tab === "stock" && <StockTab stock={stock} />}
      {tab === "skus" && <SkusTab skus={skus} reload={loadAll} isAdmin={isAdmin} />}
      {tab === "racks" && <RacksTab racks={racks} reload={loadAll} isAdmin={isAdmin} />}
    </Layout>
  );
}

/* ─────────────────────────── INWARD (scan flow) ─────────────────────────── */
function InwardTab({ racks, reload }) {
  const [rack, setRack] = useState(null);
  const [rackInput, setRackInput] = useState("");
  const [skuInput, setSkuInput] = useState("");
  const [qty, setQty] = useState(1);
  const [msg, setMsg] = useState("");
  const [log, setLog] = useState([]);
  const skuRef = useRef(null);
  const rackRef = useRef(null);

  const lockRack = () => {
    const v = rackInput.trim();
    if (!v) return;
    const found = racks.find(r => normCode(r.code) === normCode(v) || (r.barcode && r.barcode === v));
    if (!found) { setMsg(`Rack '${v}' not found. Add it in the Racks tab first.`); return; }
    setRack(found); setMsg(""); setRackInput("");
    setTimeout(() => skuRef.current?.focus(), 50);
  };

  const scanSku = async () => {
    const code = skuInput.trim();
    if (!code || !rack) return;
    try {
      const { data } = await api.post("/warehouse/inward", { rack_code: rack.code, sku_code: code, qty: parseInt(qty) || 1 });
      setLog(l => [{ sku: data.sku_code, name: data.name, added: data.added, rack: data.rack_code, total: data.sellable_total_now }, ...l].slice(0, 12));
      setMsg("");
      setSkuInput(""); setQty(1);
      setTimeout(() => skuRef.current?.focus(), 30);
      reload();
    } catch (e) {
      setMsg(e.response?.data?.detail || "Error");
      setSkuInput("");
      setTimeout(() => skuRef.current?.focus(), 30);
    }
  };

  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(320px,440px) 1fr", gap: 20, alignItems: "start" }}>
      <div style={S.card}>
        <div style={S.header}><h3 style={S.h3}><ScanLine size={15} /> Inward — Scan to Rack</h3></div>
        <div style={{ padding: 20 }}>
          <Msg msg={msg} />
          {!rack ? (
            <div>
              <label style={S.label}>Step 1 — Scan / type Rack</label>
              <div style={{ display: "flex", gap: 8 }}>
                <input ref={rackRef} autoFocus style={{ ...S.input, fontSize: 18, fontWeight: 700 }} placeholder="Scan rack barcode…"
                  value={rackInput} onChange={e => setRackInput(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); lockRack(); } }} />
                <button onClick={lockRack} style={{ ...S.btn }}>Set</button>
              </div>
              <div style={{ fontSize: 12, color: "#adb5bd", marginTop: 8 }}>Scan the rack first, then scan items onto it.</div>
            </div>
          ) : (
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "#e8eaf6", borderRadius: 10, padding: "10px 14px", marginBottom: 16 }}>
                <div><MapPin size={14} style={{ verticalAlign: -2 }} /> <b>Rack {rack.code}</b>{rack.zone ? <span style={{ color: "#6c757d" }}> · {rack.zone}</span> : null}</div>
                <button onClick={() => { setRack(null); setLog([]); setTimeout(() => rackRef.current?.focus(), 50); }} style={{ background: "none", border: "none", color: "#3949ab", cursor: "pointer", fontWeight: 700, fontSize: 12 }}>Change rack</button>
              </div>
              <label style={S.label}>Step 2 — Scan / type SKU (master or sub code / barcode)</label>
              <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
                <input ref={skuRef} autoFocus style={{ ...S.input, fontSize: 18, fontWeight: 700 }} placeholder="Scan SKU…"
                  value={skuInput} onChange={e => setSkuInput(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); scanSku(); } }} />
                <input style={{ ...S.input, width: 80, fontSize: 18, fontWeight: 700, textAlign: "center" }} type="number" min="1" value={qty} onChange={e => setQty(e.target.value)} />
              </div>
              <button onClick={scanSku} style={{ ...S.btn, width: "100%" }}><PackagePlus size={15} style={{ verticalAlign: -3 }} /> Add to {rack.code}</button>
              <div style={{ fontSize: 12, color: "#adb5bd", marginTop: 8 }}>Each scan adds the quantity shown (default 1) and refocuses for the next scan.</div>
            </div>
          )}
        </div>
      </div>

      <div style={S.card}>
        <div style={S.header}><h3 style={S.h3}><PackagePlus size={15} /> Just Added</h3></div>
        {log.length === 0 ? (
          <div style={{ textAlign: "center", padding: 48, color: "#adb5bd", fontSize: 14 }}>Scanned items will appear here</div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead><tr style={{ background: "#f8f9fc" }}>{["SKU", "Rack", "Added", "Total now"].map(h => <th key={h} style={S.th}>{h}</th>)}</tr></thead>
              <tbody>
                {log.map((r, i) => (
                  <tr key={i} style={{ borderTop: "1px solid #f0f0f0" }}>
                    <td style={S.td}><span style={{ fontFamily: "monospace", fontWeight: 700 }}>{r.sku}</span>{r.name ? <div style={{ fontSize: 11, color: "#adb5bd" }}>{r.name}</div> : null}</td>
                    <td style={S.td}>{r.rack}</td>
                    <td style={S.td}><span style={S.pill("#d1f5ea", "#1b5e20")}>+{r.added}</span></td>
                    <td style={{ ...S.td, fontWeight: 700 }}>{r.total}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

/* ─────────────────────────── STOCK ─────────────────────────── */
function StockTab({ stock }) {
  return (
    <div style={S.card}>
      <div style={S.header}><h3 style={S.h3}><Boxes size={15} /> Live Stock ({stock.skus.length} SKUs)</h3></div>
      {stock.skus.length === 0 ? (
        <div style={{ textAlign: "center", padding: 48, color: "#adb5bd", fontSize: 14 }}>No stock yet — add SKUs and inward them</div>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr style={{ background: "#f8f9fc" }}>{["SKU", "Size", "Sellable", "Quarantine", "On racks"].map(h => <th key={h} style={S.th}>{h}</th>)}</tr></thead>
            <tbody>
              {stock.skus.map((s, i) => (
                <tr key={s.id} style={{ borderTop: "1px solid #f0f0f0", background: i % 2 ? "#fafafa" : "white" }}>
                  <td style={S.td}><span style={{ fontFamily: "monospace", fontWeight: 700 }}>{s.sku_code}</span>{s.name ? <div style={{ fontSize: 11, color: "#adb5bd" }}>{s.name}</div> : null}</td>
                  <td style={S.td}>{s.size || "—"}</td>
                  <td style={S.td}><span style={{ fontWeight: 900, fontSize: 16, color: s.sellable > 0 ? "#1b5e20" : "#adb5bd" }}>{s.sellable}</span></td>
                  <td style={S.td}>{s.quarantine > 0 ? <span style={S.pill("#ffe0e3", "#b71c1c")}>{s.quarantine}</span> : "—"}</td>
                  <td style={S.td}>{s.racks && s.racks.length ? s.racks.map(r => `${r.rack_code}: ${r.qty}`).join(" · ") : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────── SKUs (master + subs) ─────────────────────────── */
function SkusTab({ skus, reload, isAdmin }) {
  const [form, setForm] = useState({ sku_code: "", name: "", size: "", barcode: "" });
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(false);
  const [subFor, setSubFor] = useState(null);
  const [sub, setSub] = useState({ sub_code: "", channel: "", barcode: "" });

  const submit = async (e) => {
    e.preventDefault(); setLoading(true); setMsg("");
    try {
      await api.post("/warehouse/skus", form);
      setMsg("✅ SKU added!");
      setForm({ sku_code: "", name: "", size: "", barcode: "" });
      reload();
    } catch (e) { setMsg(e.response?.data?.detail || "Error"); }
    finally { setLoading(false); }
  };

  const addSub = async (masterId) => {
    if (!sub.sub_code.trim()) { alert("Enter a sub-SKU code"); return; }
    try {
      await api.post(`/warehouse/skus/${masterId}/subs`, sub);
      setSub({ sub_code: "", channel: "", barcode: "" }); setSubFor(null);
      reload();
    } catch (e) { alert(e.response?.data?.detail || "Error"); }
  };

  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(280px,360px) 1fr", gap: 20, alignItems: "start" }}>
      <div style={S.card}>
        <div style={S.header}><h3 style={S.h3}><Plus size={15} /> New Master SKU</h3></div>
        <form onSubmit={submit} style={{ padding: 20 }}>
          <Msg msg={msg} />
          <div style={{ marginBottom: 14 }}>
            <label style={S.label}>SKU Code</label>
            <input style={S.input} placeholder="e.g. DB-D011DR-A-L" value={form.sku_code} onChange={e => setForm(f => ({ ...f, sku_code: e.target.value }))} required />
          </div>
          <div style={{ marginBottom: 14 }}>
            <label style={S.label}>Product Name (optional)</label>
            <input style={S.input} placeholder="e.g. Floral Dress" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 18 }}>
            <div><label style={S.label}>Size</label><input style={S.input} placeholder="auto from code" value={form.size} onChange={e => setForm(f => ({ ...f, size: e.target.value }))} /></div>
            <div><label style={S.label}>Barcode</label><input style={S.input} value={form.barcode} onChange={e => setForm(f => ({ ...f, barcode: e.target.value }))} /></div>
          </div>
          <button type="submit" style={{ ...S.btn, width: "100%", opacity: loading ? 0.7 : 1 }} disabled={loading}>{loading ? "Adding..." : "Add SKU"}</button>
        </form>
      </div>

      <div style={S.card}>
        <div style={S.header}><h3 style={S.h3}><Layers size={15} /> Master SKUs ({skus.length})</h3></div>
        {skus.length === 0 ? (
          <div style={{ textAlign: "center", padding: 48, color: "#adb5bd", fontSize: 14 }}>No SKUs yet</div>
        ) : (
          <div style={{ padding: 12 }}>
            {skus.map(s => (
              <div key={s.id} style={{ border: "1px solid #f0f0f0", borderRadius: 12, padding: 14, marginBottom: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                  <div>
                    <span style={{ fontFamily: "monospace", fontWeight: 700, fontSize: 15 }}>{s.sku_code}</span>
                    <span style={{ marginLeft: 8 }}>{s.name}</span>
                    <div style={{ fontSize: 12, color: "#6c757d", marginTop: 2 }}>
                      Size {s.size || "—"} · <b style={{ color: "#1b5e20" }}>{s.sellable}</b> sellable{s.quarantine > 0 ? <span style={{ color: "#b71c1c" }}> · {s.quarantine} quarantine</span> : null}
                      {s.barcode ? ` · barcode ${s.barcode}` : ""}
                    </div>
                  </div>
                  <div style={{ display: "inline-flex", gap: 6 }}>
                    <button onClick={() => { setSubFor(subFor === s.id ? null : s.id); setSub({ sub_code: "", channel: "", barcode: "" }); }} style={{ background: "#eef2ff", color: "#3730a3", border: "none", borderRadius: 8, padding: "6px 10px", cursor: "pointer", fontWeight: 700, fontSize: 12 }}>+ Sub-SKU</button>
                    {isAdmin && <DelBtn onClick={() => doDelete(`/warehouse/skus/${s.id}`, reload)} />}
                  </div>
                </div>

                {s.subs && s.subs.length > 0 && (
                  <div style={{ marginTop: 10, display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {s.subs.map(sub => (
                      <span key={sub.id} style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "#f1f3f5", borderRadius: 20, padding: "3px 10px", fontSize: 12 }}>
                        <b style={{ fontFamily: "monospace" }}>{sub.sub_code}</b>{sub.channel ? ` · ${sub.channel}` : ""}
                        <X size={12} style={{ cursor: "pointer", color: "#adb5bd" }} onClick={() => doDelete(`/warehouse/skus/${s.id}/subs/${sub.id}`, reload)} />
                      </span>
                    ))}
                  </div>
                )}

                {subFor === s.id && (
                  <div style={{ marginTop: 10, border: "1px solid #e9ecef", borderRadius: 10, padding: 10, background: "#fafbff" }}>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 8 }}>
                      <input style={S.input} placeholder="Sub-SKU code *" value={sub.sub_code} onChange={e => setSub(v => ({ ...v, sub_code: e.target.value }))} />
                      <input style={S.input} placeholder="Channel (e.g. Amarasha)" value={sub.channel} onChange={e => setSub(v => ({ ...v, channel: e.target.value }))} />
                      <input style={S.input} placeholder="Barcode" value={sub.barcode} onChange={e => setSub(v => ({ ...v, barcode: e.target.value }))} />
                    </div>
                    <button onClick={() => addSub(s.id)} style={{ ...S.btn, padding: "8px 14px", fontSize: 13 }}>Add Sub-SKU</button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ─────────────────────────── RACKS ─────────────────────────── */
function RacksTab({ racks, reload, isAdmin }) {
  const [form, setForm] = useState({ code: "", zone: "", barcode: "" });
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(false);
  const [contents, setContents] = useState(null);

  const submit = async (e) => {
    e.preventDefault(); setLoading(true); setMsg("");
    try {
      await api.post("/warehouse/racks", form);
      setMsg("✅ Rack added!");
      setForm({ code: "", zone: "", barcode: "" });
      reload();
    } catch (e) { setMsg(e.response?.data?.detail || "Error"); }
    finally { setLoading(false); }
  };

  const view = async (r) => {
    try { const { data } = await api.get(`/warehouse/rack/${r.id}`); setContents(data); }
    catch { setContents(null); }
  };

  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(260px,340px) 1fr", gap: 20, alignItems: "start" }}>
      <div style={S.card}>
        <div style={S.header}><h3 style={S.h3}><Plus size={15} /> New Rack</h3></div>
        <form onSubmit={submit} style={{ padding: 20 }}>
          <Msg msg={msg} />
          <div style={{ marginBottom: 14 }}>
            <label style={S.label}>Rack Code</label>
            <input style={S.input} placeholder="e.g. A1" value={form.code} onChange={e => setForm(f => ({ ...f, code: e.target.value }))} required />
          </div>
          <div style={{ marginBottom: 14 }}>
            <label style={S.label}>Zone (optional)</label>
            <input style={S.input} placeholder="e.g. Zone A / Mezzanine" value={form.zone} onChange={e => setForm(f => ({ ...f, zone: e.target.value }))} />
          </div>
          <div style={{ marginBottom: 18 }}>
            <label style={S.label}>Barcode (optional)</label>
            <input style={S.input} value={form.barcode} onChange={e => setForm(f => ({ ...f, barcode: e.target.value }))} />
          </div>
          <button type="submit" style={{ ...S.btn, width: "100%", opacity: loading ? 0.7 : 1 }} disabled={loading}>{loading ? "Adding..." : "Add Rack"}</button>
        </form>
      </div>

      <div style={S.card}>
        <div style={S.header}><h3 style={S.h3}><MapPin size={15} /> Racks ({racks.length})</h3></div>
        {racks.length === 0 ? (
          <div style={{ textAlign: "center", padding: 48, color: "#adb5bd", fontSize: 14 }}>No racks yet</div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead><tr style={{ background: "#f8f9fc" }}>{["Rack", "Zone", "SKUs", "Units", ""].map(h => <th key={h} style={S.th}>{h}</th>)}</tr></thead>
              <tbody>
                {racks.map((r, i) => (
                  <tr key={r.id} style={{ borderTop: "1px solid #f0f0f0", background: i % 2 ? "#fafafa" : "white" }}>
                    <td style={S.td}><span style={{ fontWeight: 700 }}>{r.code}</span>{r.barcode ? <div style={{ fontSize: 11, color: "#adb5bd" }}>{r.barcode}</div> : null}</td>
                    <td style={S.td}>{r.zone || "—"}</td>
                    <td style={S.td}>{r.distinct_skus}</td>
                    <td style={S.td}><b>{r.total_units}</b></td>
                    <td style={{ ...S.td, textAlign: "right" }}>
                      <div style={{ display: "inline-flex", gap: 6 }}>
                        <button onClick={() => view(r)} style={{ background: "#f1f3f5", border: "none", borderRadius: 8, padding: "6px 10px", cursor: "pointer", color: "#495057", fontSize: 12, fontWeight: 600 }}>View</button>
                        {isAdmin && <DelBtn onClick={() => doDelete(`/warehouse/racks/${r.id}`, reload)} />}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {contents && (
        <div onClick={() => setContents(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16, zIndex: 200 }}>
          <div onClick={e => e.stopPropagation()} style={{ ...S.card, width: "100%", maxWidth: 480, maxHeight: "80vh", display: "flex", flexDirection: "column" }}>
            <div style={{ ...S.header, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h3 style={S.h3}><MapPin size={15} /> Rack {contents.code}{contents.zone ? ` · ${contents.zone}` : ""}</h3>
              <X size={18} style={{ cursor: "pointer" }} onClick={() => setContents(null)} />
            </div>
            <div style={{ padding: 20, overflowY: "auto" }}>
              {contents.items.length === 0 ? (
                <div style={{ textAlign: "center", color: "#adb5bd", fontSize: 14, padding: 20 }}>Rack is empty</div>
              ) : contents.items.map((it, i) => (
                <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: i < contents.items.length - 1 ? "1px solid #f0f0f0" : "none", fontSize: 13 }}>
                  <span><b style={{ fontFamily: "monospace" }}>{it.sku_code}</b>{it.name ? ` · ${it.name}` : ""}</span>
                  <span style={{ fontWeight: 700 }}>{it.qty}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

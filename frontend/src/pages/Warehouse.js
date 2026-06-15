import { useState, useEffect, useRef, Fragment } from "react";
import Layout from "../components/Layout";
import api from "../api";
import { useAuth } from "../context/AuthContext";
import { Boxes, Plus, Layers, ScanLine, Trash2, X, MapPin, PackagePlus, Upload, RotateCcw, AlertTriangle, SlidersHorizontal, Printer } from "lucide-react";

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
  const [templates, setTemplates] = useState([]);
  const [quarantine, setQuarantine] = useState([]);

  const loadSkus = () => api.get("/warehouse/skus").then(r => setSkus(r.data));
  const loadRacks = () => api.get("/warehouse/racks").then(r => setRacks(r.data));
  const loadStock = () => api.get("/warehouse/stock").then(r => setStock(r.data));
  const loadTemplates = () => api.get("/warehouse/templates").then(r => setTemplates(r.data));
  const loadQuarantine = () => api.get("/warehouse/quarantine").then(r => setQuarantine(r.data));
  const loadAll = () => { loadSkus(); loadRacks(); loadStock(); loadTemplates(); loadQuarantine(); };
  useEffect(loadAll, []);

  const tabs = [
    ["inward", "Inward", ScanLine],
    ["outward", "Outward", Upload],
    ["returns", "Returns", RotateCcw],
    ["quarantine", "Quarantine", AlertTriangle],
    ["stock", "Stock", Boxes],
    ["skus", "SKUs", Layers],
    ["racks", "Racks", MapPin],
    ["templates", "Templates", SlidersHorizontal],
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
      {tab === "outward" && <OutwardTab templates={templates} reload={loadAll} />}
      {tab === "returns" && <ReturnsTab templates={templates} reload={loadAll} />}
      {tab === "quarantine" && <QuarantineTab quarantine={quarantine} reload={loadAll} />}
      {tab === "stock" && <StockTab stock={stock} />}
      {tab === "skus" && <SkusTab skus={skus} reload={loadAll} isAdmin={isAdmin} />}
      {tab === "racks" && <RacksTab racks={racks} reload={loadAll} isAdmin={isAdmin} />}
      {tab === "templates" && <TemplatesTab templates={templates} reload={loadTemplates} isAdmin={isAdmin} />}
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

  const [bulkResult, setBulkResult] = useState(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const bulkRef = useRef(null);

  const downloadInwardTemplate = () => {
    const csv = "rack,sku,qty\nA1,DB-D011DR-A-L,20\nA2,DB-D288DR-M,15\n";
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url; a.download = "inward_template.csv"; a.click();
    URL.revokeObjectURL(url);
  };

  const uploadBulk = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBulkBusy(true); setBulkResult(null);
    try {
      const fd = new FormData(); fd.append("file", file);
      const { data } = await api.post("/warehouse/inward/bulk", fd);
      setBulkResult(data);
      reload();
    } catch (e) { alert(e.response?.data?.detail || "Could not read the file"); }
    finally { setBulkBusy(false); if (bulkRef.current) bulkRef.current.value = ""; }
  };

  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(320px,440px) 1fr", gap: 20, alignItems: "start" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
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
        <div style={S.header}><h3 style={S.h3}><Upload size={15} /> Bulk Inward (file)</h3></div>
        <div style={{ padding: 20 }}>
          <p style={{ fontSize: 13, color: "#6c757d", marginTop: 0 }}>Upload a CSV / Excel with columns: <b>rack, sku, qty</b>. Each row adds stock to that rack.</p>
          <button onClick={downloadInwardTemplate} style={{ background: "#eef2ff", color: "#3730a3", border: "none", borderRadius: 10, padding: "10px 14px", fontWeight: 700, cursor: "pointer", fontSize: 13, width: "100%", marginBottom: 10 }}>Download template (CSV)</button>
          <input ref={bulkRef} type="file" accept=".csv,.xlsx,.xlsm" onChange={uploadBulk} style={{ display: "none" }} />
          <button onClick={() => bulkRef.current?.click()} disabled={bulkBusy} style={{ ...S.btn, width: "100%", opacity: bulkBusy ? 0.7 : 1 }}>{bulkBusy ? "Uploading..." : "Choose file & upload"}</button>
          {bulkResult && (
            <div style={{ marginTop: 14 }}>
              <div style={{ background: "#d1f5ea", borderRadius: 8, padding: "8px 12px", fontSize: 13, color: "#1b5e20", fontWeight: 700 }}>
                ✅ {bulkResult.created_units} units in ({bulkResult.created_rows} of {bulkResult.total} rows)
              </div>
              {bulkResult.skipped && bulkResult.skipped.length > 0 && (
                <div style={{ marginTop: 8, border: "1px solid #ffe69c", borderRadius: 8, overflow: "hidden" }}>
                  <div style={{ background: "#fff3cd", padding: "6px 12px", fontSize: 12, fontWeight: 700, color: "#7a5b00" }}>{bulkResult.skipped.length} skipped</div>
                  <div style={{ maxHeight: 150, overflowY: "auto" }}>
                    {bulkResult.skipped.map((s, i) => (
                      <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "5px 12px", fontSize: 12, borderTop: "1px solid #fff3cd" }}>
                        <span>Row {s.row}{s.detail ? ` · ${s.detail}` : ""}</span>
                        <span style={{ color: "#b71c1c" }}>{s.reason}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
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

  const [bulkResult, setBulkResult] = useState(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const fileRef = useRef(null);

  const downloadTemplate = () => {
    const csv = "sku_code,name,size,barcode\nDB-D011DR-A-L,Floral Dress,L,890000000001\nDB-D288DR-M,Stripe Dress,M,\n";
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url; a.download = "sku_upload_template.csv"; a.click();
    URL.revokeObjectURL(url);
  };

  const uploadFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBulkBusy(true); setBulkResult(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const { data } = await api.post("/warehouse/skus/bulk", fd);
      setBulkResult(data);
      reload();
    } catch (e) { alert(e.response?.data?.detail || "Could not read the file"); }
    finally { setBulkBusy(false); if (fileRef.current) fileRef.current.value = ""; }
  };

  const [subResult, setSubResult] = useState(null);
  const [subBusy, setSubBusy] = useState(false);
  const subRef = useRef(null);

  const downloadSubTemplate = () => {
    const csv = "master_sku,sub_sku,channel,barcode\nDB-D011DR-A-L,AMR-FLORAL-L,Amarasha,890999\nDB-D011DR-A-L,MYN-99231-L,Myntra,\n";
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url; a.download = "sub_sku_mapping_template.csv"; a.click();
    URL.revokeObjectURL(url);
  };

  const uploadSubs = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setSubBusy(true); setSubResult(null);
    try {
      const fd = new FormData(); fd.append("file", file);
      const { data } = await api.post("/warehouse/subs/bulk", fd);
      setSubResult(data);
      reload();
    } catch (e) { alert(e.response?.data?.detail || "Could not read the file"); }
    finally { setSubBusy(false); if (subRef.current) subRef.current.value = ""; }
  };

  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(280px,360px) 1fr", gap: 20, alignItems: "start" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
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
          <div style={S.header}><h3 style={S.h3}><PackagePlus size={15} /> Bulk Upload SKUs</h3></div>
          <div style={{ padding: 20 }}>
            <p style={{ fontSize: 13, color: "#6c757d", marginTop: 0 }}>Upload a CSV or Excel file with columns: <b>sku_code, name, size, barcode</b>. Only sku_code is required.</p>
            <button onClick={downloadTemplate} style={{ background: "#eef2ff", color: "#3730a3", border: "none", borderRadius: 10, padding: "10px 14px", fontWeight: 700, cursor: "pointer", fontSize: 13, width: "100%", marginBottom: 10 }}>Download template (CSV)</button>
            <input ref={fileRef} type="file" accept=".csv,.xlsx,.xlsm" onChange={uploadFile} style={{ display: "none" }} />
            <button onClick={() => fileRef.current?.click()} disabled={bulkBusy} style={{ ...S.btn, width: "100%", opacity: bulkBusy ? 0.7 : 1 }}>{bulkBusy ? "Uploading..." : "Choose file & upload"}</button>
            {bulkResult && (
              <div style={{ marginTop: 14 }}>
                <div style={{ background: "#d1f5ea", borderRadius: 8, padding: "8px 12px", fontSize: 13, color: "#1b5e20", fontWeight: 700 }}>
                  ✅ {bulkResult.created} added of {bulkResult.total} rows
                </div>
                {bulkResult.skipped && bulkResult.skipped.length > 0 && (
                  <div style={{ marginTop: 8, border: "1px solid #ffe69c", borderRadius: 8, overflow: "hidden" }}>
                    <div style={{ background: "#fff3cd", padding: "6px 12px", fontSize: 12, fontWeight: 700, color: "#7a5b00" }}>{bulkResult.skipped.length} skipped</div>
                    <div style={{ maxHeight: 160, overflowY: "auto" }}>
                      {bulkResult.skipped.map((s, i) => (
                        <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "5px 12px", fontSize: 12, borderTop: "1px solid #fff3cd" }}>
                          <span>Row {s.row}{s.sku_code ? ` · ${s.sku_code}` : ""}</span>
                          <span style={{ color: "#b71c1c" }}>{s.reason}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        <div style={S.card}>
          <div style={S.header}><h3 style={S.h3}><Layers size={15} /> Bulk Map Sub-SKUs</h3></div>
          <div style={{ padding: 20 }}>
            <p style={{ fontSize: 13, color: "#6c757d", marginTop: 0 }}>Link channel codes to existing masters. Columns: <b>master_sku, sub_sku, channel, barcode</b>. The master must already exist.</p>
            <button onClick={downloadSubTemplate} style={{ background: "#eef2ff", color: "#3730a3", border: "none", borderRadius: 10, padding: "10px 14px", fontWeight: 700, cursor: "pointer", fontSize: 13, width: "100%", marginBottom: 10 }}>Download template (CSV)</button>
            <input ref={subRef} type="file" accept=".csv,.xlsx,.xlsm" onChange={uploadSubs} style={{ display: "none" }} />
            <button onClick={() => subRef.current?.click()} disabled={subBusy} style={{ ...S.btn, width: "100%", opacity: subBusy ? 0.7 : 1 }}>{subBusy ? "Uploading..." : "Choose file & upload"}</button>
            {subResult && (
              <div style={{ marginTop: 14 }}>
                <div style={{ background: "#d1f5ea", borderRadius: 8, padding: "8px 12px", fontSize: 13, color: "#1b5e20", fontWeight: 700 }}>
                  ✅ {subResult.created} mapped of {subResult.total} rows
                </div>
                {subResult.skipped && subResult.skipped.length > 0 && (
                  <div style={{ marginTop: 8, border: "1px solid #ffe69c", borderRadius: 8, overflow: "hidden" }}>
                    <div style={{ background: "#fff3cd", padding: "6px 12px", fontSize: 12, fontWeight: 700, color: "#7a5b00" }}>{subResult.skipped.length} skipped</div>
                    <div style={{ maxHeight: 160, overflowY: "auto" }}>
                      {subResult.skipped.map((s, i) => (
                        <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "5px 12px", fontSize: 12, borderTop: "1px solid #fff3cd" }}>
                          <span>Row {s.row}{s.detail ? ` · ${s.detail}` : ""}</span>
                          <span style={{ color: "#b71c1c" }}>{s.reason}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
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

/* ─────────────────────────── OUTWARD (upload pick list) ─────────────────────────── */
function printGuide(title, lines) {
  const rows = lines.map(l => {
    const picks = (l.picks || []).map(p => `${p.rack_code}: ${p.qty}`).join(", ") || "—";
    const short = l.shortfall ? ` (SHORT ${l.shortfall})` : "";
    return `<tr><td style="padding:6px 10px;border-bottom:1px solid #ddd;font-family:monospace">${l.sku_code}</td><td style="padding:6px 10px;border-bottom:1px solid #ddd">${l.name || ""}</td><td style="padding:6px 10px;border-bottom:1px solid #ddd">${l.needed}</td><td style="padding:6px 10px;border-bottom:1px solid #ddd">${picks}${short}</td></tr>`;
  }).join("");
  const html = `<html><head><title>${title}</title></head><body style="font-family:sans-serif">
    <h2>${title}</h2><p>${new Date().toLocaleString("en-IN")}</p>
    <table style="border-collapse:collapse;width:100%"><thead><tr style="background:#f0f0f0">
    <th style="padding:6px 10px;text-align:left">SKU</th><th style="padding:6px 10px;text-align:left">Product</th><th style="padding:6px 10px;text-align:left">Qty</th><th style="padding:6px 10px;text-align:left">Pick from rack</th>
    </tr></thead><tbody>${rows}</tbody></table></body></html>`;
  const w = window.open("", "_blank");
  w.document.write(html); w.document.close(); w.focus(); w.print();
}

function OutwardTab({ templates, reload }) {
  const [marketplace, setMarketplace] = useState("");
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [committed, setCommitted] = useState(null);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const fileRef = useRef(null);

  const doPreview = async () => {
    if (!marketplace || !file) { setMsg("Pick a marketplace and a file"); return; }
    setBusy(true); setMsg(""); setCommitted(null); setPreview(null);
    try {
      const fd = new FormData(); fd.append("marketplace", marketplace); fd.append("file", file);
      const { data } = await api.post("/warehouse/upload/preview", fd);
      setPreview(data);
    } catch (e) { setMsg(e.response?.data?.detail || "Could not read the file"); }
    finally { setBusy(false); }
  };

  const doCommit = async () => {
    if (!marketplace || !file) return;
    if (!window.confirm("Deduct this stock now? This updates your inventory.")) return;
    setBusy(true); setMsg("");
    try {
      const fd = new FormData(); fd.append("marketplace", marketplace); fd.append("file", file);
      const { data } = await api.post("/warehouse/upload/commit", fd);
      setCommitted(data); setPreview(null); setFile(null);
      if (fileRef.current) fileRef.current.value = "";
      reload();
    } catch (e) { setMsg(e.response?.data?.detail || "Error"); }
    finally { setBusy(false); }
  };

  const result = committed || preview;
  const isCommitted = !!committed;

  return (
    <div>
      <div style={{ ...S.card, marginBottom: 20 }}>
        <div style={S.header}><h3 style={S.h3}><Upload size={15} /> Upload Marketplace Pick List / Order File</h3></div>
        <div style={{ padding: 20 }}>
          <Msg msg={msg} />
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
            <div style={{ flex: "1 1 200px" }}>
              <label style={S.label}>Marketplace</label>
              <select style={S.input} value={marketplace} onChange={e => { setMarketplace(e.target.value); setPreview(null); setCommitted(null); }}>
                <option value="">Select…</option>
                {templates.map(t => <option key={t.id} value={t.name}>{t.name}</option>)}
              </select>
            </div>
            <div style={{ flex: "1 1 220px" }}>
              <label style={S.label}>File (CSV / Excel)</label>
              <input ref={fileRef} type="file" accept=".csv,.xlsx,.xlsm" onChange={e => { setFile(e.target.files?.[0] || null); setPreview(null); setCommitted(null); }} style={{ ...S.input, padding: 8 }} />
            </div>
            <button onClick={doPreview} disabled={busy} style={{ ...S.btn, opacity: busy ? 0.7 : 1 }}>{busy ? "Reading..." : "Preview"}</button>
          </div>
          {templates.length === 0 && <div style={{ fontSize: 12, color: "#b71c1c", marginTop: 10 }}>No templates yet — set one up in the Templates tab first.</div>}
        </div>
      </div>

      {result && (
        <div style={S.card}>
          <div style={{ ...S.header, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <h3 style={S.h3}>{isCommitted ? "✅ Deducted — Pick Guide" : "Preview — Pick Guide"}</h3>
            <button onClick={() => printGuide(`${marketplace} pick guide`, result.lines)} style={{ background: "rgba(255,255,255,0.15)", border: "1px solid rgba(255,255,255,0.3)", color: "white", borderRadius: 8, padding: "5px 12px", cursor: "pointer", fontSize: 12, fontWeight: 700, display: "flex", alignItems: "center", gap: 5 }}><Printer size={13} /> Print</button>
          </div>
          <div style={{ padding: 16 }}>
            <div style={{ display: "flex", gap: 18, flexWrap: "wrap", marginBottom: 14, fontSize: 13 }}>
              <span><b>{result.lines.length}</b> SKUs matched</span>
              {isCommitted ? <span><b>{committed.deducted_units}</b> units deducted</span> : <span><b>{result.totals.units_to_pick}</b> units to pick</span>}
              {result.totals.units_short > 0 && <span style={{ color: "#b71c1c" }}><b>{result.totals.units_short}</b> short</span>}
              {(result.totals.unmatched_units || result.totals.unmatched?.length) ? <span style={{ color: "#7a5b00" }}><b>{result.unmatched.length}</b> unmatched SKUs ({result.totals.unmatched_units} units)</span> : null}
            </div>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead><tr style={{ background: "#f8f9fc" }}>{["SKU", "Qty", "Available", "Pick from rack", "Short"].map(h => <th key={h} style={S.th}>{h}</th>)}</tr></thead>
                <tbody>
                  {result.lines.map((l, i) => (
                    <tr key={i} style={{ borderTop: "1px solid #f0f0f0" }}>
                      <td style={S.td}><span style={{ fontFamily: "monospace", fontWeight: 700 }}>{l.sku_code}</span>{l.name ? <div style={{ fontSize: 11, color: "#adb5bd" }}>{l.name}</div> : null}</td>
                      <td style={S.td}>{l.needed}</td>
                      <td style={S.td}>{l.available}</td>
                      <td style={S.td}>{l.picks && l.picks.length ? l.picks.map(p => <span key={p.rack_id} style={{ ...S.pill("#e8eaf6", "#283593"), marginRight: 4 }}>{p.rack_code}: {p.qty}</span>) : "—"}</td>
                      <td style={S.td}>{l.shortfall ? <span style={S.pill("#ffe0e3", "#b71c1c")}>{l.shortfall}</span> : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {result.unmatched && result.unmatched.length > 0 && (
              <div style={{ marginTop: 16, border: "1px solid #ffe69c", borderRadius: 10, overflow: "hidden" }}>
                <div style={{ background: "#fff3cd", padding: "8px 14px", fontSize: 13, fontWeight: 700, color: "#7a5b00" }}>
                  {result.unmatched.length} SKU(s) in the file are not in your master — skipped, not deducted. Add them (SKUs tab) and re-upload.
                </div>
                <div style={{ maxHeight: 180, overflowY: "auto", padding: 10, display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {result.unmatched.map((u, i) => <span key={i} style={{ background: "#f8f9fc", borderRadius: 20, padding: "3px 10px", fontSize: 12, fontFamily: "monospace" }}>{u.code} ×{u.qty}</span>)}
                </div>
              </div>
            )}

            {!isCommitted && (
              <button onClick={doCommit} disabled={busy} style={{ ...S.btn, width: "100%", marginTop: 16, background: "#1b5e20" }}>
                {busy ? "Deducting..." : "Confirm & Deduct Stock"}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────── RETURNS (upload to quarantine) ─────────────────────────── */
function ReturnsTab({ templates, reload }) {
  const [marketplace, setMarketplace] = useState("");
  const [file, setFile] = useState(null);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const fileRef = useRef(null);

  const upload = async () => {
    if (!marketplace || !file) { setMsg("Pick a marketplace and a file"); return; }
    if (!window.confirm("Add these returns to quarantine?")) return;
    setBusy(true); setMsg(""); setResult(null);
    try {
      const fd = new FormData(); fd.append("marketplace", marketplace); fd.append("file", file);
      const { data } = await api.post("/warehouse/returns/upload", fd);
      setResult(data); setFile(null);
      if (fileRef.current) fileRef.current.value = "";
      reload();
    } catch (e) { setMsg(e.response?.data?.detail || "Error"); }
    finally { setBusy(false); }
  };

  return (
    <div style={S.card}>
      <div style={S.header}><h3 style={S.h3}><RotateCcw size={15} /> Upload Return File → Quarantine</h3></div>
      <div style={{ padding: 20 }}>
        <Msg msg={msg} />
        <p style={{ fontSize: 13, color: "#6c757d", marginTop: 0 }}>Returned items go into <b>quarantine</b> first. Inspect them in the Quarantine tab, then restock the good ones or scrap the bad ones.</p>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
          <div style={{ flex: "1 1 200px" }}>
            <label style={S.label}>Marketplace</label>
            <select style={S.input} value={marketplace} onChange={e => setMarketplace(e.target.value)}>
              <option value="">Select…</option>
              {templates.map(t => <option key={t.id} value={t.name}>{t.name}</option>)}
            </select>
          </div>
          <div style={{ flex: "1 1 220px" }}>
            <label style={S.label}>Return file (CSV / Excel)</label>
            <input ref={fileRef} type="file" accept=".csv,.xlsx,.xlsm" onChange={e => setFile(e.target.files?.[0] || null)} style={{ ...S.input, padding: 8 }} />
          </div>
          <button onClick={upload} disabled={busy} style={{ ...S.btn, opacity: busy ? 0.7 : 1 }}>{busy ? "Uploading..." : "Add to Quarantine"}</button>
        </div>
        {result && (
          <div style={{ marginTop: 16 }}>
            <div style={{ background: "#d1f5ea", borderRadius: 8, padding: "10px 14px", fontSize: 13, color: "#1b5e20", fontWeight: 700 }}>
              ✅ {result.added_to_quarantine} unit(s) added to quarantine across {result.matched_skus} SKU(s). Go to the Quarantine tab to restock or scrap.
            </div>
            {result.unmatched && result.unmatched.length > 0 && (
              <div style={{ marginTop: 10, fontSize: 12, color: "#7a5b00" }}>{result.unmatched.length} unmatched SKU(s) skipped: {result.unmatched.map(u => `${u.code}×${u.qty}`).join(", ")}</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/* ─────────────────────────── QUARANTINE ─────────────────────────── */
function QuarantineTab({ quarantine, reload }) {
  const [action, setAction] = useState(null); // {master_id, mode:'restock'|'scrap'}
  const [rack, setRack] = useState("");
  const [qty, setQty] = useState(1);
  const [msg, setMsg] = useState("");

  const start = (q, mode) => { setAction({ ...q, mode }); setRack(""); setQty(q.qty); setMsg(""); };

  const submit = async () => {
    try {
      if (action.mode === "restock") {
        if (!rack.trim()) { setMsg("Scan / type a rack"); return; }
        await api.post("/warehouse/quarantine/restock", { master_id: action.master_id, rack_code: rack, qty: parseInt(qty) || 0 });
      } else {
        await api.post("/warehouse/quarantine/scrap", { master_id: action.master_id, qty: parseInt(qty) || 0 });
      }
      setAction(null); reload();
    } catch (e) { setMsg(e.response?.data?.detail || "Error"); }
  };

  return (
    <div style={S.card}>
      <div style={S.header}><h3 style={S.h3}><AlertTriangle size={15} /> Quarantine — Returns to Inspect ({quarantine.length})</h3></div>
      {quarantine.length === 0 ? (
        <div style={{ textAlign: "center", padding: 48, color: "#adb5bd", fontSize: 14 }}>Nothing in quarantine</div>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr style={{ background: "#f8f9fc" }}>{["SKU", "Size", "In quarantine", ""].map(h => <th key={h} style={S.th}>{h}</th>)}</tr></thead>
            <tbody>
              {quarantine.map((q) => (
                <Fragment key={q.master_id}>
                  <tr style={{ borderTop: "1px solid #f0f0f0" }}>
                    <td style={S.td}><span style={{ fontFamily: "monospace", fontWeight: 700 }}>{q.sku_code}</span>{q.name ? <div style={{ fontSize: 11, color: "#adb5bd" }}>{q.name}</div> : null}</td>
                    <td style={S.td}>{q.size || "—"}</td>
                    <td style={S.td}><span style={S.pill("#ffe0e3", "#b71c1c")}>{q.qty}</span></td>
                    <td style={{ ...S.td, textAlign: "right" }}>
                      <div style={{ display: "inline-flex", gap: 6 }}>
                        <button onClick={() => start(q, "restock")} style={{ ...S.btn, padding: "6px 12px", fontSize: 12, background: "#1b5e20" }}>Restock</button>
                        <button onClick={() => start(q, "scrap")} style={{ ...S.btn, padding: "6px 12px", fontSize: 12, background: "#b71c1c" }}>Scrap</button>
                      </div>
                    </td>
                  </tr>
                  {action && action.master_id === q.master_id && (
                    <tr style={{ background: "#fafbff" }}>
                      <td colSpan={4} style={{ padding: 14 }}>
                        <Msg msg={msg} />
                        <div style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap" }}>
                          {action.mode === "restock" && (
                            <div style={{ flex: "1 1 200px" }}>
                              <label style={S.label}>Scan / type rack to place stock</label>
                              <input autoFocus style={S.input} value={rack} onChange={e => setRack(e.target.value)} placeholder="e.g. A1" />
                            </div>
                          )}
                          <div style={{ width: 110 }}>
                            <label style={S.label}>Qty ({action.mode})</label>
                            <input style={S.input} type="number" min="1" max={q.qty} value={qty} onChange={e => setQty(e.target.value)} />
                          </div>
                          <button onClick={submit} style={{ ...S.btn, background: action.mode === "restock" ? "#1b5e20" : "#b71c1c" }}>{action.mode === "restock" ? "Restock to rack" : "Scrap"}</button>
                          <button onClick={() => setAction(null)} style={{ ...S.btn, background: "#e9ecef", color: "#495057" }}>Cancel</button>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────── TEMPLATES (column mapping) ─────────────────────────── */
function TemplatesTab({ templates, reload, isAdmin }) {
  const blank = { name: "", sku_column: "", qty_column: "", order_id_column: "", status_column: "", status_include: "" };
  const [form, setForm] = useState(blank);
  const [editId, setEditId] = useState(null);
  const [headers, setHeaders] = useState([]);
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(false);
  const fileRef = useRef(null);

  const loadHeaders = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const fd = new FormData(); fd.append("file", file);
      const { data } = await api.post("/warehouse/templates/headers", fd);
      setHeaders(data.headers || []);
      setMsg(data.headers?.length ? `✅ Loaded ${data.headers.length} columns from the file — pick the mappings below.` : "No columns found in that file");
    } catch (e) { setMsg(e.response?.data?.detail || "Could not read the file"); }
    finally { if (fileRef.current) fileRef.current.value = ""; }
  };

  const submit = async (e) => {
    e.preventDefault(); setLoading(true); setMsg("");
    try {
      if (editId) await api.patch(`/warehouse/templates/${editId}`, form);
      else await api.post("/warehouse/templates", form);
      setForm(blank); setEditId(null); setHeaders([]);
      setMsg("✅ Saved!");
      reload();
    } catch (e) { setMsg(e.response?.data?.detail || "Error"); }
    finally { setLoading(false); }
  };

  const startEdit = (t) => { setEditId(t.id); setForm({ name: t.name, sku_column: t.sku_column, qty_column: t.qty_column || "", order_id_column: t.order_id_column || "", status_column: t.status_column || "", status_include: t.status_include || "" }); setHeaders([]); setMsg(""); };

  const colField = (label, field, opts = {}) => (
    <div style={{ marginBottom: 12 }}>
      <label style={S.label}>{label}{opts.required ? " *" : ""}</label>
      {headers.length > 0 ? (
        <select style={S.input} value={form[field]} onChange={e => setForm(f => ({ ...f, [field]: e.target.value }))} required={opts.required}>
          <option value="">{opts.qtyHint ? "(each row = 1 unit)" : "(none)"}</option>
          {headers.map(h => <option key={h} value={h}>{h}</option>)}
        </select>
      ) : (
        <input style={S.input} value={form[field]} onChange={e => setForm(f => ({ ...f, [field]: e.target.value }))} placeholder={opts.qtyHint ? "blank = each row is 1 unit" : "exact column name"} required={opts.required} />
      )}
    </div>
  );

  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(300px,420px) 1fr", gap: 20, alignItems: "start" }}>
      <div style={S.card}>
        <div style={S.header}><h3 style={S.h3}><SlidersHorizontal size={15} /> {editId ? "Edit Template" : "New Marketplace Template"}</h3></div>
        <form onSubmit={submit} style={{ padding: 20 }}>
          <Msg msg={msg} />
          <div style={{ background: "#f8f9fc", borderRadius: 10, padding: 12, marginBottom: 14 }}>
            <label style={S.label}>Load columns from a sample file (optional)</label>
            <input ref={fileRef} type="file" accept=".csv,.xlsx,.xlsm" onChange={loadHeaders} style={{ ...S.input, padding: 8 }} />
            <div style={{ fontSize: 11, color: "#adb5bd", marginTop: 6 }}>Upload any real file from this marketplace; we read its column names so you can map them by picking, not typing.</div>
          </div>
          <div style={{ marginBottom: 12 }}>
            <label style={S.label}>Marketplace Name *</label>
            <input style={S.input} value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Flipkart" required />
          </div>
          {colField("SKU column", "sku_column", { required: true })}
          {colField("Quantity column", "qty_column", { qtyHint: true })}
          {colField("Order ID column", "order_id_column")}
          {colField("Status column", "status_column")}
          <div style={{ marginBottom: 16 }}>
            <label style={S.label}>Only count these statuses (optional)</label>
            <input style={S.input} value={form.status_include} onChange={e => setForm(f => ({ ...f, status_include: e.target.value }))} placeholder="e.g. CREATED, CONFIRMED (blank = all rows)" />
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button type="submit" style={{ ...S.btn, flex: 1, opacity: loading ? 0.7 : 1 }} disabled={loading}>{loading ? "Saving..." : editId ? "Update" : "Save Template"}</button>
            {editId && <button type="button" onClick={() => { setEditId(null); setForm(blank); setHeaders([]); setMsg(""); }} style={{ ...S.btn, flex: 1, background: "#e9ecef", color: "#495057" }}>Cancel</button>}
          </div>
        </form>
      </div>

      <div style={S.card}>
        <div style={S.header}><h3 style={S.h3}><SlidersHorizontal size={15} /> Templates ({templates.length})</h3></div>
        {templates.length === 0 ? (
          <div style={{ textAlign: "center", padding: 48, color: "#adb5bd", fontSize: 14 }}>No templates yet</div>
        ) : (
          <div style={{ padding: 12 }}>
            {templates.map(t => (
              <div key={t.id} style={{ border: "1px solid #f0f0f0", borderRadius: 12, padding: 14, marginBottom: 10 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 15 }}>{t.name}</div>
                    <div style={{ fontSize: 12, color: "#6c757d", marginTop: 4 }}>
                      SKU: <b>{t.sku_column}</b> · Qty: <b>{t.qty_column || "1 per row"}</b>
                      {t.status_column ? <> · Status: <b>{t.status_column}</b>{t.status_include ? ` (${t.status_include})` : ""}</> : null}
                    </div>
                  </div>
                  <div style={{ display: "inline-flex", gap: 6 }}>
                    <button onClick={() => startEdit(t)} style={{ background: "#e8f4fd", border: "none", borderRadius: 8, padding: "6px 12px", cursor: "pointer", color: "#1565c0", fontWeight: 700, fontSize: 12 }}>Edit</button>
                    {isAdmin && <DelBtn onClick={() => doDelete(`/warehouse/templates/${t.id}`, reload)} />}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
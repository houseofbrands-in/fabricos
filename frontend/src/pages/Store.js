import { useState, useEffect } from "react";
import Layout from "../components/Layout";
import api from "../api";
import { useAuth } from "../context/AuthContext";
import { Layers, Plus, Truck, ClipboardCheck, PackageCheck, AlertTriangle, ArrowLeft, Trash2, X, History, RefreshCw } from "lucide-react";

const S = {
  card: { background: "white", borderRadius: 16, boxShadow: "0 2px 12px rgba(0,0,0,0.06)", overflow: "hidden" },
  header: { background: "linear-gradient(135deg,#1a1a2e,#0f3460)", color: "white", padding: "14px 20px" },
  h3: { margin: 0, fontSize: 15, fontWeight: 700, display: "flex", alignItems: "center", gap: 6 },
  input: { width: "100%", border: "1.5px solid #dee2e6", borderRadius: 10, padding: "10px 12px", fontSize: 14, outline: "none", boxSizing: "border-box" },
  label: { fontSize: 12, fontWeight: 700, color: "#495057", display: "block", marginBottom: 4 },
  btn: { background: "#e94560", color: "white", border: "none", borderRadius: 10, padding: "11px 20px", fontWeight: 700, cursor: "pointer", fontSize: 14 },
  th: { padding: "10px 16px", textAlign: "left", fontSize: 12, fontWeight: 700, color: "#6c757d" },
  td: { padding: "10px 16px", fontSize: 13 },
  pill: (bg, c) => ({ background: bg, color: c, borderRadius: 20, padding: "2px 10px", fontSize: 12, fontWeight: 700, display: "inline-block" }),
};

const DEFECTS = ["shade variation", "weave defect", "width short"];

const EVENT_LABEL = {
  received: "Received", qc: "QC done", defective_open: "Defective logged",
  defective_resolved: "Defective resolved", sent_printing: "Sent to printing",
  sent_embroidery: "Sent to embroidery", returned_jobwork: "Returned from job work",
  issued_cutting: "Issued to cutting",
};

function Msg({ msg }) {
  if (!msg) return null;
  const ok = msg.startsWith("✅");
  return <div style={{ background: ok ? "#d1f5ea" : "#ffe0e3", borderRadius: 8, padding: "8px 12px", marginBottom: 14, fontSize: 13, color: ok ? "#1b5e20" : "#b71c1c" }}>{msg}</div>;
}

function DelBtn({ onClick }) {
  return (
    <button onClick={onClick} title="Delete" style={{ background: "#ffe0e3", border: "none", borderRadius: 8, padding: "6px 8px", cursor: "pointer", color: "#b71c1c", display: "inline-flex", alignItems: "center" }}>
      <Trash2 size={13} />
    </button>
  );
}

async function doDelete(url, reload) {
  if (!window.confirm("Delete this permanently? This cannot be undone.")) return;
  try {
    await api.delete(url);
  } catch (e) {
    // 404 = the item was already removed (e.g. cleared by a cascade). Just refresh quietly.
    if (e.response?.status !== 404) alert(e.response?.data?.detail || "Could not delete");
  }
  reload();
}

export default function Store() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const [tab, setTab] = useState("fabrics");
  const [fabrics, setFabrics] = useState([]);
  const [purchases, setPurchases] = useState([]);
  const [qcPending, setQcPending] = useState([]);
  const [jobWork, setJobWork] = useState([]);
  const [defective, setDefective] = useState([]);

  const loadFabrics = () => api.get("/fabric/").then(r => setFabrics(r.data));
  const loadPurchases = () => api.get("/fabric/purchase/list").then(r => setPurchases(r.data));
  const loadQcPending = () => api.get("/fabric/qc/pending").then(r => setQcPending(r.data));
  const loadJobWork = () => api.get("/fabric/job-work/list").then(r => setJobWork(r.data));
  const loadDefective = () => api.get("/fabric/defective").then(r => setDefective(r.data));
  const loadAll = () => { loadFabrics(); loadPurchases(); loadQcPending(); loadJobWork(); loadDefective(); };
  useEffect(loadAll, []);

  const lowCount = fabrics.filter(f => f.low_stock).length;
  const openDefects = defective.filter(d => d.status === "open").length;
  const tabs = [
    ["fabrics", "Fabrics", Layers],
    ["purchase", "Purchase", Truck],
    ["qc", "Fabric QC", ClipboardCheck],
    ["defective", "Defective", AlertTriangle],
    ["jobwork", "Job Work", PackageCheck],
  ];

  return (
    <Layout>
      <h2 style={{ fontWeight: 900, marginBottom: 4 }}>Fabric Store</h2>
      <p style={{ color: "#6c757d", marginBottom: 16, fontSize: 14 }}>Track fabric from purchase → QC → job work → cutting</p>

      {(lowCount > 0 || openDefects > 0) && (
        <div style={{ background: "#fff3cd", border: "1px solid #ffe69c", borderRadius: 12, padding: "10px 16px", marginBottom: 16, display: "flex", alignItems: "center", gap: 14, fontSize: 13, color: "#7a5b00", flexWrap: "wrap" }}>
          {lowCount > 0 && <span><AlertTriangle size={14} style={{ verticalAlign: -2 }} /> <b>{lowCount}</b> fabric{lowCount > 1 ? "s" : ""} low on stock</span>}
          {openDefects > 0 && <span><AlertTriangle size={14} style={{ verticalAlign: -2 }} /> <b>{openDefects}</b> defective lot{openDefects > 1 ? "s" : ""} awaiting a decision</span>}
        </div>
      )}

      <div style={{ display: "flex", gap: 4, marginBottom: 20, background: "white", borderRadius: 12, padding: 4, boxShadow: "0 2px 8px rgba(0,0,0,0.05)", width: "fit-content", flexWrap: "wrap" }}>
        {tabs.map(([key, label, Icon]) => (
          <button key={key} onClick={() => setTab(key)} style={{
            background: tab === key ? "#1a1a2e" : "transparent",
            color: tab === key ? "white" : "#6c757d",
            border: "none", borderRadius: 9, padding: "8px 16px",
            fontWeight: 700, fontSize: 13, cursor: "pointer",
            display: "flex", alignItems: "center", gap: 6,
          }}>
            <Icon size={14} /> {label}
            {key === "defective" && openDefects > 0 && (
              <span style={{ background: "#e94560", color: "white", borderRadius: 20, padding: "0 6px", fontSize: 11, fontWeight: 800 }}>{openDefects}</span>
            )}
          </button>
        ))}
      </div>

      {tab === "fabrics" && <FabricsTab fabrics={fabrics} reload={loadAll} isAdmin={isAdmin} />}
      {tab === "purchase" && <PurchaseTab fabrics={fabrics} purchases={purchases} isAdmin={isAdmin} reload={loadAll} />}
      {tab === "qc" && <QCTab pending={qcPending} reload={loadAll} />}
      {tab === "defective" && <DefectiveTab defective={defective} isAdmin={isAdmin} reload={loadAll} />}
      {tab === "jobwork" && <JobWorkTab fabrics={fabrics} jobWork={jobWork} isAdmin={isAdmin} reload={loadAll} />}
    </Layout>
  );
}

/* ─────────────────────────── FABRICS TAB ─────────────────────────── */
function FabricsTab({ fabrics, reload, isAdmin }) {
  const [form, setForm] = useState({ fabric_name: "", fabric_type: "grey", composition: "", supplier_name: "", low_stock_threshold: "" });
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState(null); // { fabric_name, events }

  const submit = async (e) => {
    e.preventDefault(); setLoading(true); setMsg("");
    try {
      await api.post("/fabric/", { ...form, low_stock_threshold: parseFloat(form.low_stock_threshold) || 0 });
      setMsg("✅ Fabric added!");
      setForm({ fabric_name: "", fabric_type: "grey", composition: "", supplier_name: "", low_stock_threshold: "" });
      reload();
    } catch (e) { setMsg(e.response?.data?.detail || "Error"); }
    finally { setLoading(false); }
  };

  const openHistory = async (f) => {
    try { const { data } = await api.get(`/fabric/${f.id}/history`); setHistory(data); }
    catch { setHistory({ fabric_name: f.fabric_name, events: [] }); }
  };

  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(280px,380px) 1fr", gap: 20, alignItems: "start" }}>
      <div style={S.card}>
        <div style={S.header}><h3 style={S.h3}><Plus size={15} /> New Fabric</h3></div>
        <form onSubmit={submit} style={{ padding: 20 }}>
          <Msg msg={msg} />
          <div style={{ marginBottom: 14 }}>
            <label style={S.label}>Fabric Name</label>
            <input style={S.input} placeholder="e.g. Cotton Poplin White 60s" value={form.fabric_name}
              onChange={e => setForm(f => ({ ...f, fabric_name: e.target.value }))} required />
          </div>
          <div style={{ marginBottom: 14 }}>
            <label style={S.label}>Type</label>
            <select style={S.input} value={form.fabric_type} onChange={e => setForm(f => ({ ...f, fabric_type: e.target.value }))}>
              <option value="grey">Grey</option>
              <option value="dyed">Dyed</option>
            </select>
          </div>
          <div style={{ marginBottom: 14 }}>
            <label style={S.label}>Composition / Quality (optional)</label>
            <input style={S.input} placeholder="e.g. 100% Cotton, 60s" value={form.composition}
              onChange={e => setForm(f => ({ ...f, composition: e.target.value }))} />
          </div>
          <div style={{ marginBottom: 14 }}>
            <label style={S.label}>Default Supplier (optional)</label>
            <input style={S.input} placeholder="e.g. Surat Mills" value={form.supplier_name}
              onChange={e => setForm(f => ({ ...f, supplier_name: e.target.value }))} />
          </div>
          <div style={{ marginBottom: 18 }}>
            <label style={S.label}>Low-stock alert below (metres)</label>
            <input style={S.input} type="number" min="0" placeholder="e.g. 50" value={form.low_stock_threshold}
              onChange={e => setForm(f => ({ ...f, low_stock_threshold: e.target.value }))} />
          </div>
          <button type="submit" style={{ ...S.btn, width: "100%", opacity: loading ? 0.7 : 1 }} disabled={loading}>
            {loading ? "Adding..." : "Add Fabric"}
          </button>
        </form>
      </div>

      <div style={S.card}>
        <div style={S.header}><h3 style={S.h3}><Layers size={15} /> Fabrics & Live Stock ({fabrics.length})</h3></div>
        {fabrics.length === 0 ? (
          <div style={{ textAlign: "center", padding: 48, color: "#adb5bd", fontSize: 14 }}>No fabrics yet</div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead><tr style={{ background: "#f8f9fc" }}>
                {["Fabric", "Type", "Available", "At Vendor", "Consumed", "Shrinkage", ""].map(h => <th key={h} style={S.th}>{h}</th>)}
              </tr></thead>
              <tbody>
                {fabrics.map((f, i) => (
                  <tr key={f.id} style={{ borderTop: "1px solid #f0f0f0", background: f.low_stock ? "#fff8f8" : (i % 2 ? "#fafafa" : "white") }}>
                    <td style={S.td}>
                      <div style={{ fontWeight: 600 }}>{f.fabric_name}</div>
                      {f.composition ? <div style={{ color: "#adb5bd", fontSize: 11 }}>{f.composition}</div> : null}
                      {f.supplier_name ? <div style={{ color: "#adb5bd", fontSize: 11 }}>{f.supplier_name}</div> : null}
                    </td>
                    <td style={S.td}><span style={S.pill(f.fabric_type === "grey" ? "#eceff1" : "#f3e5f5", f.fabric_type === "grey" ? "#455a64" : "#7b1fa2")}>{f.fabric_type}</span></td>
                    <td style={S.td}>
                      <span style={{ fontWeight: 900, fontSize: 16, color: f.low_stock ? "#b71c1c" : "#1b5e20" }}>{f.available} m</span>
                      {f.downgraded_kept > 0 && <div style={{ fontSize: 10, color: "#8a6d3b" }}>incl. {f.downgraded_kept} m downgraded</div>}
                      {f.low_stock && <div style={{ fontSize: 10, color: "#b71c1c", fontWeight: 700, marginTop: 2 }}><AlertTriangle size={10} style={{ verticalAlign: -1 }} /> LOW (below {f.low_stock_threshold})</div>}
                    </td>
                    <td style={S.td}>{f.at_vendor} m</td>
                    <td style={S.td}>{f.consumed} m</td>
                    <td style={S.td}>{f.shrinkage_lost} m</td>
                    <td style={{ ...S.td, textAlign: "right" }}>
                      <div style={{ display: "inline-flex", gap: 6 }}>
                        <button onClick={() => openHistory(f)} title="History" style={{ background: "#f1f3f5", border: "none", borderRadius: 8, padding: "6px 8px", cursor: "pointer", color: "#495057", display: "inline-flex", alignItems: "center", gap: 4, fontSize: 12, fontWeight: 600 }}>
                          <History size={13} /> History
                        </button>
                        {isAdmin && <DelBtn onClick={() => doDelete(`/fabric/${f.id}`, reload)} />}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {history && (
        <div onClick={() => setHistory(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16, zIndex: 200 }}>
          <div onClick={e => e.stopPropagation()} style={{ ...S.card, width: "100%", maxWidth: 520, maxHeight: "80vh", display: "flex", flexDirection: "column" }}>
            <div style={{ ...S.header, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h3 style={S.h3}><History size={15} /> {history.fabric_name} — Timeline</h3>
              <X size={18} style={{ cursor: "pointer" }} onClick={() => setHistory(null)} />
            </div>
            <div style={{ padding: 20, overflowY: "auto" }}>
              {history.events.length === 0 ? (
                <div style={{ textAlign: "center", color: "#adb5bd", padding: 24, fontSize: 14 }}>No history yet</div>
              ) : history.events.map((ev, i) => (
                <div key={i} style={{ display: "flex", gap: 12, paddingBottom: 14, marginBottom: 14, borderBottom: i < history.events.length - 1 ? "1px solid #f0f0f0" : "none" }}>
                  <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#e94560", marginTop: 5, flexShrink: 0 }} />
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 13 }}>{EVENT_LABEL[ev.event] || ev.event}</div>
                    <div style={{ fontSize: 12, color: "#6c757d" }}>{ev.detail}</div>
                    <div style={{ fontSize: 11, color: "#adb5bd", marginTop: 2 }}>{ev.at ? new Date(ev.at).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : ""}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────── PURCHASE TAB (multi-fabric bill) ─────────────────────────── */
function PurchaseTab({ fabrics, purchases, reload, isAdmin }) {
  const blankLine = { fabric_id: "", metres_received: "", num_rolls: "", cost_per_metre: "" };
  const [bill, setBill] = useState({ supplier_name: "", invoice_number: "", notes: "" });
  const [lines, setLines] = useState([{ ...blankLine }]);
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(false);

  const updateLine = (i, k, v) => setLines(ls => ls.map((l, idx) => idx === i ? { ...l, [k]: v } : l));
  const addLine = () => setLines(ls => [...ls, { ...blankLine }]);
  const removeLine = (i) => setLines(ls => ls.length > 1 ? ls.filter((_, idx) => idx !== i) : ls);

  const grandTotal = lines.reduce((sum, l) => sum + (parseFloat(l.metres_received) || 0) * (parseFloat(l.cost_per_metre) || 0), 0);

  const submit = async (e) => {
    e.preventDefault(); setMsg("");
    const valid = lines.filter(l => l.fabric_id && parseFloat(l.metres_received) > 0);
    if (!valid.length) { setMsg("Add at least one fabric line with metres"); return; }
    setLoading(true);
    try {
      const { data } = await api.post("/fabric/purchase", {
        supplier_name: bill.supplier_name,
        invoice_number: bill.invoice_number,
        notes: bill.notes,
        lines: valid.map(l => ({
          fabric_id: parseInt(l.fabric_id),
          metres_received: parseFloat(l.metres_received),
          num_rolls: parseInt(l.num_rolls) || 0,
          cost_per_metre: parseFloat(l.cost_per_metre) || 0,
        })),
      });
      setMsg(`✅ Bill saved! ${data.lots_created} lot(s) created: ${data.lot_codes.join(", ")}. Now do Fabric QC on them.`);
      setBill({ supplier_name: "", invoice_number: "", notes: "" });
      setLines([{ ...blankLine }]);
      reload();
    } catch (e) { setMsg(e.response?.data?.detail || "Error"); }
    finally { setLoading(false); }
  };

  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(320px,480px) 1fr", gap: 20, alignItems: "start" }}>
      <div style={S.card}>
        <div style={S.header}><h3 style={S.h3}><Truck size={15} /> Record Purchase Bill</h3></div>
        <form onSubmit={submit} style={{ padding: 20 }}>
          <Msg msg={msg} />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 14 }}>
            <div><label style={S.label}>Supplier</label>
              <input style={S.input} placeholder="e.g. Surat Mills" value={bill.supplier_name}
                onChange={e => setBill(b => ({ ...b, supplier_name: e.target.value }))} required /></div>
            <div><label style={S.label}>Invoice No.</label>
              <input style={S.input} placeholder="e.g. INV-5501" value={bill.invoice_number}
                onChange={e => setBill(b => ({ ...b, invoice_number: e.target.value }))} /></div>
          </div>

          <label style={S.label}>Fabrics on this bill</label>
          {lines.map((l, i) => (
            <div key={i} style={{ border: "1px solid #eee", borderRadius: 10, padding: 10, marginBottom: 8 }}>
              <div style={{ display: "flex", gap: 8, marginBottom: 8, alignItems: "center" }}>
                <select style={{ ...S.input, flex: 1 }} value={l.fabric_id} onChange={e => updateLine(i, "fabric_id", e.target.value)}>
                  <option value="">Select fabric…</option>
                  {fabrics.map(f => <option key={f.id} value={f.id}>{f.fabric_name}</option>)}
                </select>
                {lines.length > 1 && (
                  <button type="button" onClick={() => removeLine(i)} style={{ background: "#ffe0e3", border: "none", borderRadius: 8, padding: "8px", cursor: "pointer", color: "#b71c1c" }}><Trash2 size={14} /></button>
                )}
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
                <input style={S.input} type="number" step="0.01" min="0" placeholder="Metres" value={l.metres_received} onChange={e => updateLine(i, "metres_received", e.target.value)} />
                <input style={S.input} type="number" min="0" placeholder="Rolls" value={l.num_rolls} onChange={e => updateLine(i, "num_rolls", e.target.value)} />
                <input style={S.input} type="number" step="0.01" min="0" placeholder="₹/metre" value={l.cost_per_metre} onChange={e => updateLine(i, "cost_per_metre", e.target.value)} />
              </div>
            </div>
          ))}
          <button type="button" onClick={addLine} style={{ background: "#eef2ff", color: "#3730a3", border: "none", borderRadius: 8, padding: "8px 12px", fontWeight: 700, fontSize: 13, cursor: "pointer", marginBottom: 14, display: "flex", alignItems: "center", gap: 5 }}>
            <Plus size={14} /> Add another fabric
          </button>

          {grandTotal > 0 && (
            <div style={{ background: "#f8f9fc", border: "1px dashed #dee2e6", borderRadius: 10, padding: 12, marginBottom: 16, textAlign: "center" }}>
              <div style={{ fontSize: 11, color: "#6c757d" }}>Bill Total</div>
              <div style={{ fontSize: 22, fontWeight: 900, color: "#1565c0" }}>₹{grandTotal.toLocaleString("en-IN")}</div>
            </div>
          )}
          <button type="submit" style={{ ...S.btn, width: "100%", opacity: loading ? 0.7 : 1 }} disabled={loading}>
            {loading ? "Saving..." : "Save Purchase Bill"}
          </button>
        </form>
      </div>

      <div style={S.card}>
        <div style={S.header}><h3 style={S.h3}><Truck size={15} /> Purchase History ({purchases.length})</h3></div>
        {purchases.length === 0 ? (
          <div style={{ textAlign: "center", padding: 48, color: "#adb5bd", fontSize: 14 }}>No purchases yet</div>
        ) : (
          <div style={{ padding: 12 }}>
            {purchases.map(p => (
              <div key={p.id} style={{ border: "1px solid #f0f0f0", borderRadius: 12, padding: 14, marginBottom: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8, flexWrap: "wrap", gap: 6 }}>
                  <div>
                    <span style={{ fontWeight: 700 }}>{p.supplier_name}</span>
                    {p.invoice_number ? <span style={{ color: "#6c757d", fontSize: 12 }}> · Inv {p.invoice_number}</span> : null}
                    <div style={{ fontSize: 11, color: "#adb5bd" }}>{p.purchase_date ? new Date(p.purchase_date).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : ""}</div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={S.pill("#e8f4fd", "#1565c0")}>₹{(p.total_cost || 0).toLocaleString("en-IN")}</span>
                    {isAdmin && <DelBtn onClick={() => doDelete(`/fabric/purchase/${p.id}`, reload)} />}
                  </div>
                </div>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                  <tbody>
                    {p.lines.map((l, i) => (
                      <tr key={i} style={{ borderTop: "1px solid #f6f6f6" }}>
                        <td style={{ padding: "6px 4px", fontFamily: "monospace", fontWeight: 700 }}>{l.lot_code}</td>
                        <td style={{ padding: "6px 4px" }}>{l.fabric_name}</td>
                        <td style={{ padding: "6px 4px" }}>{l.metres_received} m</td>
                        <td style={{ padding: "6px 4px", textAlign: "right" }}>
                          {l.qc_done ? <span style={S.pill("#d1f5ea", "#1b5e20")}>QC done</span> : <span style={S.pill("#fff3cd", "#7a5b00")}>QC pending</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ─────────────────────────── FABRIC QC TAB ─────────────────────────── */
function QCTab({ pending, reload }) {
  const [active, setActive] = useState(null);
  const [rejected, setRejected] = useState("0");
  const [defects, setDefects] = useState([]);
  const [notes, setNotes] = useState("");
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(false);

  const start = (it) => { setActive(it); setRejected("0"); setDefects([]); setNotes(""); setMsg(""); };
  const toggle = (d) => setDefects(arr => arr.includes(d) ? arr.filter(x => x !== d) : [...arr, d]);

  const received = active ? (parseFloat(active.metres_received) || 0) : 0;
  const rej = parseFloat(rejected) || 0;
  const acc = Math.max(0, +(received - rej).toFixed(2));
  const rejValid = rej >= 0 && rej <= received;

  const submit = async (e) => {
    e.preventDefault();
    if (!rejValid) return;
    setLoading(true); setMsg("");
    try {
      await api.post("/fabric/qc", {
        fabric_intake_id: active.id,
        metres_accepted: acc,
        metres_rejected: rej,
        defect_types: defects,
        notes,
      });
      setActive(null);
      reload();
    } catch (e) { setMsg(e.response?.data?.detail || "Error"); }
    finally { setLoading(false); }
  };

  if (active) {
    return (
      <div style={{ maxWidth: 520 }}>
        <button onClick={() => setActive(null)} style={{ background: "none", border: "none", color: "#6c757d", cursor: "pointer", fontSize: 13, marginBottom: 12, display: "flex", alignItems: "center", gap: 4 }}><ArrowLeft size={14} /> Back to pending</button>
        <div style={S.card}>
          <div style={S.header}><h3 style={S.h3}><ClipboardCheck size={15} /> QC — {active.lot_code} ({active.fabric_name})</h3></div>
          <form onSubmit={submit} style={{ padding: 20 }}>
            <Msg msg={msg} />
            <div style={{ background: "#f8f9fc", borderRadius: 10, padding: 12, marginBottom: 16, fontSize: 13, color: "#495057" }}>
              Received in this lot: <b>{active.metres_received} m</b>{active.num_rolls ? ` across ${active.num_rolls} rolls` : ""}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 8 }}>
              <div><label style={S.label}>Metres Rejected (defective)</label>
                <input style={{ ...S.input, fontSize: 20, fontWeight: 800, borderColor: rejValid ? "#dee2e6" : "#b71c1c" }} type="number" step="0.01" min="0" max={received} value={rejected}
                  onChange={e => setRejected(e.target.value)} /></div>
              <div><label style={S.label}>Accepted → enters stock</label>
                <div style={{ ...S.input, fontSize: 20, fontWeight: 800, background: "#f1f8f4", color: "#1b5e20", border: "1.5px solid #c8e6c9" }}>{acc} m</div></div>
            </div>
            {!rejValid && <div style={{ fontSize: 12, color: "#b71c1c", fontWeight: 600, marginBottom: 12 }}>Rejected can't be more than the {received} m received.</div>}
            <div style={{ marginBottom: 16 }}>
              <label style={S.label}>Defect Types (if any)</label>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {DEFECTS.map(d => (
                  <button type="button" key={d} onClick={() => toggle(d)} style={{
                    border: defects.includes(d) ? "1.5px solid #e94560" : "1.5px solid #dee2e6",
                    background: defects.includes(d) ? "#ffe0e3" : "white",
                    color: defects.includes(d) ? "#b71c1c" : "#495057",
                    borderRadius: 20, padding: "6px 12px", fontSize: 12, fontWeight: 600, cursor: "pointer",
                  }}>{d}</button>
                ))}
              </div>
            </div>
            {rej > 0 && (
              <div style={{ background: "#fff3cd", borderRadius: 8, padding: "8px 12px", marginBottom: 16, fontSize: 12, color: "#7a5b00" }}>
                {rej} m will open an entry in the <b>Defective</b> tab to decide later (return / replacement / downgrade / scrap).
              </div>
            )}
            <div style={{ marginBottom: 18 }}>
              <label style={S.label}>Notes (optional)</label>
              <input style={S.input} value={notes} onChange={e => setNotes(e.target.value)} placeholder="any remarks" />
            </div>
            <button type="submit" style={{ ...S.btn, width: "100%", opacity: (loading || !rejValid) ? 0.6 : 1 }} disabled={loading || !rejValid}>
              {loading ? "Saving..." : "Submit QC — only accepted metres enter stock"}
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div style={S.card}>
      <div style={S.header}><h3 style={S.h3}><ClipboardCheck size={15} /> Lots Awaiting QC ({pending.length})</h3></div>
      {pending.length === 0 ? (
        <div style={{ textAlign: "center", padding: 48, color: "#adb5bd", fontSize: 14 }}>
          <PackageCheck size={40} style={{ opacity: 0.3 }} />
          <p style={{ marginTop: 12 }}>Nothing pending — all received lots are checked</p>
        </div>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr style={{ background: "#f8f9fc" }}>
              {["Lot", "Fabric", "Received", ""].map(h => <th key={h} style={S.th}>{h}</th>)}
            </tr></thead>
            <tbody>
              {pending.map((it, i) => (
                <tr key={it.id} style={{ borderTop: "1px solid #f0f0f0", background: i % 2 ? "#fafafa" : "white" }}>
                  <td style={{ ...S.td, fontFamily: "monospace", fontWeight: 700 }}>{it.lot_code}</td>
                  <td style={S.td}>{it.fabric_name}</td>
                  <td style={S.td}>{it.metres_received} m{it.num_rolls ? ` · ${it.num_rolls} rolls` : ""}</td>
                  <td style={{ ...S.td, textAlign: "right" }}>
                    <button onClick={() => start(it)} style={{ ...S.btn, padding: "7px 14px", fontSize: 13 }}>Do QC</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────── DEFECTIVE TAB ─────────────────────────── */
function DefectiveTab({ defective, reload, isAdmin }) {
  const [resolving, setResolving] = useState(null);
  const [form, setForm] = useState({ decision: "return", amount_debited: "", notes: "" });
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(false);

  const open = defective.filter(d => d.status === "open");
  const resolved = defective.filter(d => d.status === "resolved");

  const start = (d) => { setResolving(d); setForm({ decision: "return", amount_debited: d.suggested_debit ? String(d.suggested_debit) : "", notes: "" }); setMsg(""); };

  const submit = async (e) => {
    e.preventDefault(); setLoading(true); setMsg("");
    try {
      await api.post(`/fabric/defective/${resolving.id}/resolve`, {
        decision: form.decision,
        amount_debited: form.amount_debited ? parseFloat(form.amount_debited) : null,
        notes: form.notes,
      });
      setResolving(null);
      reload();
    } catch (e) { setMsg(e.response?.data?.detail || "Error"); }
    finally { setLoading(false); }
  };

  const DEC_LABEL = { return: "Returned to vendor", replacement: "Replacement", downgrade: "Downgraded & debited", scrap: "Scrapped", pending: "Pending" };
  const showDebit = form.decision === "return" || form.decision === "downgrade";

  return (
    <div style={{ display: "grid", gridTemplateColumns: resolving ? "minmax(300px,400px) 1fr" : "1fr", gap: 20, alignItems: "start" }}>
      {resolving && (
        <div style={S.card}>
          <div style={S.header}><h3 style={S.h3}>Resolve — {resolving.lot_code} ({resolving.fabric_name})</h3></div>
          <form onSubmit={submit} style={{ padding: 20 }}>
            <Msg msg={msg} />
            <div style={{ background: "#fff5f7", borderRadius: 10, padding: 12, marginBottom: 16, fontSize: 13, color: "#b71c1c" }}>
              <b>{resolving.metres_rejected} m</b> rejected{resolving.defect_types?.length ? ` — ${resolving.defect_types.join(", ")}` : ""}
            </div>
            <div style={{ marginBottom: 14 }}>
              <label style={S.label}>Decision</label>
              <select style={S.input} value={form.decision} onChange={e => {
                const dec = e.target.value;
                setForm(f => ({
                  ...f, decision: dec,
                  amount_debited: (dec === "return" || dec === "downgrade") && !f.amount_debited && resolving.suggested_debit
                    ? String(resolving.suggested_debit) : f.amount_debited,
                }));
              }}>
                <option value="return">Return to vendor</option>
                <option value="replacement">Replacement coming</option>
                <option value="downgrade">Downgrade & keep (debit vendor)</option>
                <option value="scrap">Scrap (discard)</option>
              </select>
            </div>
            {showDebit && (
              <div style={{ marginBottom: 14 }}>
                <label style={S.label}>Amount debited to vendor (₹, optional)</label>
                <input style={S.input} type="number" step="0.01" min="0" placeholder="e.g. 400" value={form.amount_debited}
                  onChange={e => setForm(f => ({ ...f, amount_debited: e.target.value }))} />
                {resolving.cost_per_metre > 0 && (
                  <div style={{ fontSize: 11, color: "#adb5bd", marginTop: 4 }}>
                    Purchase value: {resolving.metres_rejected} m × ₹{resolving.cost_per_metre} = ₹{resolving.suggested_debit} (pre-filled, editable)
                  </div>
                )}
              </div>
            )}
            {form.decision === "downgrade" && (
              <div style={{ background: "#fff3cd", borderRadius: 8, padding: "8px 12px", marginBottom: 14, fontSize: 12, color: "#7a5b00" }}>
                These {resolving.metres_rejected} m will be added back into usable stock.
              </div>
            )}
            {form.decision === "replacement" && (
              <div style={{ background: "#e8f4fd", borderRadius: 8, padding: "8px 12px", marginBottom: 14, fontSize: 12, color: "#1565c0" }}>
                When the replacement fabric arrives, record it as a new purchase — it goes through QC like any lot.
              </div>
            )}
            <div style={{ marginBottom: 18 }}>
              <label style={S.label}>Notes (optional)</label>
              <input style={S.input} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="any remarks" />
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button type="submit" style={{ ...S.btn, flex: 1, opacity: loading ? 0.7 : 1 }} disabled={loading}>{loading ? "Saving..." : "Resolve"}</button>
              <button type="button" onClick={() => setResolving(null)} style={{ ...S.btn, flex: 1, background: "#e9ecef", color: "#495057" }}>Cancel</button>
            </div>
          </form>
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={S.card}>
          <div style={S.header}><h3 style={S.h3}><AlertTriangle size={15} /> Awaiting Decision ({open.length})</h3></div>
          {open.length === 0 ? (
            <div style={{ textAlign: "center", padding: 32, color: "#adb5bd", fontSize: 14 }}>Nothing pending — all defective lots resolved</div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead><tr style={{ background: "#f8f9fc" }}>{["Lot", "Fabric", "Rejected", "Defects", ""].map(h => <th key={h} style={S.th}>{h}</th>)}</tr></thead>
                <tbody>
                  {open.map(d => (
                    <tr key={d.id} style={{ borderTop: "1px solid #f0f0f0" }}>
                      <td style={{ ...S.td, fontFamily: "monospace", fontWeight: 700 }}>{d.lot_code}</td>
                      <td style={S.td}>{d.fabric_name}</td>
                      <td style={S.td}>{d.metres_rejected} m</td>
                      <td style={S.td}>{d.defect_types?.join(", ") || "—"}</td>
                      <td style={{ ...S.td, textAlign: "right" }}>
                        <div style={{ display: "inline-flex", gap: 6 }}>
                          <button onClick={() => start(d)} style={{ ...S.btn, padding: "7px 14px", fontSize: 13 }}>Resolve</button>
                          {isAdmin && <DelBtn onClick={() => doDelete(`/fabric/defective/${d.id}`, reload)} />}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div style={S.card}>
          <div style={S.header}><h3 style={S.h3}><ClipboardCheck size={15} /> Resolved ({resolved.length})</h3></div>
          {resolved.length === 0 ? (
            <div style={{ textAlign: "center", padding: 32, color: "#adb5bd", fontSize: 14 }}>None resolved yet</div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead><tr style={{ background: "#f8f9fc" }}>{["Lot", "Fabric", "Rejected", "Decision", "Debited", ...(isAdmin ? [""] : [])].map(h => <th key={h} style={S.th}>{h}</th>)}</tr></thead>
                <tbody>
                  {resolved.map((d, i) => (
                    <tr key={d.id} style={{ borderTop: "1px solid #f0f0f0", background: i % 2 ? "#fafafa" : "white" }}>
                      <td style={{ ...S.td, fontFamily: "monospace", fontWeight: 700 }}>{d.lot_code}</td>
                      <td style={S.td}>{d.fabric_name}</td>
                      <td style={S.td}>{d.metres_rejected} m</td>
                      <td style={S.td}><span style={S.pill("#eef2ff", "#3730a3")}>{DEC_LABEL[d.decision] || d.decision}</span></td>
                      <td style={S.td}>{d.amount_debited != null ? `₹${d.amount_debited.toLocaleString("en-IN")}` : "—"}</td>
                      {isAdmin && <td style={{ ...S.td, textAlign: "right" }}><DelBtn onClick={() => doDelete(`/fabric/defective/${d.id}`, reload)} /></td>}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────── JOB WORK TAB ─────────────────────────── */
function JobWorkTab({ fabrics, jobWork, reload, isAdmin }) {
  const [form, setForm] = useState({ fabric_id: "", job_type: "printing", vendor_name: "", metres_sent: "", notes: "" });
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(false);
  const [returning, setReturning] = useState(null);
  const [retMetres, setRetMetres] = useState("");
  const [retMsg, setRetMsg] = useState("");

  const send = async (e) => {
    e.preventDefault(); setLoading(true); setMsg("");
    try {
      await api.post("/fabric/job-work", {
        fabric_id: parseInt(form.fabric_id),
        job_type: form.job_type,
        vendor_name: form.vendor_name,
        metres_sent: parseFloat(form.metres_sent),
        notes: form.notes,
      });
      setMsg("✅ Sent out!");
      setForm({ fabric_id: "", job_type: "printing", vendor_name: "", metres_sent: "", notes: "" });
      reload();
    } catch (e) { setMsg(e.response?.data?.detail || "Error"); }
    finally { setLoading(false); }
  };

  const startReturn = (jw) => { setReturning(jw); setRetMetres(String(jw.metres_sent)); setRetMsg(""); };
  const doReturn = async (e) => {
    e.preventDefault(); setRetMsg("");
    try {
      await api.post(`/fabric/job-work/${returning.id}/return`, { metres_returned: parseFloat(retMetres) || 0 });
      setReturning(null);
      reload();
    } catch (e) { setRetMsg(e.response?.data?.detail || "Error"); }
  };

  const pending = jobWork.filter(j => j.status === "sent");

  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(280px,380px) 1fr", gap: 20, alignItems: "start" }}>
      <div style={S.card}>
        <div style={S.header}><h3 style={S.h3}><PackageCheck size={15} /> Send to Job Work</h3></div>
        <form onSubmit={send} style={{ padding: 20 }}>
          <Msg msg={msg} />
          <div style={{ marginBottom: 14 }}>
            <label style={S.label}>Fabric</label>
            <select style={S.input} value={form.fabric_id} onChange={e => setForm(f => ({ ...f, fabric_id: e.target.value }))} required>
              <option value="">Select fabric…</option>
              {fabrics.map(f => <option key={f.id} value={f.id}>{f.fabric_name} ({f.available} m available)</option>)}
            </select>
          </div>
          <div style={{ marginBottom: 14 }}>
            <label style={S.label}>Job Type</label>
            <select style={S.input} value={form.job_type} onChange={e => setForm(f => ({ ...f, job_type: e.target.value }))}>
              <option value="printing">Printing</option>
              <option value="embroidery">Embroidery</option>
            </select>
          </div>
          <div style={{ marginBottom: 14 }}>
            <label style={S.label}>Vendor Name</label>
            <input style={S.input} placeholder="e.g. ABC Printers" value={form.vendor_name}
              onChange={e => setForm(f => ({ ...f, vendor_name: e.target.value }))} required />
          </div>
          <div style={{ marginBottom: 18 }}>
            <label style={S.label}>Metres Sent</label>
            <input style={S.input} type="number" step="0.01" min="0.01" placeholder="40" value={form.metres_sent}
              onChange={e => setForm(f => ({ ...f, metres_sent: e.target.value }))} required />
          </div>
          <button type="submit" style={{ ...S.btn, width: "100%", opacity: loading ? 0.7 : 1 }} disabled={loading}>
            {loading ? "Sending..." : "Send Out"}
          </button>
        </form>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={S.card}>
          <div style={S.header}><h3 style={S.h3}><Truck size={15} /> Out at Vendor — Awaiting Return ({pending.length})</h3></div>
          {pending.length === 0 ? (
            <div style={{ textAlign: "center", padding: 32, color: "#adb5bd", fontSize: 14 }}>Nothing currently out</div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead><tr style={{ background: "#f8f9fc" }}>{["Fabric", "Vendor", "Type", "Sent", ""].map(h => <th key={h} style={S.th}>{h}</th>)}</tr></thead>
                <tbody>
                  {pending.map(jw => (
                    <tr key={jw.id} style={{ borderTop: "1px solid #f0f0f0" }}>
                      <td style={S.td}>{jw.fabric_name}</td>
                      <td style={S.td}>{jw.vendor_name}</td>
                      <td style={S.td}><span style={S.pill("#e8f4fd", "#1565c0")}>{jw.job_type}</span></td>
                      <td style={S.td}>{jw.metres_sent} m</td>
                      <td style={{ ...S.td, textAlign: "right" }}>
                        <button onClick={() => startReturn(jw)} style={{ ...S.btn, padding: "7px 14px", fontSize: 13 }}>Receive Back</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {returning && (
          <div style={S.card}>
            <div style={S.header}><h3 style={S.h3}>Receive Back — {returning.fabric_name} from {returning.vendor_name}</h3></div>
            <form onSubmit={doReturn} style={{ padding: 20 }}>
              <Msg msg={retMsg} />
              <div style={{ fontSize: 13, color: "#495057", marginBottom: 12 }}>Sent out: <b>{returning.metres_sent} m</b></div>
              <label style={S.label}>Metres Returned</label>
              <input style={{ ...S.input, fontSize: 20, fontWeight: 800, marginBottom: 8 }} type="number" step="0.01" min="0" value={retMetres}
                onChange={e => setRetMetres(e.target.value)} required />
              <div style={{ fontSize: 12, color: "#b71c1c", fontWeight: 600, marginBottom: 16 }}>
                Shrinkage / loss: {Math.max(0, (parseFloat(returning.metres_sent) - (parseFloat(retMetres) || 0))).toFixed(2)} m
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button type="submit" style={{ ...S.btn, flex: 1 }}>Confirm Return</button>
                <button type="button" onClick={() => setReturning(null)} style={{ ...S.btn, flex: 1, background: "#e9ecef", color: "#495057" }}>Cancel</button>
              </div>
            </form>
          </div>
        )}

        <div style={S.card}>
          <div style={S.header}><h3 style={S.h3}><PackageCheck size={15} /> Job Work History ({jobWork.length})</h3></div>
          {jobWork.length === 0 ? (
            <div style={{ textAlign: "center", padding: 32, color: "#adb5bd", fontSize: 14 }}>No job work yet</div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead><tr style={{ background: "#f8f9fc" }}>{["Fabric", "Vendor", "Sent", "Returned", "Shrinkage", "Status", ...(isAdmin ? [""] : [])].map(h => <th key={h} style={S.th}>{h}</th>)}</tr></thead>
                <tbody>
                  {jobWork.map((jw, i) => (
                    <tr key={jw.id} style={{ borderTop: "1px solid #f0f0f0", background: i % 2 ? "#fafafa" : "white" }}>
                      <td style={S.td}>{jw.fabric_name}</td>
                      <td style={S.td}>{jw.vendor_name}</td>
                      <td style={S.td}>{jw.metres_sent} m</td>
                      <td style={S.td}>{jw.metres_returned != null ? `${jw.metres_returned} m` : "—"}</td>
                      <td style={S.td}>{jw.shrinkage_metres != null ? `${jw.shrinkage_metres} m (${jw.shrinkage_percent}%)` : "—"}</td>
                      <td style={S.td}>{jw.status === "sent"
                        ? <span style={S.pill("#fff3cd", "#7a5b00")}>at vendor</span>
                        : <span style={S.pill("#d1f5ea", "#1b5e20")}>returned</span>}</td>
                      {isAdmin && <td style={{ ...S.td, textAlign: "right" }}><DelBtn onClick={() => doDelete(`/fabric/job-work/${jw.id}`, reload)} /></td>}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

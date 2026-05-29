import { useState, useEffect } from "react";
import Layout from "../components/Layout";
import api from "../api";
import { Layers, Plus, Truck, ClipboardCheck, PackageCheck, AlertTriangle, ArrowLeft } from "lucide-react";

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

function Msg({ msg }) {
  if (!msg) return null;
  const ok = msg.startsWith("✅");
  return <div style={{ background: ok ? "#d1f5ea" : "#ffe0e3", borderRadius: 8, padding: "8px 12px", marginBottom: 14, fontSize: 13, color: ok ? "#1b5e20" : "#b71c1c" }}>{msg}</div>;
}

export default function Store() {
  const [tab, setTab] = useState("fabrics");
  const [fabrics, setFabrics] = useState([]);
  const [intakes, setIntakes] = useState([]);
  const [qcPending, setQcPending] = useState([]);
  const [jobWork, setJobWork] = useState([]);

  const loadFabrics = () => api.get("/fabric/").then(r => setFabrics(r.data));
  const loadIntakes = () => api.get("/fabric/intake/list").then(r => setIntakes(r.data));
  const loadQcPending = () => api.get("/fabric/qc/pending").then(r => setQcPending(r.data));
  const loadJobWork = () => api.get("/fabric/job-work/list").then(r => setJobWork(r.data));
  const loadAll = () => { loadFabrics(); loadIntakes(); loadQcPending(); loadJobWork(); };
  useEffect(loadAll, []);

  const lowCount = fabrics.filter(f => f.low_stock).length;
  const tabs = [
    ["fabrics", "Fabrics", Layers],
    ["intake", "Intake", Truck],
    ["qc", "Fabric QC", ClipboardCheck],
    ["jobwork", "Job Work", PackageCheck],
  ];

  return (
    <Layout>
      <h2 style={{ fontWeight: 900, marginBottom: 4 }}>Fabric Store</h2>
      <p style={{ color: "#6c757d", marginBottom: 16, fontSize: 14 }}>Track fabric from purchase → QC → job work → cutting</p>

      {lowCount > 0 && (
        <div style={{ background: "#fff3cd", border: "1px solid #ffe69c", borderRadius: 12, padding: "10px 16px", marginBottom: 16, display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "#7a5b00" }}>
          <AlertTriangle size={16} /> <b>{lowCount}</b> fabric{lowCount > 1 ? "s are" : " is"} below the low-stock level.
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
          }}><Icon size={14} /> {label}</button>
        ))}
      </div>

      {tab === "fabrics" && <FabricsTab fabrics={fabrics} reload={loadFabrics} />}
      {tab === "intake" && <IntakeTab fabrics={fabrics} intakes={intakes} reload={() => { loadIntakes(); loadFabrics(); loadQcPending(); }} />}
      {tab === "qc" && <QCTab pending={qcPending} reload={() => { loadQcPending(); loadIntakes(); loadFabrics(); }} />}
      {tab === "jobwork" && <JobWorkTab fabrics={fabrics} jobWork={jobWork} reload={() => { loadJobWork(); loadFabrics(); }} />}
    </Layout>
  );
}

/* ─────────────────────────── FABRICS TAB ─────────────────────────── */
function FabricsTab({ fabrics, reload }) {
  const [form, setForm] = useState({ fabric_name: "", fabric_type: "grey", supplier_name: "", low_stock_threshold: "" });
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault(); setLoading(true); setMsg("");
    try {
      await api.post("/fabric/", { ...form, low_stock_threshold: parseFloat(form.low_stock_threshold) || 0 });
      setMsg("✅ Fabric added!");
      setForm({ fabric_name: "", fabric_type: "grey", supplier_name: "", low_stock_threshold: "" });
      reload();
    } catch (e) { setMsg(e.response?.data?.detail || "Error"); }
    finally { setLoading(false); }
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
            <label style={S.label}>Supplier (optional)</label>
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
                {["Fabric", "Type", "Available", "At Vendor", "Consumed", "Shrinkage"].map(h => <th key={h} style={S.th}>{h}</th>)}
              </tr></thead>
              <tbody>
                {fabrics.map((f, i) => (
                  <tr key={f.id} style={{ borderTop: "1px solid #f0f0f0", background: f.low_stock ? "#fff8f8" : (i % 2 ? "#fafafa" : "white") }}>
                    <td style={S.td}>
                      <div style={{ fontWeight: 600 }}>{f.fabric_name}</div>
                      {f.supplier_name ? <div style={{ color: "#adb5bd", fontSize: 11 }}>{f.supplier_name}</div> : null}
                    </td>
                    <td style={S.td}><span style={S.pill(f.fabric_type === "grey" ? "#eceff1" : "#f3e5f5", f.fabric_type === "grey" ? "#455a64" : "#7b1fa2")}>{f.fabric_type}</span></td>
                    <td style={S.td}>
                      <span style={{ fontWeight: 900, fontSize: 16, color: f.low_stock ? "#b71c1c" : "#1b5e20" }}>{f.available} m</span>
                      {f.low_stock && <div style={{ fontSize: 10, color: "#b71c1c", fontWeight: 700, marginTop: 2 }}><AlertTriangle size={10} style={{ verticalAlign: -1 }} /> LOW (below {f.low_stock_threshold})</div>}
                    </td>
                    <td style={S.td}>{f.at_vendor} m</td>
                    <td style={S.td}>{f.consumed} m</td>
                    <td style={S.td}>{f.shrinkage_lost} m</td>
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

/* ─────────────────────────── INTAKE TAB ─────────────────────────── */
function IntakeTab({ fabrics, intakes, reload }) {
  const [form, setForm] = useState({ fabric_id: "", lot_code: "", metres_received: "", num_rolls: "", cost_per_metre: "", notes: "" });
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(false);

  const total = (parseFloat(form.metres_received) || 0) * (parseFloat(form.cost_per_metre) || 0);

  const submit = async (e) => {
    e.preventDefault(); setLoading(true); setMsg("");
    try {
      await api.post("/fabric/intake", {
        fabric_id: parseInt(form.fabric_id),
        lot_code: form.lot_code,
        metres_received: parseFloat(form.metres_received),
        num_rolls: parseInt(form.num_rolls) || 0,
        cost_per_metre: parseFloat(form.cost_per_metre) || 0,
        notes: form.notes,
      });
      setMsg("✅ Intake recorded! Now do Fabric QC on it.");
      setForm({ fabric_id: "", lot_code: "", metres_received: "", num_rolls: "", cost_per_metre: "", notes: "" });
      reload();
    } catch (e) { setMsg(e.response?.data?.detail || "Error"); }
    finally { setLoading(false); }
  };

  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(280px,380px) 1fr", gap: 20, alignItems: "start" }}>
      <div style={S.card}>
        <div style={S.header}><h3 style={S.h3}><Truck size={15} /> Record Purchase</h3></div>
        <form onSubmit={submit} style={{ padding: 20 }}>
          <Msg msg={msg} />
          <div style={{ marginBottom: 14 }}>
            <label style={S.label}>Fabric</label>
            <select style={S.input} value={form.fabric_id} onChange={e => setForm(f => ({ ...f, fabric_id: e.target.value }))} required>
              <option value="">Select fabric…</option>
              {fabrics.map(f => <option key={f.id} value={f.id}>{f.fabric_name}</option>)}
            </select>
          </div>
          <div style={{ marginBottom: 14 }}>
            <label style={S.label}>Lot Code (unique)</label>
            <input style={{ ...S.input, textTransform: "uppercase" }} placeholder="e.g. LOT-001" value={form.lot_code}
              onChange={e => setForm(f => ({ ...f, lot_code: e.target.value }))} required />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 14 }}>
            <div><label style={S.label}>Metres Received</label>
              <input style={S.input} type="number" step="0.01" min="0.01" placeholder="100" value={form.metres_received}
                onChange={e => setForm(f => ({ ...f, metres_received: e.target.value }))} required /></div>
            <div><label style={S.label}>No. of Rolls</label>
              <input style={S.input} type="number" min="0" placeholder="4" value={form.num_rolls}
                onChange={e => setForm(f => ({ ...f, num_rolls: e.target.value }))} /></div>
          </div>
          <div style={{ marginBottom: 14 }}>
            <label style={S.label}>Cost per Metre (₹)</label>
            <input style={S.input} type="number" step="0.01" min="0" placeholder="80" value={form.cost_per_metre}
              onChange={e => setForm(f => ({ ...f, cost_per_metre: e.target.value }))} />
          </div>
          {total > 0 && (
            <div style={{ background: "#f8f9fc", border: "1px dashed #dee2e6", borderRadius: 10, padding: 12, marginBottom: 16, textAlign: "center" }}>
              <div style={{ fontSize: 11, color: "#6c757d" }}>Total Cost</div>
              <div style={{ fontSize: 22, fontWeight: 900, color: "#1565c0" }}>₹{total.toLocaleString("en-IN")}</div>
            </div>
          )}
          <button type="submit" style={{ ...S.btn, width: "100%", opacity: loading ? 0.7 : 1 }} disabled={loading}>
            {loading ? "Saving..." : "Record Intake"}
          </button>
        </form>
      </div>

      <div style={S.card}>
        <div style={S.header}><h3 style={S.h3}><Truck size={15} /> Intake History ({intakes.length})</h3></div>
        {intakes.length === 0 ? (
          <div style={{ textAlign: "center", padding: 48, color: "#adb5bd", fontSize: 14 }}>No intakes yet</div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead><tr style={{ background: "#f8f9fc" }}>
                {["Lot", "Fabric", "Received", "Cost", "QC Status"].map(h => <th key={h} style={S.th}>{h}</th>)}
              </tr></thead>
              <tbody>
                {intakes.map((it, i) => (
                  <tr key={it.id} style={{ borderTop: "1px solid #f0f0f0", background: i % 2 ? "#fafafa" : "white" }}>
                    <td style={{ ...S.td, fontFamily: "monospace", fontWeight: 700 }}>{it.lot_code}</td>
                    <td style={S.td}>{it.fabric_name}</td>
                    <td style={S.td}>{it.metres_received} m{it.num_rolls ? ` · ${it.num_rolls} rolls` : ""}</td>
                    <td style={S.td}>₹{(it.total_cost || 0).toLocaleString("en-IN")}</td>
                    <td style={S.td}>
                      {it.qc_done
                        ? <span style={S.pill("#d1f5ea", "#1b5e20")}>{it.qc_result} · {it.metres_accepted}m ok</span>
                        : <span style={S.pill("#fff3cd", "#7a5b00")}>QC pending</span>}
                    </td>
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

/* ─────────────────────────── FABRIC QC TAB ─────────────────────────── */
function QCTab({ pending, reload }) {
  const [active, setActive] = useState(null); // intake being QC'd
  const [accepted, setAccepted] = useState("");
  const [rejected, setRejected] = useState("");
  const [defects, setDefects] = useState([]);
  const [notes, setNotes] = useState("");
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(false);

  const start = (it) => { setActive(it); setAccepted(String(it.metres_received)); setRejected("0"); setDefects([]); setNotes(""); setMsg(""); };
  const toggle = (d) => setDefects(arr => arr.includes(d) ? arr.filter(x => x !== d) : [...arr, d]);

  const submit = async (e) => {
    e.preventDefault(); setLoading(true); setMsg("");
    try {
      await api.post("/fabric/qc", {
        fabric_intake_id: active.id,
        metres_accepted: parseFloat(accepted) || 0,
        metres_rejected: parseFloat(rejected) || 0,
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
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
              <div><label style={S.label}>Metres Accepted</label>
                <input style={{ ...S.input, fontSize: 20, fontWeight: 800 }} type="number" step="0.01" min="0" value={accepted}
                  onChange={e => setAccepted(e.target.value)} required /></div>
              <div><label style={S.label}>Metres Rejected</label>
                <input style={{ ...S.input, fontSize: 20, fontWeight: 800 }} type="number" step="0.01" min="0" value={rejected}
                  onChange={e => setRejected(e.target.value)} /></div>
            </div>
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
            <div style={{ marginBottom: 18 }}>
              <label style={S.label}>Notes (optional)</label>
              <input style={S.input} value={notes} onChange={e => setNotes(e.target.value)} placeholder="any remarks" />
            </div>
            <button type="submit" style={{ ...S.btn, width: "100%", opacity: loading ? 0.7 : 1 }} disabled={loading}>
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

/* ─────────────────────────── JOB WORK TAB ─────────────────────────── */
function JobWorkTab({ fabrics, jobWork, reload }) {
  const [form, setForm] = useState({ fabric_id: "", job_type: "printing", vendor_name: "", metres_sent: "", notes: "" });
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(false);
  const [returning, setReturning] = useState(null); // job work being returned
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
        {/* Awaiting return */}
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

        {/* Return form */}
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

        {/* History */}
        <div style={S.card}>
          <div style={S.header}><h3 style={S.h3}><PackageCheck size={15} /> Job Work History ({jobWork.length})</h3></div>
          {jobWork.length === 0 ? (
            <div style={{ textAlign: "center", padding: 32, color: "#adb5bd", fontSize: 14 }}>No job work yet</div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead><tr style={{ background: "#f8f9fc" }}>{["Fabric", "Vendor", "Sent", "Returned", "Shrinkage", "Status"].map(h => <th key={h} style={S.th}>{h}</th>)}</tr></thead>
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

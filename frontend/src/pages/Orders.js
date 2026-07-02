import { useState, useEffect } from "react";
import Layout from "../components/Layout";
import api from "../api";
import { Users, FileText, Plus, X, Trash2, Save, Search, Upload, Eye, Download } from "lucide-react";

const S = {
  card: { background: "white", borderRadius: 16, boxShadow: "0 2px 12px rgba(0,0,0,0.06)", overflow: "hidden" },
  header: { background: "linear-gradient(135deg,#1a1a2e,#283593)", color: "white", padding: "14px 20px" },
  input: { width: "100%", border: "1.5px solid #dee2e6", borderRadius: 8, padding: "8px 10px", fontSize: 14, outline: "none", boxSizing: "border-box" },
  lab: { fontSize: 11, fontWeight: 700, color: "#6c757d", display: "block", marginBottom: 3 },
  btn: { background: "#e94560", color: "white", border: "none", borderRadius: 10, padding: "10px 18px", fontWeight: 700, cursor: "pointer", fontSize: 14, display: "inline-flex", alignItems: "center", gap: 6 },
  th: { padding: "10px 14px", textAlign: "left", fontSize: 12, fontWeight: 700, color: "#6c757d" },
  td: { padding: "10px 14px", fontSize: 13.5 },
};
const money = (n) => `₹${(Number(n) || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const STATUS = { open: ["#e8eaf6", "#283593"], part_shipped: ["#fff3cd", "#7a5b00"], closed: ["#d1f5ea", "#1b5e20"], cancelled: ["#ffe0e3", "#b71c1c"] };
const emptyClient = () => ({ name: "", gstin: "", contact_person: "", phone: "", email: "", ship_to: "", billing_address: "", courier_default: "", notes: "" });
const emptyPO = () => ({ client_id: "", po_number: "", po_date: new Date().toISOString().slice(0, 10), delivery_date: "", status: "open", notes: "", lines: [] });

export default function Orders() {
  const [tab, setTab] = useState("pos");
  const [clients, setClients] = useState([]);
  const [pos, setPos] = useState([]);
  const [q, setQ] = useState("");
  const [editClient, setEditClient] = useState(null);
  const [editPO, setEditPO] = useState(null);

  const loadClients = () => api.get("/clients").then(r => setClients(r.data));
  const loadPos = () => api.get("/pos").then(r => setPos(r.data));
  useEffect(() => { loadClients(); loadPos(); }, []);

  const ql = q.trim().toLowerCase();
  const shownPos = pos.filter(p => !ql || (p.po_number || "").toLowerCase().includes(ql) || (p.client_name || "").toLowerCase().includes(ql));
  const shownClients = clients.filter(c => !ql || (c.name || "").toLowerCase().includes(ql) || (c.gstin || "").toLowerCase().includes(ql));

  return (
    <Layout>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10, marginBottom: 16 }}>
        <div>
          <h2 style={{ fontWeight: 900, margin: 0 }}>Orders</h2>
          <p style={{ color: "#6c757d", margin: "2px 0 0", fontSize: 14 }}>Client master &amp; purchase orders (FOB)</p>
        </div>
        {tab === "pos"
          ? <button style={S.btn} onClick={() => setEditPO(emptyPO())}><Plus size={16} /> New PO</button>
          : <button style={S.btn} onClick={() => setEditClient(emptyClient())}><Plus size={16} /> New Client</button>}
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
        {[["pos", "Purchase Orders", FileText], ["clients", "Clients", Users]].map(([k, label, Icon]) => (
          <button key={k} onClick={() => setTab(k)} style={{ background: tab === k ? "#283593" : "white", color: tab === k ? "white" : "#283593", border: "1.5px solid #283593", borderRadius: 10, padding: "8px 16px", fontWeight: 700, fontSize: 13, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 6 }}><Icon size={15} /> {label}</button>
        ))}
        <div style={{ position: "relative", flex: "1 1 240px", maxWidth: 320 }}>
          <Search size={15} style={{ position: "absolute", left: 10, top: 10, color: "#adb5bd" }} />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search…" style={{ ...S.input, paddingLeft: 32 }} />
        </div>
      </div>

      {tab === "pos" ? (
        <div style={S.card}>
          <div style={S.header}><h3 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>Purchase Orders ({shownPos.length})</h3></div>
          {shownPos.length === 0 ? (
            <div style={{ textAlign: "center", padding: 48, color: "#adb5bd", fontSize: 14 }}>{pos.length === 0 ? "No POs yet — create one" : "No POs match"}</div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead><tr style={{ background: "#f8f9fc" }}>{["PO Number", "Client", "Qty", "Dispatched", "Pending", "Amount", "PDF", "Status"].map(h => <th key={h} style={S.th}>{h}</th>)}</tr></thead>
                <tbody>
                  {shownPos.map((p, i) => (
                    <tr key={p.id} style={{ borderTop: "1px solid #f0f0f0", background: i % 2 ? "#fafafa" : "white", cursor: "pointer" }} onClick={() => api.get(`/pos/${p.id}`).then(r => setEditPO(r.data))}>
                      <td style={{ ...S.td, fontFamily: "monospace", fontWeight: 700 }}>{p.po_number || "—"}</td>
                      <td style={S.td}>{p.client_name}</td>
                      <td style={S.td}>{p.total_qty}</td>
                      <td style={S.td}>{p.dispatched_qty}</td>
                      <td style={{ ...S.td, fontWeight: 700, color: p.pending_qty > 0 ? "#e94560" : "#1b5e20" }}>{p.pending_qty}</td>
                      <td style={S.td}>{money(p.total_amount)}</td>
                      <td style={S.td}>{p.has_pdf ? <FileText size={15} color="#1b5e20" /> : <span style={{ color: "#ced4da" }}>—</span>}</td>
                      <td style={S.td}><span style={{ background: (STATUS[p.status] || STATUS.open)[0], color: (STATUS[p.status] || STATUS.open)[1], borderRadius: 20, padding: "2px 10px", fontSize: 12, fontWeight: 700 }}>{(p.status || "").replace("_", " ")}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : (
        <div style={S.card}>
          <div style={S.header}><h3 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>Clients ({shownClients.length})</h3></div>
          {shownClients.length === 0 ? (
            <div style={{ textAlign: "center", padding: 48, color: "#adb5bd", fontSize: 14 }}>{clients.length === 0 ? "No clients yet — add one" : "No clients match"}</div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead><tr style={{ background: "#f8f9fc" }}>{["Client", "GSTIN", "Contact", "Phone", "Courier", "POs"].map(h => <th key={h} style={S.th}>{h}</th>)}</tr></thead>
                <tbody>
                  {shownClients.map((c, i) => (
                    <tr key={c.id} style={{ borderTop: "1px solid #f0f0f0", background: i % 2 ? "#fafafa" : "white", cursor: "pointer" }} onClick={() => setEditClient(c)}>
                      <td style={{ ...S.td, fontWeight: 700 }}>{c.name}</td>
                      <td style={{ ...S.td, fontFamily: "monospace", fontSize: 12 }}>{c.gstin || "—"}</td>
                      <td style={S.td}>{c.contact_person || "—"}</td>
                      <td style={S.td}>{c.phone || "—"}</td>
                      <td style={S.td}>{c.courier_default || "—"}</td>
                      <td style={S.td}>{c.po_count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {editClient && <ClientEditor client={editClient} onClose={() => setEditClient(null)} onSaved={() => { loadClients(); }} />}
      {editPO && <POEditor po={editPO} clients={clients} onClose={() => setEditPO(null)} onSaved={() => { loadPos(); loadClients(); }} />}
    </Layout>
  );
}

function ClientEditor({ client, onClose, onSaved }) {
  const [C, setC] = useState(client);
  const [msg, setMsg] = useState("");
  const isNew = !C.id;
  const set = (k, v) => setC(s => ({ ...s, [k]: v }));

  const save = async () => {
    if (!C.name.trim()) { setMsg("Client name is required"); return; }
    try {
      if (isNew) await api.post("/clients", C); else await api.put(`/clients/${C.id}`, C);
      onSaved(); onClose();
    } catch (e) { setMsg(e.response?.data?.detail || "Error"); }
  };
  const del = async () => {
    if (!window.confirm("Delete this client?")) return;
    try { await api.delete(`/clients/${C.id}`); onSaved(); onClose(); }
    catch (e) { setMsg(e.response?.data?.detail || "Error"); }
  };

  const field = (label, key, opts = {}) => (
    <div style={{ marginBottom: 10 }}>
      <label style={S.lab}>{label}</label>
      {opts.area
        ? <textarea style={{ ...S.input, minHeight: 54, resize: "vertical" }} value={C[key] || ""} onChange={e => set(key, e.target.value)} />
        : <input style={S.input} value={C[key] || ""} onChange={e => set(key, e.target.value)} />}
    </div>
  );

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "flex-start", justifyContent: "center", padding: 16, zIndex: 300, overflowY: "auto" }}>
      <div onClick={e => e.stopPropagation()} style={{ background: "white", borderRadius: 16, width: "100%", maxWidth: 560, margin: "24px 0" }}>
        <div style={{ ...S.header, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontWeight: 800, fontSize: 16 }}>{isNew ? "New Client" : C.name}</div>
          <X size={20} style={{ cursor: "pointer" }} onClick={onClose} />
        </div>
        <div style={{ padding: 20 }}>
          {msg && <div style={{ background: "#ffe0e3", color: "#b71c1c", borderRadius: 8, padding: "8px 12px", marginBottom: 12, fontSize: 13, fontWeight: 600 }}>{msg}</div>}
          {field("Client name *", "name")}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div>{field("GSTIN", "gstin")}</div>
            <div>{field("Default courier / transporter", "courier_default")}</div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div>{field("Contact person", "contact_person")}</div>
            <div>{field("Phone", "phone")}</div>
          </div>
          {field("Email", "email")}
          {field("Ship-to address", "ship_to", { area: true })}
          {field("Billing address", "billing_address", { area: true })}
          {field("Notes", "notes", { area: true })}
          <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
            <button onClick={save} style={{ ...S.btn, background: "#1b5e20", flex: 1, justifyContent: "center" }}><Save size={15} /> {isNew ? "Create" : "Save"}</button>
            {!isNew && <button onClick={del} style={{ background: "white", color: "#b71c1c", border: "1.5px solid #ffd0d6", borderRadius: 10, padding: "10px 16px", fontWeight: 700, cursor: "pointer" }}>Delete</button>}
          </div>
        </div>
      </div>
    </div>
  );
}

function POEditor({ po, clients, onClose, onSaved }) {
  const [P, setP] = useState(po);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const isNew = !P.id;
  const set = (k, v) => setP(s => ({ ...s, [k]: v }));
  const setLine = (i, k, v) => setP(s => ({ ...s, lines: s.lines.map((l, j) => j === i ? { ...l, [k]: v } : l) }));
  const addLine = () => setP(s => ({ ...s, lines: [...s.lines, { item_code: "", description: "", colour: "", size: "", qty: 0, rate: 0 }] }));
  const delLine = (i) => setP(s => ({ ...s, lines: s.lines.filter((_, j) => j !== i) }));

  const num = (v) => Number(v) || 0;
  const totalQty = P.lines.reduce((a, l) => a + num(l.qty), 0);
  const totalAmt = P.lines.reduce((a, l) => a + num(l.qty) * num(l.rate), 0);

  const body = () => ({
    client_id: parseInt(P.client_id) || 0, po_number: P.po_number, po_date: P.po_date || null,
    delivery_date: P.delivery_date || null, status: P.status, notes: P.notes,
    lines: P.lines.map(l => ({ item_code: l.item_code, description: l.description, colour: l.colour, size: l.size, qty: num(l.qty), rate: num(l.rate) })),
  });

  const save = async (close) => {
    if (!P.client_id) { setMsg("Select a client"); return; }
    setBusy(true); setMsg("");
    try {
      const { data } = isNew ? await api.post("/pos", body()) : await api.put(`/pos/${P.id}`, body());
      setP(data); onSaved();
      if (close) onClose(); else { setMsg("✅ Saved"); setTimeout(() => setMsg(""), 2000); }
    } catch (e) { setMsg(e.response?.data?.detail || "Error"); }
    finally { setBusy(false); }
  };
  const del = async () => {
    if (!window.confirm("Delete this PO?")) return;
    try { await api.delete(`/pos/${P.id}`); onSaved(); onClose(); }
    catch (e) { setMsg(e.response?.data?.detail || "Error"); }
  };
  const uploadPdf = async (e) => {
    const file = e.target.files?.[0]; if (!file) return;
    if (isNew) { setMsg("Save the PO first, then attach the PDF"); return; }
    const fd = new FormData(); fd.append("file", file);
    try { const { data } = await api.post(`/pos/${P.id}/pdf`, fd); setP(s => ({ ...s, has_pdf: true, pdf_filename: data.pdf_filename })); onSaved(); }
    catch (err) { setMsg(err.response?.data?.detail || "Upload failed"); }
  };
  const viewPdf = async () => {
    try { const res = await api.get(`/pos/${P.id}/pdf`, { responseType: "blob" }); window.open(URL.createObjectURL(res.data), "_blank"); }
    catch { setMsg("Could not open PDF"); }
  };
  const removePdf = async () => { try { await api.delete(`/pos/${P.id}/pdf`); setP(s => ({ ...s, has_pdf: false, pdf_filename: "" })); onSaved(); } catch {} };

  const inp = S.input, lab = S.lab;

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "flex-start", justifyContent: "center", padding: 16, zIndex: 300, overflowY: "auto" }}>
      <div onClick={e => e.stopPropagation()} style={{ background: "white", borderRadius: 16, width: "100%", maxWidth: 940, margin: "24px 0" }}>
        <div style={{ ...S.header, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontWeight: 800, fontSize: 16 }}>{isNew ? "New Purchase Order" : `PO ${P.po_number || ""}`}</div>
          <X size={20} style={{ cursor: "pointer" }} onClick={onClose} />
        </div>
        <div style={{ padding: 20 }}>
          {msg && <div style={{ background: msg.startsWith("✅") ? "#d1f5ea" : "#ffe0e3", color: msg.startsWith("✅") ? "#1b5e20" : "#b71c1c", borderRadius: 8, padding: "8px 12px", marginBottom: 12, fontSize: 13, fontWeight: 600 }}>{msg}</div>}

          <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr 1fr", gap: 10, marginBottom: 10 }}>
            <div><label style={lab}>Client *</label>
              <select style={inp} value={P.client_id || ""} onChange={e => set("client_id", e.target.value)}>
                <option value="">Select client…</option>
                {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div><label style={lab}>PO number</label><input style={inp} value={P.po_number} onChange={e => set("po_number", e.target.value)} /></div>
            <div><label style={lab}>Status</label>
              <select style={inp} value={P.status} onChange={e => set("status", e.target.value)}>
                {["open", "part_shipped", "closed", "cancelled"].map(s => <option key={s} value={s}>{s.replace("_", " ")}</option>)}
              </select>
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 14 }}>
            <div><label style={lab}>PO date</label><input style={inp} type="date" value={(P.po_date || "").slice(0, 10)} onChange={e => set("po_date", e.target.value)} /></div>
            <div><label style={lab}>Delivery date</label><input style={inp} type="date" value={(P.delivery_date || "").slice(0, 10)} onChange={e => set("delivery_date", e.target.value)} /></div>
          </div>

          {/* PO PDF */}
          <div style={{ background: "#f8f9fc", borderRadius: 10, padding: 12, marginBottom: 14, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <FileText size={18} color="#283593" />
            <span style={{ fontSize: 13, fontWeight: 700, color: "#283593" }}>Client PO PDF</span>
            {P.has_pdf ? (
              <>
                <span style={{ fontSize: 12, color: "#6c757d" }}>{P.pdf_filename}</span>
                <button onClick={viewPdf} style={{ background: "#283593", color: "white", border: "none", borderRadius: 8, padding: "6px 12px", fontWeight: 700, fontSize: 12, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 4 }}><Eye size={13} /> View</button>
                <button onClick={removePdf} style={{ background: "white", color: "#b71c1c", border: "1px solid #ffd0d6", borderRadius: 8, padding: "6px 10px", fontWeight: 700, fontSize: 12, cursor: "pointer" }}>Remove</button>
              </>
            ) : (
              <label style={{ background: "#e8eaf6", color: "#283593", borderRadius: 8, padding: "6px 12px", fontWeight: 700, fontSize: 12, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 4 }}>
                <Upload size={13} /> {isNew ? "Save PO first to attach" : "Upload PDF"}
                <input type="file" accept="application/pdf" onChange={uploadPdf} style={{ display: "none" }} disabled={isNew} />
              </label>
            )}
            <span style={{ fontSize: 11, color: "#adb5bd", marginLeft: "auto" }}>stored in database</span>
          </div>

          {/* Lines */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
            <span style={{ fontWeight: 800, fontSize: 13, color: "#283593" }}>ORDER LINES</span>
            <button onClick={addLine} style={{ background: "#eef2ff", color: "#3730a3", border: "none", borderRadius: 7, padding: "5px 12px", fontWeight: 700, fontSize: 12, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 4 }}><Plus size={12} /> Add line</button>
          </div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, minWidth: 640 }}>
              <thead><tr style={{ background: "#f8f9fc" }}>{["Item code", "Description", "Colour", "Size", "Qty", "Rate", "Amount", ""].map(h => <th key={h} style={{ ...S.th, padding: "8px 8px" }}>{h}</th>)}</tr></thead>
              <tbody>
                {P.lines.length === 0 ? (
                  <tr><td colSpan={8} style={{ textAlign: "center", padding: 20, color: "#adb5bd" }}>No lines — add the items from the client's PO</td></tr>
                ) : P.lines.map((l, i) => (
                  <tr key={i} style={{ borderTop: "1px solid #f0f0f0" }}>
                    <td style={{ padding: 4 }}><input style={{ ...inp, padding: "6px 7px", minWidth: 120 }} value={l.item_code} onChange={e => setLine(i, "item_code", e.target.value)} /></td>
                    <td style={{ padding: 4 }}><input style={{ ...inp, padding: "6px 7px", minWidth: 120 }} value={l.description} onChange={e => setLine(i, "description", e.target.value)} /></td>
                    <td style={{ padding: 4 }}><input style={{ ...inp, padding: "6px 7px", width: 80 }} value={l.colour} onChange={e => setLine(i, "colour", e.target.value)} /></td>
                    <td style={{ padding: 4 }}><input style={{ ...inp, padding: "6px 7px", width: 60 }} value={l.size} onChange={e => setLine(i, "size", e.target.value)} /></td>
                    <td style={{ padding: 4 }}><input style={{ ...inp, padding: "6px 7px", width: 70 }} type="number" value={l.qty} onChange={e => setLine(i, "qty", e.target.value)} /></td>
                    <td style={{ padding: 4 }}><input style={{ ...inp, padding: "6px 7px", width: 80 }} type="number" step="0.01" value={l.rate} onChange={e => setLine(i, "rate", e.target.value)} /></td>
                    <td style={{ padding: "4px 8px", fontWeight: 700, whiteSpace: "nowrap" }}>{money(num(l.qty) * num(l.rate))}</td>
                    <td style={{ padding: 4 }}><button onClick={() => delLine(i)} style={{ background: "#ffe0e3", border: "none", borderRadius: 8, padding: "6px 8px", cursor: "pointer", color: "#b71c1c" }}><Trash2 size={13} /></button></td>
                  </tr>
                ))}
              </tbody>
              {P.lines.length > 0 && (
                <tfoot><tr style={{ background: "#f8f9fc", borderTop: "2px solid #dee2e6", fontWeight: 800 }}>
                  <td colSpan={4} style={{ padding: "8px 8px" }}>Total</td>
                  <td style={{ padding: "8px 8px" }}>{totalQty}</td>
                  <td></td>
                  <td style={{ padding: "8px 8px" }}>{money(totalAmt)}</td>
                  <td></td>
                </tr></tfoot>
              )}
            </table>
          </div>

          <div style={{ marginTop: 12 }}><label style={lab}>Notes</label><textarea style={{ ...inp, minHeight: 44, resize: "vertical" }} value={P.notes} onChange={e => set("notes", e.target.value)} /></div>

          <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
            <button onClick={() => save(true)} disabled={busy} style={{ ...S.btn, background: "#1b5e20", justifyContent: "center" }}><Save size={15} /> {isNew ? "Create PO" : "Save"}</button>
            {!isNew && <button onClick={() => save(false)} disabled={busy} style={{ background: "#283593", color: "white", border: "none", borderRadius: 10, padding: "10px 16px", fontWeight: 700, cursor: "pointer", fontSize: 14 }}>Save &amp; keep open</button>}
            <div style={{ flex: 1 }} />
            {!isNew && <button onClick={del} style={{ background: "white", color: "#b71c1c", border: "1.5px solid #ffd0d6", borderRadius: 10, padding: "10px 16px", fontWeight: 700, cursor: "pointer" }}>Delete</button>}
          </div>
        </div>
      </div>
    </div>
  );
}
import { useState, useEffect } from "react";
import Layout from "../components/Layout";
import api from "../api";
import { Truck, Plus, X, Save, Search, FileText, Printer, CheckCircle } from "lucide-react";

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
const DSTATUS = { draft: ["#fff3cd", "#7a5b00"], dispatched: ["#d1f5ea", "#1b5e20"] };

export default function Dispatch() {
  const [dispatches, setDispatches] = useState([]);
  const [stock, setStock] = useState([]);
  const [pos, setPos] = useState([]);
  const [q, setQ] = useState("");
  const [picker, setPicker] = useState(false);
  const [editing, setEditing] = useState(null);

  const load = () => api.get("/dispatches").then(r => setDispatches(r.data));
  const loadStock = () => api.get("/warehouse/stock").then(r => setStock(r.data.skus || [])).catch(() => setStock([]));
  const loadPos = () => api.get("/pos").then(r => setPos(r.data)).catch(() => setPos([]));
  useEffect(() => { load(); loadStock(); loadPos(); }, []);

  const ql = q.trim().toLowerCase();
  const shown = dispatches.filter(d => !ql || (d.dispatch_no || "").toLowerCase().includes(ql) || (d.po_number || "").toLowerCase().includes(ql) || (d.client_name || "").toLowerCase().includes(ql));
  const openPos = pos.filter(p => p.status === "open" || p.status === "part_shipped");

  const startFromPO = async (po) => {
    const { data } = await api.get(`/dispatches/prefill/${po.id}`);
    setPicker(false);
    setEditing({
      id: null, status: "draft", po_id: data.po_id, po_number: data.po_number,
      client_name: data.client_name, ship_to: data.ship_to || "", transporter: data.transporter || "",
      awb: "", box_count: "", notes: "", dispatch_date: new Date().toISOString().slice(0, 10),
      lines: data.lines.filter(l => l.pending > 0).map(l => ({
        po_line_id: l.po_line_id, item_code: l.item_code, description: l.description, colour: l.colour,
        size: l.size, master_id: l.master_id || "", sku_code: l.sku_code, rate: l.rate,
        pending: l.pending, available: l.available, qty: "", carton_no: "",
      })),
    });
  };

  return (
    <Layout>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10, marginBottom: 16 }}>
        <div>
          <h2 style={{ fontWeight: 900, margin: 0 }}>Dispatch</h2>
          <p style={{ color: "#6c757d", margin: "2px 0 0", fontSize: 14 }}>Ship against a client PO — deducts warehouse stock &amp; prints the packing slip</p>
        </div>
        <button style={S.btn} onClick={() => setPicker(true)}><Plus size={16} /> New Dispatch</button>
      </div>

      <div style={{ position: "relative", maxWidth: 360, marginBottom: 16 }}>
        <Search size={15} style={{ position: "absolute", left: 10, top: 10, color: "#adb5bd" }} />
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search dispatch, PO, client…" style={{ ...S.input, paddingLeft: 32 }} />
      </div>

      <div style={S.card}>
        <div style={S.header}><h3 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>Dispatches ({shown.length})</h3></div>
        {shown.length === 0 ? (
          <div style={{ textAlign: "center", padding: 48, color: "#adb5bd", fontSize: 14 }}>{dispatches.length === 0 ? "No dispatches yet" : "No matches"}</div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead><tr style={{ background: "#f8f9fc" }}>{["Dispatch", "PO", "Client", "Date", "Qty", "Boxes", "Status"].map(h => <th key={h} style={S.th}>{h}</th>)}</tr></thead>
              <tbody>
                {shown.map((d, i) => (
                  <tr key={d.id} style={{ borderTop: "1px solid #f0f0f0", background: i % 2 ? "#fafafa" : "white", cursor: "pointer" }} onClick={() => api.get(`/dispatches/${d.id}`).then(r => setEditing(mapDetail(r.data)))}>
                    <td style={{ ...S.td, fontFamily: "monospace", fontWeight: 700 }}>{d.dispatch_no}</td>
                    <td style={{ ...S.td, fontFamily: "monospace" }}>{d.po_number || "—"}</td>
                    <td style={S.td}>{d.client_name}</td>
                    <td style={S.td}>{d.dispatch_date ? new Date(d.dispatch_date).toLocaleDateString("en-IN") : "—"}</td>
                    <td style={S.td}>{d.total_qty}</td>
                    <td style={S.td}>{d.box_count || "—"}</td>
                    <td style={S.td}><span style={{ background: (DSTATUS[d.status] || DSTATUS.draft)[0], color: (DSTATUS[d.status] || DSTATUS.draft)[1], borderRadius: 20, padding: "2px 10px", fontSize: 12, fontWeight: 700 }}>{d.status}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {picker && (
        <div onClick={() => setPicker(false)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "flex-start", justifyContent: "center", padding: 16, zIndex: 300, overflowY: "auto" }}>
          <div onClick={e => e.stopPropagation()} style={{ background: "white", borderRadius: 16, width: "100%", maxWidth: 560, margin: "24px 0" }}>
            <div style={{ ...S.header, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ fontWeight: 800, fontSize: 16 }}>Dispatch against which PO?</div>
              <X size={20} style={{ cursor: "pointer" }} onClick={() => setPicker(false)} />
            </div>
            <div style={{ padding: 12 }}>
              {openPos.length === 0 ? <div style={{ padding: 24, textAlign: "center", color: "#adb5bd", fontSize: 14 }}>No open POs — create a PO in Orders first.</div>
                : openPos.map(p => (
                  <div key={p.id} onClick={() => startFromPO(p)} style={{ padding: "12px 14px", border: "1px solid #eee", borderRadius: 10, marginBottom: 8, cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div>
                      <div style={{ fontWeight: 700, fontFamily: "monospace" }}>{p.po_number || "—"}</div>
                      <div style={{ fontSize: 12, color: "#6c757d" }}>{p.client_name} · {p.pending_qty} pcs pending of {p.total_qty}</div>
                    </div>
                    <span style={{ background: "#eef2ff", color: "#283593", borderRadius: 20, padding: "3px 10px", fontSize: 12, fontWeight: 700 }}>{p.status.replace("_", " ")}</span>
                  </div>
                ))}
            </div>
          </div>
        </div>
      )}

      {editing && <DispatchEditor d={editing} stock={stock} onClose={() => setEditing(null)} onSaved={() => { load(); loadStock(); loadPos(); }} />}
    </Layout>
  );
}

function mapDetail(d) {
  return {
    id: d.id, status: d.status, po_id: d.po_id, po_number: d.po_number, client_name: d.client_name,
    client: d.client, ship_to: d.ship_to, transporter: d.transporter, awb: d.awb,
    box_count: d.box_count || "", notes: d.notes,
    dispatch_date: (d.dispatch_date || "").slice(0, 10),
    dispatch_no: d.dispatch_no, total_amount: d.total_amount,
    lines: d.lines.map(l => ({
      po_line_id: l.po_line_id, item_code: l.item_code, description: l.description, colour: l.colour,
      size: l.size, master_id: l.master_id || "", sku_code: l.sku_code, rate: l.rate,
      qty: l.qty, carton_no: l.carton_no, pending: null, available: null,
    })),
  };
}

function DispatchEditor({ d, stock, onClose, onSaved }) {
  const [D, setD] = useState(d);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const dispatched = D.status === "dispatched";
  const num = (v) => Number(v) || 0;
  const set = (k, v) => setD(s => ({ ...s, [k]: v }));
  const setLine = (i, k, v) => setD(s => ({ ...s, lines: s.lines.map((l, j) => j === i ? { ...l, [k]: v } : l) }));
  const avail = (mid) => { const s = stock.find(x => x.id === Number(mid)); return s ? s.sellable : null; };

  const totalQty = D.lines.reduce((a, l) => a + num(l.qty), 0);
  const totalAmt = D.lines.reduce((a, l) => a + num(l.qty) * num(l.rate), 0);

  const body = () => ({
    po_id: D.po_id, transporter: D.transporter, awb: D.awb, box_count: num(D.box_count),
    ship_to: D.ship_to, dispatch_date: D.dispatch_date || null, notes: D.notes,
    lines: D.lines.filter(l => num(l.qty) > 0).map(l => ({
      po_line_id: l.po_line_id, master_id: l.master_id ? Number(l.master_id) : null,
      item_code: l.item_code, description: l.description, colour: l.colour, size: l.size,
      qty: num(l.qty), rate: num(l.rate), carton_no: l.carton_no,
    })),
  });

  const save = async (close) => {
    setBusy(true); setMsg("");
    try {
      const { data } = D.id ? await api.put(`/dispatches/${D.id}`, body()) : await api.post("/dispatches", body());
      setD(mapDetail(data)); onSaved();
      if (close) onClose(); else { setMsg("✅ Saved as draft"); setTimeout(() => setMsg(""), 2000); }
      return data;
    } catch (e) { setMsg(e.response?.data?.detail || "Error"); return null; }
    finally { setBusy(false); }
  };

  const confirm = async () => {
    if (!window.confirm("Dispatch now? This deducts warehouse stock and can't be undone.")) return;
    setBusy(true); setMsg("");
    try {
      let id = D.id;
      if (!id) { const saved = await save(false); if (!saved) return; id = saved.id; }
      else { await api.put(`/dispatches/${id}`, body()); }
      const { data } = await api.post(`/dispatches/${id}/confirm`);
      setD(mapDetail(data)); onSaved();
      setMsg("✅ Dispatched! Stock deducted. You can print the packing slip.");
    } catch (e) { setMsg(e.response?.data?.detail || "Error"); }
    finally { setBusy(false); }
  };

  const del = async () => {
    if (!window.confirm("Delete this draft dispatch?")) return;
    try { await api.delete(`/dispatches/${D.id}`); onSaved(); onClose(); }
    catch (e) { setMsg(e.response?.data?.detail || "Error"); }
  };

  const inp = S.input, lab = S.lab;

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "flex-start", justifyContent: "center", padding: 16, zIndex: 300, overflowY: "auto" }}>
      <div onClick={e => e.stopPropagation()} style={{ background: "white", borderRadius: 16, width: "100%", maxWidth: 980, margin: "24px 0" }}>
        <div style={{ ...S.header, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontWeight: 800, fontSize: 16 }}>{D.dispatch_no ? D.dispatch_no : "New Dispatch"} · PO {D.po_number} · {D.client_name}</div>
          <X size={20} style={{ cursor: "pointer" }} onClick={onClose} />
        </div>
        <div style={{ padding: 20 }}>
          {msg && <div style={{ background: msg.startsWith("✅") ? "#d1f5ea" : "#ffe0e3", color: msg.startsWith("✅") ? "#1b5e20" : "#b71c1c", borderRadius: 8, padding: "8px 12px", marginBottom: 12, fontSize: 13, fontWeight: 600 }}>{msg}</div>}
          {dispatched && <div style={{ background: "#d1f5ea", color: "#1b5e20", borderRadius: 8, padding: "8px 12px", marginBottom: 12, fontSize: 13, fontWeight: 700, display: "flex", alignItems: "center", gap: 6 }}><CheckCircle size={15} /> Dispatched — stock has been deducted. This record is now read-only.</div>}

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 10, marginBottom: 14 }}>
            <div><label style={lab}>Transporter / courier</label><input style={inp} disabled={dispatched} value={D.transporter} onChange={e => set("transporter", e.target.value)} /></div>
            <div><label style={lab}>AWB / LR no.</label><input style={inp} disabled={dispatched} value={D.awb} onChange={e => set("awb", e.target.value)} /></div>
            <div><label style={lab}>Boxes</label><input style={inp} type="number" disabled={dispatched} value={D.box_count} onChange={e => set("box_count", e.target.value)} /></div>
            <div><label style={lab}>Date</label><input style={inp} type="date" disabled={dispatched} value={(D.dispatch_date || "").slice(0, 10)} onChange={e => set("dispatch_date", e.target.value)} /></div>
          </div>
          <div style={{ marginBottom: 14 }}><label style={lab}>Ship-to address</label><textarea style={{ ...inp, minHeight: 46, resize: "vertical" }} disabled={dispatched} value={D.ship_to} onChange={e => set("ship_to", e.target.value)} /></div>

          <div style={{ fontWeight: 800, fontSize: 13, color: "#283593", marginBottom: 6 }}>ITEMS TO SHIP</div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, minWidth: 720 }}>
              <thead><tr style={{ background: "#f8f9fc" }}>{["Item / Size", "Warehouse SKU", "Avail", "Pending", "Ship qty", "Carton", "Rate", "Amount"].map(h => <th key={h} style={{ ...S.th, padding: "8px 8px" }}>{h}</th>)}</tr></thead>
              <tbody>
                {D.lines.map((l, i) => {
                  const a = l.available != null ? l.available : avail(l.master_id);
                  const over = a != null && num(l.qty) > a;
                  return (
                    <tr key={i} style={{ borderTop: "1px solid #f0f0f0" }}>
                      <td style={{ padding: "6px 8px" }}><div style={{ fontFamily: "monospace", fontWeight: 700 }}>{l.item_code || "—"}</div><div style={{ fontSize: 11, color: "#6c757d" }}>{l.description} {l.colour} {l.size && `· ${l.size}`}</div></td>
                      <td style={{ padding: 4 }}>
                        <select style={{ ...inp, padding: "6px 7px", minWidth: 150 }} disabled={dispatched} value={l.master_id || ""} onChange={e => setLine(i, "master_id", e.target.value)}>
                          <option value="">Pick SKU…</option>
                          {stock.map(s => <option key={s.id} value={s.id}>{s.sku_code}{s.size ? ` (${s.size})` : ""} · {s.sellable}</option>)}
                        </select>
                      </td>
                      <td style={{ padding: "6px 8px", fontWeight: 700, color: a === 0 ? "#b71c1c" : "#1b5e20" }}>{a == null ? "—" : a}</td>
                      <td style={{ padding: "6px 8px", color: "#6c757d" }}>{l.pending == null ? "—" : l.pending}</td>
                      <td style={{ padding: 4 }}><input style={{ ...inp, padding: "6px 7px", width: 80, borderColor: over ? "#e94560" : "#dee2e6" }} type="number" min="0" disabled={dispatched} value={l.qty} onChange={e => setLine(i, "qty", e.target.value)} />{over && <div style={{ fontSize: 10, color: "#e94560", fontWeight: 700 }}>&gt; stock</div>}</td>
                      <td style={{ padding: 4 }}><input style={{ ...inp, padding: "6px 7px", width: 70 }} disabled={dispatched} value={l.carton_no} onChange={e => setLine(i, "carton_no", e.target.value)} placeholder="C1" /></td>
                      <td style={{ padding: 4 }}><input style={{ ...inp, padding: "6px 7px", width: 80 }} type="number" step="0.01" disabled={dispatched} value={l.rate} onChange={e => setLine(i, "rate", e.target.value)} /></td>
                      <td style={{ padding: "6px 8px", fontWeight: 700, whiteSpace: "nowrap" }}>{money(num(l.qty) * num(l.rate))}</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot><tr style={{ background: "#f8f9fc", borderTop: "2px solid #dee2e6", fontWeight: 800 }}>
                <td colSpan={4} style={{ padding: "8px 8px" }}>Total</td>
                <td style={{ padding: "8px 8px" }}>{totalQty}</td>
                <td colSpan={2}></td>
                <td style={{ padding: "8px 8px" }}>{money(totalAmt)}</td>
              </tr></tfoot>
            </table>
          </div>

          <div style={{ marginTop: 12 }}><label style={lab}>Notes</label><textarea style={{ ...inp, minHeight: 40, resize: "vertical" }} disabled={dispatched} value={D.notes} onChange={e => set("notes", e.target.value)} /></div>

          <div style={{ display: "flex", gap: 8, marginTop: 16, flexWrap: "wrap" }}>
            {!dispatched && <button onClick={() => save(true)} disabled={busy} style={{ background: "white", color: "#283593", border: "1.5px solid #283593", borderRadius: 10, padding: "10px 16px", fontWeight: 700, cursor: "pointer", fontSize: 14, display: "inline-flex", alignItems: "center", gap: 6 }}><Save size={15} /> Save draft</button>}
            {!dispatched && <button onClick={confirm} disabled={busy} style={{ ...S.btn, background: "#1b5e20" }}><Truck size={15} /> Dispatch &amp; deduct stock</button>}
            {dispatched && <button onClick={() => printSlip(D)} style={{ ...S.btn, background: "#283593" }}><Printer size={15} /> Print packing slip</button>}
            <div style={{ flex: 1 }} />
            {!dispatched && D.id && <button onClick={del} style={{ background: "white", color: "#b71c1c", border: "1.5px solid #ffd0d6", borderRadius: 10, padding: "10px 16px", fontWeight: 700, cursor: "pointer" }}>Delete draft</button>}
          </div>
        </div>
      </div>
    </div>
  );
}

function printSlip(D) {
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
  const money = (n) => "Rs " + (Number(n) || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const lines = D.lines.filter(l => (Number(l.qty) || 0) > 0);
  // group carton-wise
  const cartons = {};
  lines.forEach(l => { const c = l.carton_no || "—"; (cartons[c] = cartons[c] || []).push(l); });
  let totalQty = 0, totalAmt = 0;
  const cartonHtml = Object.keys(cartons).map(cn => {
    const rows = cartons[cn].map(l => {
      const amt = (Number(l.qty) || 0) * (Number(l.rate) || 0);
      totalQty += Number(l.qty) || 0; totalAmt += amt;
      return `<tr><td>${esc(l.item_code)}</td><td>${esc(l.description)} ${esc(l.colour)}</td><td style="text-align:center">${esc(l.size)}</td><td style="text-align:right">${Number(l.qty) || 0}</td><td style="text-align:right">${money(l.rate)}</td><td style="text-align:right">${money(amt)}</td></tr>`;
    }).join("");
    const cq = cartons[cn].reduce((a, l) => a + (Number(l.qty) || 0), 0);
    return `<tr class="carton"><td colspan="6">Carton ${esc(cn)} — ${cq} pcs</td></tr>${rows}`;
  }).join("");

  const html = `<html><head><title>Packing Slip ${esc(D.dispatch_no || "")}</title>
  <style>
    *{font-family:Arial,Helvetica,sans-serif;box-sizing:border-box}
    body{margin:24px;color:#1a1a2e}
    .top{display:flex;justify-content:space-between;border-bottom:3px solid #1a1a2e;padding-bottom:10px;margin-bottom:14px}
    .brand{font-size:26px;font-weight:900;letter-spacing:1px}
    .sub{font-size:12px;color:#555}
    h2{font-size:15px;margin:0 0 4px}
    .meta{display:flex;gap:30px;flex-wrap:wrap;font-size:13px;margin-bottom:14px}
    .meta div b{display:block;font-size:10px;color:#888;text-transform:uppercase;font-weight:700}
    table{width:100%;border-collapse:collapse;font-size:12.5px}
    th{background:#f0f0f0;text-align:left;padding:7px 8px;border:1px solid #ccc;font-size:11px}
    td{padding:6px 8px;border:1px solid #ddd}
    tr.carton td{background:#eef2ff;font-weight:800;color:#283593}
    tfoot td{font-weight:900;background:#f8f8f8;border-top:2px solid #1a1a2e}
    .foot{margin-top:20px;display:flex;justify-content:space-between;font-size:12px;color:#555}
    .box{border:1px solid #ccc;border-radius:6px;padding:8px 14px;font-weight:800}
    @media print{button{display:none}}
  </style></head><body>
  <div class="top">
    <div><div class="brand">HOUSE OF BRANDS</div><div class="sub">Garment manufacturing · Surat</div></div>
    <div style="text-align:right"><h2>PACKING SLIP</h2><div class="sub">${esc(D.dispatch_no || "")}</div></div>
  </div>
  <div class="meta">
    <div><b>Client</b>${esc(D.client_name || (D.client && D.client.name) || "")}</div>
    <div><b>PO Number</b>${esc(D.po_number || "")}</div>
    <div><b>Date</b>${D.dispatch_date ? new Date(D.dispatch_date).toLocaleDateString("en-IN") : ""}</div>
    <div><b>Transporter</b>${esc(D.transporter || "")}</div>
    <div><b>AWB / LR</b>${esc(D.awb || "")}</div>
  </div>
  <div class="meta"><div style="max-width:420px"><b>Ship to</b>${esc(D.ship_to || "").replace(/\n/g, "<br>")}</div></div>
  <table>
    <thead><tr><th>Item code</th><th>Description</th><th style="text-align:center">Size</th><th style="text-align:right">Qty</th><th style="text-align:right">Rate</th><th style="text-align:right">Amount</th></tr></thead>
    <tbody>${cartonHtml}</tbody>
    <tfoot><tr><td colspan="3">TOTAL</td><td style="text-align:right">${totalQty}</td><td></td><td style="text-align:right">${money(totalAmt)}</td></tr></tfoot>
  </table>
  <div class="foot">
    <div class="box">Total boxes: ${Number(D.box_count) || 0}</div>
    <div>Received by: ____________________&nbsp;&nbsp;&nbsp;Signature &amp; date</div>
  </div>
  <div style="margin-top:26px;text-align:center"><button onclick="window.print()" style="padding:10px 20px;font-weight:700;background:#283593;color:#fff;border:none;border-radius:8px;cursor:pointer">Print</button></div>
  </body></html>`;
  const w = window.open("", "_blank");
  if (!w) { alert("Please allow pop-ups to print the packing slip."); return; }
  w.document.write(html); w.document.close(); w.focus();
}
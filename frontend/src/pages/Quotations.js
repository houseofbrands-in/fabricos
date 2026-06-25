import { useState, useEffect } from "react";
import Layout from "../components/Layout";
import api from "../api";
import { useAuth } from "../context/AuthContext";
import { Calculator, Plus, X, Trash2, Save, Search, FileText, ArrowRight } from "lucide-react";

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
const CAT_LABEL = { jobwork: "Job work", trim: "Trim / accessory", other: "Other / overhead" };
const STATUS = { draft: ["#fff3cd", "#7a5b00"], submitted: ["#e8eaf6", "#283593"], approved: ["#d1f5ea", "#1b5e20"], rejected: ["#ffe0e3", "#b71c1c"] };
const blank = () => ({ client_name: "", style_ref: "", quote_date: new Date().toISOString().slice(0, 10), status: "draft", description: "", metres_per_piece: 0, fabric_rate: 0, chosen_vendor: "", stitch_cost: 0, wastage_pct: 0, margin_pct: 0, quoted_price: 0, notes: "", fabric_rates: [], items: [] });

export default function Quotations() {
  const { user } = useAuth();
  const [quotes, setQuotes] = useState([]);
  const [clients, setClients] = useState([]);
  const [q, setQ] = useState("");
  const [statusF, setStatusF] = useState("all");
  const [editing, setEditing] = useState(null);

  const load = () => api.get("/quotations").then(r => setQuotes(r.data));
  const loadClients = () => api.get("/quotations/clients").then(r => setClients(r.data)).catch(() => {});
  useEffect(() => { load(); loadClients(); }, []);

  const ql = q.trim().toLowerCase();
  const filtered = quotes.filter(x =>
    (statusF === "all" || x.status === statusF) &&
    (!ql || (x.client_name || "").toLowerCase().includes(ql) || (x.style_ref || "").toLowerCase().includes(ql) || (x.description || "").toLowerCase().includes(ql))
  );

  return (
    <Layout>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10, marginBottom: 16 }}>
        <div>
          <h2 style={{ fontWeight: 900, margin: 0 }}>Quotations</h2>
          <p style={{ color: "#6c757d", margin: "2px 0 0", fontSize: 14 }}>Estimate-first costing for client work — quote from vendor rates before buying fabric</p>
        </div>
        <button style={S.btn} onClick={() => setEditing(blank())}><Plus size={16} /> New Quote</button>
      </div>

      <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
        <div style={{ position: "relative", flex: "1 1 280px", maxWidth: 360 }}>
          <Search size={15} style={{ position: "absolute", left: 10, top: 10, color: "#adb5bd" }} />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search client, style, description…" style={{ ...S.input, paddingLeft: 32 }} />
        </div>
        <select value={statusF} onChange={e => setStatusF(e.target.value)} style={{ ...S.input, width: "auto" }}>
          {["all", "draft", "submitted", "approved", "rejected"].map(s => <option key={s} value={s}>{s === "all" ? "All statuses" : s[0].toUpperCase() + s.slice(1)}</option>)}
        </select>
      </div>

      <div style={S.card}>
        <div style={S.header}><h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, display: "flex", alignItems: "center", gap: 6 }}><FileText size={15} /> Quotes ({filtered.length})</h3></div>
        {filtered.length === 0 ? (
          <div style={{ textAlign: "center", padding: 48, color: "#adb5bd", fontSize: 14 }}>{quotes.length === 0 ? "No quotes yet — create your first one" : "No quotes match"}</div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead><tr style={{ background: "#f8f9fc" }}>{["Client", "Style", "Description", "Status", "Cost/pc", "Suggested", "Quoted", ""].map(h => <th key={h} style={S.th}>{h}</th>)}</tr></thead>
              <tbody>
                {filtered.map((x, i) => (
                  <tr key={x.id} style={{ borderTop: "1px solid #f0f0f0", background: i % 2 ? "#fafafa" : "white", cursor: "pointer" }} onClick={() => api.get(`/quotations/${x.id}`).then(r => setEditing(r.data))}>
                    <td style={S.td}><b>{x.client_name || "—"}</b></td>
                    <td style={{ ...S.td, fontFamily: "monospace" }}>{x.style_ref || "—"}</td>
                    <td style={{ ...S.td, color: "#6c757d", maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{x.description || "—"}</td>
                    <td style={S.td}><span style={{ background: (STATUS[x.status] || STATUS.draft)[0], color: (STATUS[x.status] || STATUS.draft)[1], borderRadius: 20, padding: "2px 10px", fontSize: 12, fontWeight: 700 }}>{x.status}</span>{x.converted && <span style={{ marginLeft: 6, fontSize: 11, color: "#1b5e20" }}>→ design</span>}</td>
                    <td style={S.td}>{money(x.total_cost)}</td>
                    <td style={S.td}>{x.suggested_price != null ? money(x.suggested_price) : "—"}</td>
                    <td style={{ ...S.td, fontWeight: 700 }}>{x.quoted_price > 0 ? money(x.quoted_price) : "—"}</td>
                    <td style={S.td}><ArrowRight size={15} color="#adb5bd" /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {editing && <QuoteEditor quote={editing} clients={clients} onClose={() => setEditing(null)} onSaved={() => { load(); loadClients(); }} />}
    </Layout>
  );
}

function QuoteEditor({ quote, clients, onClose, onSaved }) {
  const [Q, setQ] = useState(quote);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const isNew = !Q.id;

  const num = (v) => Number(v) || 0;
  const set = (k, v) => setQ(s => ({ ...s, [k]: v }));
  const setItem = (i, k, v) => setQ(s => ({ ...s, items: s.items.map((it, j) => j === i ? { ...it, [k]: v } : it) }));
  const addItem = (category) => setQ(s => ({ ...s, items: [...s.items, { category, label: "", cost_per_piece: 0 }] }));
  const delItem = (i) => setQ(s => ({ ...s, items: s.items.filter((_, j) => j !== i) }));
  const setRate = (i, k, v) => setQ(s => ({ ...s, fabric_rates: s.fabric_rates.map((r, j) => j === i ? { ...r, [k]: v } : r) }));
  const addRate = () => setQ(s => ({ ...s, fabric_rates: [...s.fabric_rates, { vendor_name: "", rate: 0 }] }));
  const delRate = (i) => setQ(s => ({ ...s, fabric_rates: s.fabric_rates.filter((_, j) => j !== i) }));
  const useRate = (r) => setQ(s => ({ ...s, fabric_rate: num(r.rate), chosen_vendor: r.vendor_name || "" }));

  const fabricCost = num(Q.metres_per_piece) * num(Q.fabric_rate);
  const itemsTotal = Q.items.reduce((a, it) => a + num(it.cost_per_piece), 0);
  const subtotal = fabricCost + num(Q.stitch_cost) + itemsTotal;
  const wastageAmt = subtotal * num(Q.wastage_pct) / 100;
  const totalCost = subtotal + wastageAmt;
  const mp = num(Q.margin_pct);
  const suggested = mp > 0 && mp < 100 ? totalCost / (1 - mp / 100) : null;
  const sp = num(Q.quoted_price);
  const realMargin = sp > 0 ? (sp - totalCost) / sp * 100 : null;
  const profit = sp > 0 ? sp - totalCost : null;
  const catTotal = (c) => Q.items.filter(i => i.category === c).reduce((a, i) => a + num(i.cost_per_piece), 0);

  const body = () => ({ ...Q, metres_per_piece: num(Q.metres_per_piece), fabric_rate: num(Q.fabric_rate), stitch_cost: num(Q.stitch_cost), wastage_pct: num(Q.wastage_pct), margin_pct: num(Q.margin_pct), quoted_price: num(Q.quoted_price), fabric_rates: Q.fabric_rates.map(r => ({ vendor_name: r.vendor_name, rate: num(r.rate) })), items: Q.items.map(it => ({ category: it.category, label: it.label, cost_per_piece: num(it.cost_per_piece) })) });

  const save = async (closeAfter) => {
    setBusy(true); setMsg("");
    try {
      const { data } = isNew ? await api.post("/quotations", body()) : await api.put(`/quotations/${Q.id}`, body());
      setQ(data); onSaved();
      if (closeAfter) onClose(); else { setMsg("✅ Saved"); setTimeout(() => setMsg(""), 2000); }
    } catch (e) { setMsg(e.response?.data?.detail || "Error"); }
    finally { setBusy(false); }
  };

  const del = async () => {
    if (!window.confirm("Delete this quotation permanently?")) return;
    try { await api.delete(`/quotations/${Q.id}`); onSaved(); onClose(); }
    catch (e) { setMsg(e.response?.data?.detail || "Error"); }
  };

  const convert = async () => {
    if (isNew) { setMsg("Save the quote first"); return; }
    const t = window.prompt("Convert to a design. Target quantity (optional, you can edit later):", "0");
    if (t === null) return;
    try {
      const { data } = await api.post(`/quotations/${Q.id}/convert`, { target_qty: parseInt(t) || 0 });
      const { data: fresh } = await api.get(`/quotations/${Q.id}`);
      setQ(fresh); onSaved();
      setMsg(`✅ Created design ${data.design_code}. Find it (and its cost sheet) on the Designer page.`);
    } catch (e) { setMsg(e.response?.data?.detail || "Error"); }
  };

  const inp = S.input, lab = S.lab;
  const row = (label, value, bold) => (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", fontWeight: bold ? 800 : 400, fontSize: bold ? 15 : 13.5, borderTop: bold ? "2px solid #1a1a2e" : "1px solid #f0f0f0" }}><span>{label}</span><span>{value}</span></div>
  );

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "flex-start", justifyContent: "center", padding: 16, zIndex: 300, overflowY: "auto" }}>
      <div onClick={e => e.stopPropagation()} style={{ background: "white", borderRadius: 16, width: "100%", maxWidth: 920, margin: "20px 0", overflow: "hidden" }}>
        <div style={{ ...S.header, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontWeight: 800, fontSize: 16, display: "flex", alignItems: "center", gap: 8 }}><Calculator size={17} /> {isNew ? "New Quotation" : `Quote — ${Q.client_name || ""} ${Q.style_ref || ""}`}</div>
          <X size={20} style={{ cursor: "pointer" }} onClick={onClose} />
        </div>

        <div style={{ padding: 22 }}>
          {msg && <div style={{ background: msg.startsWith("✅") ? "#d1f5ea" : "#ffe0e3", color: msg.startsWith("✅") ? "#1b5e20" : "#b71c1c", borderRadius: 8, padding: "8px 12px", marginBottom: 14, fontSize: 13, fontWeight: 600 }}>{msg}</div>}

          <div style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr", gap: 24, alignItems: "start" }}>
            <div>
              {/* header fields */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
                <div><label style={lab}>Client</label><input style={inp} list="clientlist" value={Q.client_name} onChange={e => set("client_name", e.target.value)} placeholder="e.g. Shein" />
                  <datalist id="clientlist">{clients.map(c => <option key={c} value={c} />)}</datalist></div>
                <div><label style={lab}>Style / ref</label><input style={inp} value={Q.style_ref} onChange={e => set("style_ref", e.target.value)} placeholder="e.g. SHN-2231" /></div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
                <div><label style={lab}>Date</label><input style={inp} type="date" value={(Q.quote_date || "").slice(0, 10)} onChange={e => set("quote_date", e.target.value)} /></div>
                <div><label style={lab}>Status</label><select style={inp} value={Q.status} onChange={e => set("status", e.target.value)}>{["draft", "submitted", "approved", "rejected"].map(s => <option key={s} value={s}>{s}</option>)}</select></div>
              </div>
              <div style={{ marginBottom: 16 }}><label style={lab}>Description</label><input style={inp} value={Q.description} onChange={e => set("description", e.target.value)} placeholder="e.g. Floral midi dress" /></div>

              {/* vendor fabric rates */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                <span style={{ fontWeight: 800, fontSize: 13, color: "#283593" }}>VENDOR FABRIC RATES (compare & pick)</span>
                <button onClick={addRate} style={{ background: "#eef2ff", color: "#3730a3", border: "none", borderRadius: 7, padding: "4px 10px", fontWeight: 700, fontSize: 12, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 4 }}><Plus size={12} /> Add vendor</button>
              </div>
              {Q.fabric_rates.length === 0 && <div style={{ fontSize: 12, color: "#ced4da", marginBottom: 8 }}>No vendor rates added — or just type a fabric rate below.</div>}
              {Q.fabric_rates.map((r, i) => {
                const chosen = Q.chosen_vendor && r.vendor_name === Q.chosen_vendor && num(r.rate) === num(Q.fabric_rate);
                return (
                  <div key={i} style={{ display: "flex", gap: 8, marginBottom: 6, alignItems: "center" }}>
                    <input style={{ ...inp, flex: 1 }} placeholder="Vendor name" value={r.vendor_name} onChange={e => setRate(i, "vendor_name", e.target.value)} />
                    <input style={{ ...inp, width: 100 }} type="number" step="0.01" placeholder="₹/m" value={r.rate} onChange={e => setRate(i, "rate", e.target.value)} />
                    <button onClick={() => useRate(r)} style={{ background: chosen ? "#1b5e20" : "#e8eaf6", color: chosen ? "white" : "#283593", border: "none", borderRadius: 8, padding: "8px 10px", fontWeight: 700, fontSize: 12, cursor: "pointer", whiteSpace: "nowrap" }}>{chosen ? "✓ Using" : "Use"}</button>
                    <button onClick={() => delRate(i)} style={{ background: "#ffe0e3", border: "none", borderRadius: 8, padding: "0 9px", cursor: "pointer", color: "#b71c1c" }}><Trash2 size={13} /></button>
                  </div>
                );
              })}

              {/* fabric & stitch */}
              <div style={{ fontWeight: 800, fontSize: 13, color: "#283593", margin: "16px 0 8px" }}>FABRIC & STITCHING (estimated)</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 16 }}>
                <div><label style={lab}>Metres / piece</label><input style={inp} type="number" step="0.001" value={Q.metres_per_piece} onChange={e => set("metres_per_piece", e.target.value)} /></div>
                <div><label style={lab}>Fabric rate ₹/m</label><input style={inp} type="number" step="0.01" value={Q.fabric_rate} onChange={e => set("fabric_rate", e.target.value)} /></div>
                <div><label style={lab}>Stitching ₹/pc</label><input style={inp} type="number" step="0.01" value={Q.stitch_cost} onChange={e => set("stitch_cost", e.target.value)} /></div>
              </div>

              {["jobwork", "trim", "other"].map(cat => (
                <div key={cat} style={{ marginBottom: 14 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                    <span style={{ fontWeight: 800, fontSize: 13, color: "#283593" }}>{CAT_LABEL[cat].toUpperCase()}</span>
                    <button onClick={() => addItem(cat)} style={{ background: "#eef2ff", color: "#3730a3", border: "none", borderRadius: 7, padding: "4px 10px", fontWeight: 700, fontSize: 12, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 4 }}><Plus size={12} /> Add</button>
                  </div>
                  {Q.items.map((it, i) => it.category === cat ? (
                    <div key={i} style={{ display: "flex", gap: 8, marginBottom: 6 }}>
                      <input style={{ ...inp, flex: 1 }} placeholder={cat === "jobwork" ? "e.g. Printing" : cat === "trim" ? "e.g. Buttons, Zip" : "e.g. Finishing"} value={it.label} onChange={e => setItem(i, "label", e.target.value)} />
                      <input style={{ ...inp, width: 110 }} type="number" step="0.01" placeholder="₹/pc" value={it.cost_per_piece} onChange={e => setItem(i, "cost_per_piece", e.target.value)} />
                      <button onClick={() => delItem(i)} style={{ background: "#ffe0e3", border: "none", borderRadius: 8, padding: "0 10px", cursor: "pointer", color: "#b71c1c" }}><Trash2 size={13} /></button>
                    </div>
                  ) : null)}
                  {!Q.items.some(it => it.category === cat) && <div style={{ fontSize: 12, color: "#ced4da" }}>None added</div>}
                </div>
              ))}

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div><label style={lab}>Wastage %</label><input style={inp} type="number" step="0.01" value={Q.wastage_pct} onChange={e => set("wastage_pct", e.target.value)} /></div>
                <div><label style={lab}>Target margin %</label><input style={inp} type="number" step="0.01" value={Q.margin_pct} onChange={e => set("margin_pct", e.target.value)} /></div>
              </div>
              <div style={{ marginTop: 10 }}><label style={lab}>Quoted price you'll submit ₹ (optional)</label><input style={inp} type="number" step="0.01" value={Q.quoted_price} onChange={e => set("quoted_price", e.target.value)} /></div>
              <div style={{ marginTop: 10 }}><label style={lab}>Notes</label><textarea style={{ ...inp, minHeight: 46, resize: "vertical" }} value={Q.notes} onChange={e => set("notes", e.target.value)} /></div>
            </div>

            {/* summary */}
            <div style={{ background: "#f8f9fc", borderRadius: 12, padding: 16, position: "sticky", top: 0 }}>
              <div style={{ fontWeight: 800, fontSize: 13, color: "#283593", marginBottom: 6 }}>COST / PIECE</div>
              {row("Fabric", money(fabricCost))}
              {row("Stitching", money(num(Q.stitch_cost)))}
              {row("Job work", money(catTotal("jobwork")))}
              {row("Trims", money(catTotal("trim")))}
              {row("Other", money(catTotal("other")))}
              {row(`Wastage (${num(Q.wastage_pct)}%)`, money(wastageAmt))}
              {row("Total cost", money(totalCost), true)}
              <div style={{ height: 12 }} />
              {suggested != null && row(`Suggested quote @${num(Q.margin_pct)}%`, money(suggested))}
              {sp > 0 && row("Your quote", money(sp))}
              {profit != null && <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 10px", marginTop: 8, borderRadius: 8, background: profit >= 0 ? "#d1f5ea" : "#ffe0e3", fontWeight: 800, fontSize: 14, color: profit >= 0 ? "#1b5e20" : "#b71c1c" }}><span>{profit >= 0 ? "Margin" : "Loss"} · {realMargin.toFixed(1)}%</span><span>{money(profit)}</span></div>}

              <button onClick={() => save(false)} disabled={busy} style={{ width: "100%", marginTop: 16, background: "#1b5e20", color: "white", border: "none", borderRadius: 10, padding: "11px", fontWeight: 700, fontSize: 14, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6, opacity: busy ? 0.7 : 1 }}><Save size={15} /> {isNew ? "Create quote" : "Save"}</button>
              {!isNew && !Q.converted_design_id && <button onClick={convert} style={{ width: "100%", marginTop: 8, background: "#283593", color: "white", border: "none", borderRadius: 10, padding: "10px", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>Approve & convert to design →</button>}
              {Q.converted_design_id && <div style={{ marginTop: 8, textAlign: "center", fontSize: 12, color: "#1b5e20", fontWeight: 700 }}>✓ Linked to a design — see the Designer page</div>}
              {!isNew && <button onClick={del} style={{ width: "100%", marginTop: 8, background: "white", color: "#b71c1c", border: "1.5px solid #ffd0d6", borderRadius: 10, padding: "9px", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>Delete quote</button>}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
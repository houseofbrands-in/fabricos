import { useState, useEffect } from "react";
import Layout from "../components/Layout";
import api from "../api";
import { Users, TrendingUp, IndianRupee, Package, Plus, Trash2 } from "lucide-react";

const ROLE_OPTIONS = ["designer", "cutting", "tailor", "qc", "admin"];

export default function Admin() {
  const [wip, setWip] = useState({});
  const [performance, setPerformance] = useState([]);
  const [payroll, setPayroll] = useState(null);
  const [users, setUsers] = useState([]);
  const [tab, setTab] = useState("wip");
  const [newUser, setNewUser] = useState({ name: "", role: "tailor", pin: "" });
  const [uMsg, setUMsg] = useState("");

  const loadAll = () => {
    api.get("/admin/wip").then(r => setWip(r.data));
    api.get("/admin/tailor-performance").then(r => setPerformance(r.data));
    api.get("/admin/payroll").then(r => setPayroll(r.data));
    api.get("/admin/users").then(r => setUsers(r.data));
  };
  useEffect(loadAll, []);

  const createUser = async (e) => {
    e.preventDefault();
    setUMsg("");
    try {
      await api.post("/admin/users", newUser);
      setUMsg("✅ User created!");
      setNewUser({ name: "", role: "tailor", pin: "" });
      api.get("/admin/users").then(r => setUsers(r.data));
    } catch (e) {
      setUMsg(e.response?.data?.detail || "Error");
    }
  };

  const deleteUser = async (uid, name) => {
    if (!window.confirm(`Deactivate ${name}?`)) return;
    await api.delete(`/admin/users/${uid}`);
    api.get("/admin/users").then(r => setUsers(r.data));
  };

  const WIP_STAGES = [
    ["cut", "#1565c0", "Cut"],
    ["in_progress", "#f57f17", "Stitching"],
    ["qc_pending", "#7b1fa2", "QC Pending"],
    ["alteration", "#b71c1c", "Alteration"],
    ["passed", "#1b5e20", "Passed"],
  ];

  const tabs = ["wip", "performance", "payroll", "users"];

  return (
    <Layout>
      <h2 style={{ fontWeight: 900, marginBottom: 4 }}>Admin Dashboard</h2>
      <p style={{ color: "#6c757d", marginBottom: 16, fontSize: 14 }}>Factory overview, payroll & user management</p>

      {/* Tab Nav */}
      <div style={{ display: "flex", gap: 4, marginBottom: 20, background: "white", borderRadius: 12, padding: 4, boxShadow: "0 2px 8px rgba(0,0,0,0.05)", width: "fit-content" }}>
        {tabs.map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            background: tab === t ? "#1a1a2e" : "transparent",
            color: tab === t ? "white" : "#6c757d",
            border: "none", borderRadius: 9, padding: "8px 18px",
            fontWeight: 700, fontSize: 13, cursor: "pointer", textTransform: "capitalize",
          }}>{t === "wip" ? "WIP" : t.charAt(0).toUpperCase() + t.slice(1)}</button>
        ))}
      </div>

      {/* WIP Tab */}
      {tab === "wip" && (
        <div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 12, marginBottom: 20 }}>
            {WIP_STAGES.map(([key, color, label]) => (
              <div key={key} style={{ background: "white", borderRadius: 14, padding: 20, boxShadow: "0 2px 12px rgba(0,0,0,0.06)", borderLeft: `4px solid ${color}`, textAlign: "center" }}>
                <div style={{ fontSize: 32, fontWeight: 900, color }}>{wip[key] || 0}</div>
                <div style={{ fontSize: 13, color: "#6c757d", marginTop: 2 }}>{label}</div>
              </div>
            ))}
            <div style={{ background: "white", borderRadius: 14, padding: 20, boxShadow: "0 2px 12px rgba(0,0,0,0.06)", borderLeft: "4px solid #424242", textAlign: "center" }}>
              <div style={{ fontSize: 32, fontWeight: 900, color: "#424242" }}>{Object.values(wip).reduce((a, b) => a + b, 0)}</div>
              <div style={{ fontSize: 13, color: "#6c757d", marginTop: 2 }}>Total Bundles</div>
            </div>
          </div>
        </div>
      )}

      {/* Performance Tab */}
      {tab === "performance" && (
        <div style={{ background: "white", borderRadius: 16, boxShadow: "0 2px 12px rgba(0,0,0,0.06)", overflow: "hidden" }}>
          <div style={{ background: "linear-gradient(135deg,#1a1a2e,#0f3460)", color: "white", padding: "14px 20px" }}>
            <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}><TrendingUp size={15} style={{ marginRight: 6 }} />Tailor Performance</h3>
          </div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
              <thead>
                <tr style={{ background: "#f8f9fc" }}>
                  {["Tailor", "Passed", "Alterations", "Earnings", "Quality %"].map(h => (
                    <th key={h} style={{ padding: "10px 16px", textAlign: "left", fontSize: 12, fontWeight: 700, color: "#6c757d" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {performance.map((p, i) => (
                  <tr key={p.id} style={{ borderTop: "1px solid #f0f0f0" }}>
                    <td style={{ padding: "12px 16px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <div style={{ width: 36, height: 36, borderRadius: "50%", background: "#1a1a2e", color: "white", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800 }}>
                          {p.name[0].toUpperCase()}
                        </div>
                        <span style={{ fontWeight: 600 }}>{p.name}</span>
                      </div>
                    </td>
                    <td style={{ padding: "12px 16px", fontWeight: 700, color: "#1b5e20" }}>{p.passed}</td>
                    <td style={{ padding: "12px 16px" }}>
                      {p.alterations > 0
                        ? <span style={{ background: "#ffe0e3", color: "#b71c1c", borderRadius: 20, padding: "2px 10px", fontSize: 12, fontWeight: 700 }}>{p.alterations}</span>
                        : <span style={{ color: "#adb5bd" }}>—</span>}
                    </td>
                    <td style={{ padding: "12px 16px", fontWeight: 800 }}>₹{p.earnings.toLocaleString("en-IN")}</td>
                    <td style={{ padding: "12px 16px" }}>
                      {p.quality_pct !== null ? (
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <div style={{ flex: 1, background: "#f0f0f0", height: 6, borderRadius: 3 }}>
                            <div style={{ width: `${p.quality_pct}%`, height: "100%", borderRadius: 3, background: "linear-gradient(90deg,#e94560,#0f3460)" }} />
                          </div>
                          <span style={{ fontSize: 12, fontWeight: 700 }}>{p.quality_pct}%</span>
                        </div>
                      ) : <span style={{ color: "#adb5bd", fontSize: 12 }}>No data</span>}
                    </td>
                  </tr>
                ))}
                {performance.length === 0 && (
                  <tr><td colSpan={5} style={{ textAlign: "center", padding: 40, color: "#adb5bd" }}>No tailors yet</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Payroll Tab */}
      {tab === "payroll" && payroll && (
        <div style={{ background: "white", borderRadius: 16, boxShadow: "0 2px 12px rgba(0,0,0,0.06)", overflow: "hidden", maxWidth: 600 }}>
          <div style={{ background: "linear-gradient(135deg,#1a1a2e,#0f3460)", color: "white", padding: "14px 20px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}><IndianRupee size={15} style={{ marginRight: 4 }} />Weekly Payroll</h3>
            <span style={{ fontSize: 12, opacity: 0.75 }}>{payroll.week_start} – {payroll.week_end}</span>
          </div>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
            <thead>
              <tr style={{ background: "#f8f9fc" }}>
                {["Tailor", "Pieces", "Amount Due"].map(h => (
                  <th key={h} style={{ padding: "10px 16px", textAlign: "left", fontSize: 12, fontWeight: 700, color: "#6c757d" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {payroll.payroll.map(r => (
                <tr key={r.id} style={{ borderTop: "1px solid #f0f0f0" }}>
                  <td style={{ padding: "12px 16px", fontWeight: 600 }}>{r.name}</td>
                  <td style={{ padding: "12px 16px" }}>{r.pieces}</td>
                  <td style={{ padding: "12px 16px", fontWeight: 800, fontSize: 16, color: "#1b5e20" }}>₹{r.amount.toLocaleString("en-IN")}</td>
                </tr>
              ))}
              {payroll.payroll.length === 0 && (
                <tr><td colSpan={3} style={{ textAlign: "center", padding: 40, color: "#adb5bd" }}>No payroll data this week</td></tr>
              )}
            </tbody>
            {payroll.payroll.length > 0 && (
              <tfoot>
                <tr style={{ background: "#f8f9fc", borderTop: "2px solid #dee2e6" }}>
                  <td style={{ padding: "12px 16px", fontWeight: 800 }}>Total</td>
                  <td style={{ padding: "12px 16px", fontWeight: 800 }}>{payroll.total_pieces}</td>
                  <td style={{ padding: "12px 16px", fontWeight: 900, fontSize: 18, color: "#e94560" }}>₹{payroll.total_amount.toLocaleString("en-IN")}</td>
                </tr>
              </tfoot>
            )}
          </table>
          <div style={{ padding: "12px 20px" }}>
            <button onClick={() => window.print()} style={{ background: "#f8f9fc", border: "1px solid #dee2e6", borderRadius: 8, padding: "8px 16px", fontSize: 13, cursor: "pointer", fontWeight: 600 }}>
              🖨 Print Payroll
            </button>
          </div>
        </div>
      )}

      {/* Users Tab */}
      {tab === "users" && (
        <div style={{ display: "grid", gridTemplateColumns: "300px 1fr", gap: 20, alignItems: "start" }}>
          <div style={{ background: "white", borderRadius: 16, boxShadow: "0 2px 12px rgba(0,0,0,0.06)", overflow: "hidden" }}>
            <div style={{ background: "linear-gradient(135deg,#1a1a2e,#0f3460)", color: "white", padding: "14px 20px" }}>
              <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}><Plus size={15} style={{ marginRight: 6 }} />Add User</h3>
            </div>
            <form onSubmit={createUser} style={{ padding: 20 }}>
              {uMsg && <div style={{ background: uMsg.startsWith("✅") ? "#d1f5ea" : "#ffe0e3", borderRadius: 8, padding: "8px 12px", marginBottom: 12, fontSize: 13, color: uMsg.startsWith("✅") ? "#1b5e20" : "#b71c1c" }}>{uMsg}</div>}
              {[
                ["Full Name", "text", "name", "Ramesh Kumar"],
                ["4-digit PIN", "password", "pin", "e.g. 5678"],
              ].map(([label, type, key, ph]) => (
                <div key={key} style={{ marginBottom: 12 }}>
                  <label style={{ fontSize: 12, fontWeight: 700, color: "#495057", display: "block", marginBottom: 4 }}>{label}</label>
                  <input type={type} value={newUser[key]} placeholder={ph} maxLength={key === "pin" ? 4 : undefined}
                    onChange={e => setNewUser(u => ({ ...u, [key]: e.target.value }))} required
                    style={{ width: "100%", border: "1.5px solid #dee2e6", borderRadius: 10, padding: "9px 12px", fontSize: 14, outline: "none", boxSizing: "border-box" }} />
                </div>
              ))}
              <div style={{ marginBottom: 16 }}>
                <label style={{ fontSize: 12, fontWeight: 700, color: "#495057", display: "block", marginBottom: 4 }}>Role</label>
                <select value={newUser.role} onChange={e => setNewUser(u => ({ ...u, role: e.target.value }))}
                  style={{ width: "100%", border: "1.5px solid #dee2e6", borderRadius: 10, padding: "9px 12px", fontSize: 14, outline: "none" }}>
                  {ROLE_OPTIONS.map(r => <option key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</option>)}
                </select>
              </div>
              <button type="submit" style={{ background: "#e94560", color: "white", border: "none", borderRadius: 10, padding: "11px", fontWeight: 700, width: "100%", cursor: "pointer", fontSize: 14 }}>
                Create User
              </button>
            </form>
          </div>

          <div style={{ background: "white", borderRadius: 16, boxShadow: "0 2px 12px rgba(0,0,0,0.06)", overflow: "hidden" }}>
            <div style={{ background: "linear-gradient(135deg,#1a1a2e,#0f3460)", color: "white", padding: "14px 20px" }}>
              <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}><Users size={15} style={{ marginRight: 6 }} />All Users ({users.length})</h3>
            </div>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
              <thead>
                <tr style={{ background: "#f8f9fc" }}>
                  {["Name", "Role", "Status", ""].map(h => (
                    <th key={h} style={{ padding: "10px 16px", textAlign: "left", fontSize: 12, fontWeight: 700, color: "#6c757d" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {users.map(u => (
                  <tr key={u.id} style={{ borderTop: "1px solid #f0f0f0", opacity: u.is_active ? 1 : 0.4 }}>
                    <td style={{ padding: "12px 16px", fontWeight: 600 }}>{u.name}</td>
                    <td style={{ padding: "12px 16px" }}>
                      <span style={{ background: "#f0f0f0", borderRadius: 20, padding: "2px 10px", fontSize: 12, fontWeight: 700 }}>{u.role}</span>
                    </td>
                    <td style={{ padding: "12px 16px" }}>
                      <span style={{ color: u.is_active ? "#1b5e20" : "#b71c1c", fontSize: 12, fontWeight: 700 }}>
                        {u.is_active ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td style={{ padding: "12px 16px" }}>
                      {u.role !== "admin" && u.is_active ? (
                        <button onClick={() => deleteUser(u.id, u.name)} style={{ background: "none", border: "1px solid #dee2e6", borderRadius: 8, padding: "4px 8px", cursor: "pointer", color: "#b71c1c" }}>
                          <Trash2 size={13} />
                        </button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </Layout>
  );
}

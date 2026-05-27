import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth, roleHome } from "../context/AuthContext";
import api from "../api";
import { Scissors, Delete } from "lucide-react";

export default function Login() {
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [multipleUsers, setMultipleUsers] = useState(null);
  const [pendingPin, setPendingPin] = useState("");
  const { login } = useAuth();
  const navigate = useNavigate();

  const addDigit = (d) => {
    if (pin.length < 4) {
      const next = pin + d;
      setPin(next);
      setError("");
      if (next.length === 4) submitPin(next);
    }
  };

  const delDigit = () => setPin((p) => p.slice(0, -1));

  const submitPin = async (p = pin) => {
    if (p.length !== 4) return;
    setLoading(true);
    setError("");
    try {
      const { data } = await api.post("/auth/login", { pin: p });
      if (data.multiple) {
        setMultipleUsers(data.users);
        setPendingPin(p);
        setPin("");
      } else {
        login(data.token, data.user);
        navigate(roleHome(data.user.role));
      }
    } catch (e) {
      setError(e.response?.data?.detail || "Invalid PIN");
      setPin("");
    } finally {
      setLoading(false);
    }
  };

  const selectUser = async (userId) => {
    setLoading(true);
    try {
      const { data } = await api.post("/auth/select", { user_id: userId, pin: pendingPin });
      login(data.token, data.user);
      navigate(roleHome(data.user.role));
    } catch {
      setError("Selection failed");
      setMultipleUsers(null);
    } finally {
      setLoading(false);
    }
  };

  const pinDisplay = pin.padEnd(4, "·").replace(/\d/g, "●");
  const digits = [1, 2, 3, 4, 5, 6, 7, 8, 9];

  return (
    <div style={{
      minHeight: "100vh", background: "#1a1a2e",
      display: "flex", alignItems: "center", justifyContent: "center", padding: 16,
    }}>
      <div style={{
        background: "white", borderRadius: 24, padding: "2.5rem 2rem",
        width: "100%", maxWidth: 360, boxShadow: "0 20px 60px rgba(0,0,0,0.4)",
      }}>
        <div style={{ textAlign: "center", marginBottom: 28 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, marginBottom: 4 }}>
            <Scissors size={24} color="#e94560" />
            <span style={{ fontSize: 26, fontWeight: 900, letterSpacing: -1, color: "#1a1a2e" }}>
              Fabric<span style={{ color: "#e94560" }}>OS</span>
            </span>
          </div>
          <p style={{ color: "#6c757d", fontSize: 13, margin: 0 }}>Factory Floor Management</p>
        </div>

        {error && (
          <div style={{
            background: "#ffe0e3", color: "#b71c1c", borderRadius: 10,
            padding: "10px 14px", marginBottom: 16, fontSize: 13, textAlign: "center",
          }}>{error}</div>
        )}

        {multipleUsers ? (
          <>
            <p style={{ color: "#6c757d", fontSize: 13, textAlign: "center", marginBottom: 12 }}>
              Multiple accounts found. Who are you?
            </p>
            {multipleUsers.map((u) => (
              <button key={u.id} onClick={() => selectUser(u.id)} style={{
                width: "100%", display: "flex", alignItems: "center", gap: 12,
                background: "white", border: "2px solid #dee2e6", borderRadius: 12,
                padding: "12px 16px", cursor: "pointer", marginBottom: 8, transition: "all .15s",
              }}
                onMouseEnter={e => e.currentTarget.style.borderColor = "#e94560"}
                onMouseLeave={e => e.currentTarget.style.borderColor = "#dee2e6"}
              >
                <div style={{
                  width: 40, height: 40, borderRadius: "50%", background: "#1a1a2e",
                  color: "white", display: "flex", alignItems: "center", justifyContent: "center",
                  fontWeight: 800, fontSize: 15,
                }}>{u.name[0].toUpperCase()}</div>
                <div style={{ textAlign: "left" }}>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>{u.name}</div>
                  <div style={{ color: "#6c757d", fontSize: 12 }}>{u.role}</div>
                </div>
              </button>
            ))}
            <button onClick={() => { setMultipleUsers(null); setPin(""); }}
              style={{ width: "100%", marginTop: 8, background: "none", border: "1px solid #dee2e6",
                borderRadius: 10, padding: "8px", cursor: "pointer", fontSize: 13, color: "#6c757d" }}>
              ← Back
            </button>
          </>
        ) : (
          <>
            <div style={{
              letterSpacing: 16, fontSize: 28, fontWeight: 800, color: "#1a1a2e",
              textAlign: "center", borderBottom: "2px solid #e94560", paddingBottom: 8, marginBottom: 20,
            }}>{pinDisplay}</div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10 }}>
              {digits.map((d) => (
                <button key={d} onClick={() => addDigit(String(d))} disabled={loading} style={{
                  background: "#f8f9fc", border: "1px solid #dee2e6", borderRadius: 12,
                  fontSize: 22, fontWeight: 700, padding: "14px", cursor: "pointer",
                  transition: "all .12s", color: "#1a1a2e",
                }}
                  onMouseEnter={e => { e.currentTarget.style.background = "#1a1a2e"; e.currentTarget.style.color = "white"; }}
                  onMouseLeave={e => { e.currentTarget.style.background = "#f8f9fc"; e.currentTarget.style.color = "#1a1a2e"; }}
                >{d}</button>
              ))}
              <button onClick={delDigit} disabled={loading} style={{
                background: "#f8f9fc", border: "1px solid #dee2e6", borderRadius: 12,
                padding: "14px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
              }}><Delete size={18} color="#6c757d" /></button>
              <button onClick={() => addDigit("0")} disabled={loading} style={{
                background: "#f8f9fc", border: "1px solid #dee2e6", borderRadius: 12,
                fontSize: 22, fontWeight: 700, padding: "14px", cursor: "pointer", color: "#1a1a2e",
              }}
                onMouseEnter={e => { e.currentTarget.style.background = "#1a1a2e"; e.currentTarget.style.color = "white"; }}
                onMouseLeave={e => { e.currentTarget.style.background = "#f8f9fc"; e.currentTarget.style.color = "#1a1a2e"; }}
              >0</button>
              <button onClick={() => submitPin()} disabled={loading || pin.length < 4} style={{
                background: pin.length === 4 ? "#e94560" : "#dee2e6",
                border: "none", borderRadius: 12, padding: "14px", cursor: pin.length === 4 ? "pointer" : "default",
                color: "white", fontSize: 18, fontWeight: 700, transition: "background .2s",
              }}>→</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

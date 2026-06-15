import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { LogOut, Scissors, Package, Warehouse as WarehouseIcon } from "lucide-react";

const ROLE_COLORS = {
  admin: "#e94560",
  designer: "#7c3aed",
  cutting: "#0891b2",
  tailor: "#059669",
  qc: "#d97706",
  ironing: "#e65100",
  packing: "#00695c",
  store: "#5d4037",
  warehouse: "#3949ab",
};

export default function Layout({ children }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  return (
    <div style={{ minHeight: "100vh", background: "#f8f9fc", fontFamily: "'Segoe UI', system-ui, sans-serif" }}>
      <nav style={{
        background: "#1a1a2e", padding: "0 16px", height: 56,
        display: "flex", alignItems: "center", justifyContent: "space-between",
        boxShadow: "0 2px 12px rgba(0,0,0,0.2)", position: "sticky", top: 0, zIndex: 100,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Scissors size={20} color="#e94560" />
          <span style={{ color: "white", fontWeight: 900, fontSize: 18, letterSpacing: -0.5 }}>
            Fabric<span style={{ color: "#e94560" }}>OS</span>
          </span>
        </div>
        {user && (
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {user.role === "admin" && (
              <button onClick={() => navigate("/store")} style={{
                background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.2)",
                borderRadius: 8, color: "white", cursor: "pointer", padding: "4px 10px",
                display: "flex", alignItems: "center", gap: 5, fontSize: 12, fontWeight: 600,
              }}>
                <Package size={13} /> Fabric
              </button>
            )}
            {user.role === "admin" && (
              <button onClick={() => navigate("/warehouse")} style={{
                background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.2)",
                borderRadius: 8, color: "white", cursor: "pointer", padding: "4px 10px",
                display: "flex", alignItems: "center", gap: 5, fontSize: 12, fontWeight: 600,
              }}>
                <WarehouseIcon size={13} /> Warehouse
              </button>
            )}
            <span style={{ color: "rgba(255,255,255,0.6)", fontSize: 13 }}>{user.name}</span>
            <span style={{
              background: ROLE_COLORS[user.role] || "#555",
              color: "white", fontSize: 10, fontWeight: 700,
              padding: "2px 8px", borderRadius: 20, textTransform: "uppercase", letterSpacing: 0.5,
            }}>{user.role}</span>
            <button onClick={handleLogout} style={{
              background: "transparent", border: "1px solid rgba(255,255,255,0.2)",
              borderRadius: 8, color: "white", cursor: "pointer", padding: "4px 8px",
              display: "flex", alignItems: "center", gap: 4,
            }}>
              <LogOut size={14} />
            </button>
          </div>
        )}
      </nav>
      <div style={{ padding: "16px", maxWidth: 1100, margin: "0 auto" }}>
        {children}
      </div>
    </div>
  );
}

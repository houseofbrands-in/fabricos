import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth, roleHome } from "../context/AuthContext";
import { LogOut, Scissors, LayoutDashboard, Package, Warehouse as WarehouseIcon, Calculator, FileText, Truck, Menu, X } from "lucide-react";

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

// Module buttons in the top bar, and which roles see each one.
const NAV_ITEMS = [
  { path: "/admin", label: "Admin", Icon: LayoutDashboard, roles: ["admin"] },
  { path: "/store", label: "Fabric", Icon: Package, roles: ["admin"] },
  { path: "/warehouse", label: "Warehouse", Icon: WarehouseIcon, roles: ["admin"] },
  { path: "/dispatch", label: "Dispatch", Icon: Truck, roles: ["admin", "warehouse"] },
  { path: "/orders", label: "Orders", Icon: FileText, roles: ["admin", "designer"] },
  { path: "/quotations", label: "Quotations", Icon: Calculator, roles: ["admin", "designer"] },
];

const MOBILE_MAX = 700;   // phone width and below → compact top bar with a ☰ Menu

function useIsPhone() {
  const [isPhone, setIsPhone] = useState(() => window.innerWidth <= MOBILE_MAX);
  useEffect(() => {
    const onResize = () => setIsPhone(window.innerWidth <= MOBILE_MAX);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  return isPhone;
}

export default function Layout({ children }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const isPhone = useIsPhone();
  const [menuOpen, setMenuOpen] = useState(false);

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  const items = user ? NAV_ITEMS.filter(i => i.roles.includes(user.role)) : [];
  const go = (path) => { setMenuOpen(false); navigate(path); };

  return (
    <div style={{ minHeight: "100vh", background: "#f8f9fc", fontFamily: "'Segoe UI', system-ui, sans-serif" }}>
      <nav style={{
        background: "#1a1a2e", padding: isPhone ? "0 12px" : "0 16px", height: 56,
        display: "flex", alignItems: "center", justifyContent: "space-between",
        boxShadow: "0 2px 12px rgba(0,0,0,0.2)", position: "sticky", top: 0, zIndex: 100,
      }}>
        <div onClick={() => go(user ? roleHome(user.role) : "/login")}
          style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", flexShrink: 0 }}>
          <Scissors size={20} color="#e94560" />
          <span style={{ color: "white", fontWeight: 900, fontSize: 18, letterSpacing: -0.5 }}>
            Fabric<span style={{ color: "#e94560" }}>OS</span>
          </span>
        </div>
        {user && (
          <div style={{ display: "flex", alignItems: "center", gap: isPhone ? 8 : 10, minWidth: 0 }}>
            {!isPhone && items.map(({ path, label, Icon }) => (
              <button key={path} onClick={() => navigate(path)} style={{
                background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.2)",
                borderRadius: 8, color: "white", cursor: "pointer", padding: "4px 10px",
                display: "flex", alignItems: "center", gap: 5, fontSize: 12, fontWeight: 600,
              }}>
                <Icon size={13} /> {label}
              </button>
            ))}
            {isPhone && items.length > 0 && (
              <button onClick={() => setMenuOpen(o => !o)} style={{
                background: menuOpen ? "white" : "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.2)",
                borderRadius: 8, color: menuOpen ? "#1a1a2e" : "white", cursor: "pointer", padding: "6px 10px",
                display: "flex", alignItems: "center", gap: 5, fontSize: 13, fontWeight: 700,
              }}>
                {menuOpen ? <X size={15} /> : <Menu size={15} />} Menu
              </button>
            )}
            <span style={{ color: "rgba(255,255,255,0.6)", fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: isPhone ? 80 : "none" }}>{user.name}</span>
            {!isPhone && (
              <span style={{
                background: ROLE_COLORS[user.role] || "#555",
                color: "white", fontSize: 10, fontWeight: 700,
                padding: "2px 8px", borderRadius: 20, textTransform: "uppercase", letterSpacing: 0.5,
              }}>{user.role}</span>
            )}
            <button onClick={handleLogout} style={{
              background: "transparent", border: "1px solid rgba(255,255,255,0.2)",
              borderRadius: 8, color: "white", cursor: "pointer", padding: isPhone ? "6px 8px" : "4px 8px",
              display: "flex", alignItems: "center", gap: 4, flexShrink: 0,
            }}>
              <LogOut size={14} />
            </button>
          </div>
        )}
      </nav>
      {isPhone && menuOpen && user && (
        <>
          <div onClick={() => setMenuOpen(false)} style={{ position: "fixed", inset: 0, top: 56, background: "rgba(0,0,0,0.3)", zIndex: 98 }} />
          <div style={{ position: "fixed", top: 56, left: 0, right: 0, background: "white", zIndex: 99, boxShadow: "0 8px 24px rgba(0,0,0,0.15)", borderBottomLeftRadius: 14, borderBottomRightRadius: 14, overflow: "hidden" }}>
            <div style={{ padding: "10px 16px", fontSize: 12, color: "#6c757d", borderBottom: "1px solid #f0f0f0", display: "flex", alignItems: "center", gap: 8 }}>
              Logged in as <b style={{ color: "#1a1a2e" }}>{user.name}</b>
              <span style={{ background: ROLE_COLORS[user.role] || "#555", color: "white", fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 20, textTransform: "uppercase" }}>{user.role}</span>
            </div>
            {items.map(({ path, label, Icon }) => (
              <button key={path} onClick={() => go(path)} style={{
                display: "flex", alignItems: "center", gap: 12, width: "100%", background: "white",
                border: "none", borderBottom: "1px solid #f6f6f6", padding: "14px 18px",
                fontSize: 15, fontWeight: 700, color: "#1a1a2e", cursor: "pointer", textAlign: "left",
              }}>
                <Icon size={18} color="#e94560" /> {label}
              </button>
            ))}
          </div>
        </>
      )}
      <div style={{ padding: isPhone ? "12px" : "16px", maxWidth: 1100, margin: "0 auto" }}>
        {children}
      </div>
    </div>
  );
}

import { createContext, useContext, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try {
      const u = localStorage.getItem("fabricos_user");
      return u ? JSON.parse(u) : null;
    } catch {
      return null;
    }
  });

  const login = useCallback((token, userData) => {
    localStorage.setItem("fabricos_token", token);
    localStorage.setItem("fabricos_user", JSON.stringify(userData));
    setUser(userData);
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem("fabricos_token");
    localStorage.removeItem("fabricos_user");
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}

export function roleHome(role) {
  const map = {
    admin: "/admin",
    designer: "/designer",
    cutting: "/cutting",
    tailor: "/tailor",
    qc: "/qc",
    ironing: "/ironing",
    packing: "/packing",
    store: "/store",
  };
  return map[role] || "/login";
}

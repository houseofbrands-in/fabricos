import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth, roleHome } from "./context/AuthContext";
import Login from "./pages/Login";
import Designer from "./pages/Designer";
import Cutting from "./pages/Cutting";
import Tailor from "./pages/Tailor";
import QC from "./pages/QC";
import Admin from "./pages/Admin";
import Ironing from "./pages/Ironing";
import Packing from "./pages/Packing";
import Store from "./pages/Store";
import Warehouse from "./pages/Warehouse";

function PrivateRoute({ element, allowed }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (allowed && !allowed.includes(user.role)) return <Navigate to={roleHome(user.role)} replace />;
  return element;
}

function RootRedirect() {
  const { user } = useAuth();
  if (user) return <Navigate to={roleHome(user.role)} replace />;
  return <Navigate to="/login" replace />;
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<RootRedirect />} />
          <Route path="/login" element={<Login />} />
          <Route path="/designer" element={<PrivateRoute element={<Designer />} allowed={["designer", "admin"]} />} />
          <Route path="/cutting"  element={<PrivateRoute element={<Cutting />}  allowed={["cutting", "admin"]} />} />
          <Route path="/tailor"   element={<PrivateRoute element={<Tailor />}   allowed={["tailor"]} />} />
          <Route path="/qc"       element={<PrivateRoute element={<QC />}       allowed={["qc", "admin"]} />} />
          <Route path="/ironing"  element={<PrivateRoute element={<Ironing />}  allowed={["ironing", "admin"]} />} />
          <Route path="/packing"  element={<PrivateRoute element={<Packing />}  allowed={["packing", "admin"]} />} />
          <Route path="/store"    element={<PrivateRoute element={<Store />}    allowed={["store", "admin"]} />} />
          <Route path="/warehouse" element={<PrivateRoute element={<Warehouse />} allowed={["warehouse", "admin"]} />} />
          <Route path="/admin"    element={<PrivateRoute element={<Admin />}    allowed={["admin"]} />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

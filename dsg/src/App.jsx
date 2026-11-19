import { Route, Routes } from "react-router-dom";
import Navbar from "./components/Navbar.jsx";
import ProtectedRoute from "./components/ProtectedRoute.jsx";
import AdminRoute from "./components/AdminRoute.jsx";
import Home from "./pages/Home.jsx";
import Login from "./pages/Login.jsx";
import AuthCallback from "./pages/AuthCallback.jsx";
import MyLibrary from "./pages/MyLibrary.jsx";
import AdminLayout from "./pages/admin/AdminLayout.jsx";
import AdminDashboard from "./pages/admin/AdminDashboard.jsx";
import AdminTable from "./pages/admin/AdminTable.jsx";

export default function App() {
  return (
    <>
      <Navbar />
      <main className="shell">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/login" element={<Login />} />
          {/* NEW: finishes SSO by exchanging the one-time code. */}
          <Route path="/auth/callback" element={<AuthCallback />} />
          <Route path="/my-library" element={<ProtectedRoute><MyLibrary /></ProtectedRoute>} />
          <Route path="/admin" element={<AdminRoute><AdminLayout /></AdminRoute>}>
            <Route index element={<AdminDashboard />} />
            <Route path="orders" element={<AdminTable page="orders" />} />
            <Route path="coupons" element={<AdminTable page="coupons" />} />
            <Route path="users" element={<AdminTable page="users" />} />
          </Route>
          <Route path="*" element={<section className="card"><h1>Page not found</h1></section>} />
        </Routes>
      </main>
    </>
  );
}

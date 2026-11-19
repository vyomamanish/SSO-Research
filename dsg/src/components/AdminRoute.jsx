import ProtectedRoute from "./ProtectedRoute.jsx";
import { useAuth } from "../context/AuthContext.jsx";

export default function AdminRoute({ children }) {
  const { user } = useAuth();
  return (
    <ProtectedRoute>
      {user?.isAdmin ? (
        children
      ) : (
        <section className="card denied">
          <p className="eyebrow">Access denied</p>
          <h1>Staff only</h1>
          <p className="muted">Admin needs the dsg-staff or dsg-super-admin group in Vyoma SSO.</p>
        </section>
      )}
    </ProtectedRoute>
  );
}

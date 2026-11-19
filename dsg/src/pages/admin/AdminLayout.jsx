import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../../context/AuthContext.jsx";

const PAGES = [
  { key: "dashboard", to: "/admin", label: "Dashboard" },
  { key: "orders", to: "/admin/orders", label: "Orders" },
  { key: "coupons", to: "/admin/coupons", label: "Coupons" },
  { key: "users", to: "/admin/users", label: "Users" },
];

export default function AdminLayout() {
  const { user } = useAuth();
  // UX hint only: the API decides, and returns 403 for pages you can't open.
  const allowed = (key) => user.adminLevel === 1 || user.allowedPages.includes(key);

  return (
    <div className="admin">
      <aside className="card side">
        <p className="eyebrow">{user.adminRole}</p>
        {PAGES.map((page) => (
          <NavLink key={page.key} to={page.to} end className={({ isActive }) => `side-link ${isActive ? "active" : ""} ${allowed(page.key) ? "" : "restricted"}`}>
            {page.label}
            {allowed(page.key) ? "" : " 🔒"}
          </NavLink>
        ))}
      </aside>
      <div className="admin-main">
        <Outlet />
      </div>
    </div>
  );
}

import { useAuth } from "../../context/AuthContext.jsx";

export default function AdminDashboard() {
  const { user } = useAuth();
  const pages = user.adminLevel === 1 ? "every page" : user.allowedPages.join(", ");

  return (
    <section className="card">
      <p className="eyebrow">Admin dashboard</p>
      <h1>Hello, {user.name}</h1>
      <dl className="facts">
        <dt>Role</dt>
        <dd>{user.adminRole}</dd>
        <dt>Level</dt>
        <dd>{user.adminLevel === 1 ? "1 (Super Admin)" : "2 (Staff)"}</dd>
        <dt>Pages</dt>
        <dd>{pages}</dd>
      </dl>
      <p className="muted">These come from your Vyoma SSO groups and are refreshed every time you sign in.</p>
    </section>
  );
}

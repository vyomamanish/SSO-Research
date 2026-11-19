import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";

export default function Home() {
  const { user, loading, loginWithSso } = useAuth();
  if (loading) return <p className="muted">Loading…</p>;

  return (
    <section className="hero">
      <p className="eyebrow">{user ? `Namaste, ${user.name}` : "Learn Sanskrit, step by step"}</p>
      <h1>Digital Sanskrit Guru</h1>
      <p className="muted">
        {user
          ? "You're signed in with your Vyoma account. Your orders and library are kept by DSG."
          : "Courses, books and practice material, with one Vyoma account for every Vyoma app."}
      </p>
      <div className="actions">
        {user ? (
          <>
            <Link className="button primary" to="/my-library">
              My library
            </Link>
            {user.isAdmin && (
              <Link className="button" to="/admin">
                Admin
              </Link>
            )}
          </>
        ) : (
          <button className="button primary" onClick={() => loginWithSso("/")}>
            Continue with Vyoma account
          </button>
        )}
      </div>
    </section>
  );
}

import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";

const OTT_URL = "http://localhost:3000";

export default function Navbar() {
  const { user, logout } = useAuth();

  return (
    <header className="nav">
      <Link to="/" className="logo">
        Digital <span>Sanskrit</span> Guru
      </Link>
      <nav>
        {user ? (
          <>
            <Link to="/my-library">{user.name}</Link>
            {user.isAdmin && <span className="badge">{user.adminRole}</span>}
            {user.isAdmin && <Link to="/admin">Admin</Link>}
            <a href={OTT_URL}>Open OTT</a>
            <button className="link-button" onClick={logout}>
              Log out
            </button>
          </>
        ) : (
          <Link to="/login" className="button primary small">
            Sign in
          </Link>
        )}
      </nav>
    </header>
  );
}

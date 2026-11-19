// dsg-sso.md 6.1: reads ?code=, exchanges it, then goes to returnTo.
import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";

// The code works once. React StrictMode runs effects twice in development, so
// share one exchange per code instead of sending it twice.
const exchanges = new Map();

function safeReturnTo(value) {
  return value && value.startsWith("/") && !value.startsWith("//") ? value : "/";
}

export default function AuthCallback() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { completeSso } = useAuth();
  const [error, setError] = useState("");

  useEffect(() => {
    const code = params.get("code");
    if (!code) {
      setError("This sign-in link is incomplete.");
      return;
    }
    if (!exchanges.has(code)) exchanges.set(code, completeSso(code));
    exchanges
      .get(code)
      .then(() => navigate(safeReturnTo(params.get("returnTo")), { replace: true }))
      .catch(() => setError("This sign-in link has expired. Please sign in again."));
  }, [params, completeSso, navigate]);

  return (
    <section className="card narrow">
      {error ? (
        <>
          <h1>Sign-in didn&apos;t finish</h1>
          <p className="alert">{error}</p>
          <Link className="button" to="/login">
            Back to sign in
          </Link>
        </>
      ) : (
        <p className="muted">Signing you in…</p>
      )}
    </section>
  );
}

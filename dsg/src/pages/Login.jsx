import { Navigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";

const MESSAGES = {
  unavailable: "Vyoma SSO isn't reachable right now. Try again in a moment.",
  expired: "That sign-in attempt expired. Please try again.",
  error: "Sign-in couldn't be completed. Please try again.",
  unverified: "Verify your email in your Vyoma account first.",
  conflict: "This email is already linked to a different Vyoma account. Contact support.",
  admin_takeover: "This email belongs to a staff account. Sign in with your staff Vyoma account.",
  inactive: "This account is no longer active.",
};

export default function Login() {
  const { user, loginWithSso } = useAuth();
  const [params] = useSearchParams();
  const returnTo = params.get("returnTo") || "/";
  const sso = params.get("sso");

  if (user) return <Navigate to={returnTo} replace />;

  return (
    <section className="card narrow">
      <p className="eyebrow">Digital Sanskrit Guru</p>
      <h1>Sign in</h1>
      <p className="muted">Use the same Vyoma account as Vyoma OTT and the intranet.</p>
      {sso && <p className="alert">{MESSAGES[sso] ?? "Sign-in failed. Please try again."}</p>}
      <button className="button primary wide" onClick={() => loginWithSso(returnTo)}>
        Continue with Vyoma account
      </button>
      <p className="hint">New here? You can create a Vyoma account on the next page.</p>
    </section>
  );
}

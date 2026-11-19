import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { safeReturnTo } from "@/lib/oidc";

export const metadata = { title: "Sign in · Vyoma OTT" };

const ERRORS: Record<string, string> = {
  sso_unavailable: "Vyoma SSO isn't reachable right now. Try again in a moment.",
  invalid_state: "That sign-in link expired. Please try again.",
  token_exchange_failed: "Sign-in couldn't be completed. Please try again.",
  access_denied: "You declined access, so you weren't signed in.",
  email_unverified: "Verify your email in your Vyoma account before linking it to OTT.",
  account_conflict: "This email is already linked to a different Vyoma account. Contact support.",
  missing_email: "Your Vyoma account has no email address.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ redirect?: string; error?: string }>;
}) {
  const { redirect: target, error } = await searchParams;
  const returnTo = safeReturnTo(target);
  if (await getCurrentUser()) redirect(returnTo);

  return (
    <section className="card narrow">
      <p className="eyebrow">Vyoma OTT</p>
      <h1>Sign in</h1>
      <p className="muted">One Vyoma account works across OTT, Digital Sanskrit Guru and the intranet.</p>
      {error && <p className="alert">{ERRORS[error] ?? "Sign-in failed. Please try again."}</p>}
      <a className="button primary wide" href={`/api/auth/login?redirect=${encodeURIComponent(returnTo)}`}>
        Sign in with Vyoma SSO
      </a>
      <p className="hint">Passwords, MFA and password resets are handled on the Vyoma account page.</p>
    </section>
  );
}

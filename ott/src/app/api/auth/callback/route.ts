// OIDC callback (ott-sso.md 10.1 C): exchange the code, verify the ID token,
// link or create the OTT user, then seal the `vyoma_session` cookie.
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { verifyAuthentikToken } from "@/lib/auth";
import { APP_URL, client, getOidcConfig, safeReturnTo } from "@/lib/oidc";
import { SESSION_COOKIE, sealSession, sessionCookieOptions } from "@/lib/session";

const VALID_ROLES = ["USER", "SUPER_ADMIN", "ADMIN", "MANAGER", "FINANCE"];

function fail(reason: string) {
  const response = NextResponse.redirect(new URL(`/login?error=${reason}`, APP_URL));
  clearFlowCookies(response);
  return response;
}

function clearFlowCookies(response: NextResponse) {
  for (const name of ["oidc_state", "oidc_code_verifier", "oidc_nonce", "oidc_return_to"]) {
    response.cookies.set(name, "", { path: "/api/auth", maxAge: 0 });
  }
}

export async function GET(request: NextRequest) {
  const state = request.cookies.get("oidc_state")?.value;
  const codeVerifier = request.cookies.get("oidc_code_verifier")?.value;
  const nonce = request.cookies.get("oidc_nonce")?.value;
  const returnTo = safeReturnTo(request.cookies.get("oidc_return_to")?.value);
  if (!state || !codeVerifier || !nonce) return fail("invalid_state");

  // 1-2. Check state, exchange the code with PKCE, check the nonce.
  let claims;
  let idToken: string;
  try {
    const config = await getOidcConfig();
    const currentUrl = new URL(request.nextUrl.pathname + request.nextUrl.search, APP_URL);
    const tokens = await client.authorizationCodeGrant(config, currentUrl, {
      pkceCodeVerifier: codeVerifier,
      expectedState: state,
      expectedNonce: nonce,
      idTokenExpected: true,
    });
    idToken = tokens.id_token!;
    // openid-client doesn't check the ID token signature for this flow, so the
    // plan's JWKS check is done explicitly.
    claims = await verifyAuthentikToken(idToken);
  } catch (error) {
    console.error("[SSO] callback failed:", (error as Error).message);
    return fail(request.nextUrl.searchParams.get("error") === "access_denied" ? "access_denied" : "token_exchange_failed");
  }

  const authentikId = claims.sub!;
  const email = String(claims.email ?? "").toLowerCase();
  const name = (claims.name as string | undefined) || email.split("@")[0];
  const emailVerified = claims.email_verified === true;
  // Authentik is the source of truth for staff roles (ott-sso.md 5.1).
  const role = VALID_ROLES.includes(claims.role as string) ? (claims.role as string) : "USER";
  if (!email) return fail("missing_email");

  // 3. Link or create (ott-sso.md 11): by authentikId, then by verified email.
  let user = await prisma.user.findUnique({ where: { authentikId } });
  if (!user) {
    const byEmail = await prisma.user.findUnique({ where: { email } });
    if (byEmail) {
      // Change from the plan: only link on a verified email, so an unverified
      // Authentik account can't take over an existing OTT record.
      if (!emailVerified) return fail("email_unverified");
      if (byEmail.authentikId && byEmail.authentikId !== authentikId) return fail("account_conflict");
      user = byEmail;
    }
  }

  if (user) {
    // Change from the plan: the role is always overwritten, not only raised, so
    // removing someone from a staff group in Authentik also demotes them here.
    user = await prisma.user.update({ where: { id: user.id }, data: { authentikId, role } });
  } else {
    user = await prisma.user.create({ data: { authentikId, email, name, role, plan: "FREE" } });
  }

  // 4. Seal the local session.
  const sealed = await sealSession({
    userId: user.id,
    authentikId,
    email: user.email,
    role: user.role,
    sid: claims.sid as string | undefined,
    idToken,
  });

  // 5. Clean up the one-time OIDC cookies.
  const response = NextResponse.redirect(new URL(returnTo, APP_URL));
  clearFlowCookies(response);
  response.cookies.set(SESSION_COOKIE, sealed, sessionCookieOptions);
  return response;
}

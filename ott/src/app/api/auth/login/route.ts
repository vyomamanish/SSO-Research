// Starts SSO: PKCE + state + nonce, then redirect to Authentik (ott-sso.md 3.2).
import { NextRequest, NextResponse } from "next/server";
import { REDIRECT_URI, SCOPES, client, getOidcConfig, safeReturnTo } from "@/lib/oidc";

const flowCookie = { httpOnly: true, sameSite: "lax" as const, path: "/api/auth", maxAge: 300 };

export async function GET(request: NextRequest) {
  let config;
  try {
    config = await getOidcConfig();
  } catch {
    return NextResponse.redirect(new URL("/login?error=sso_unavailable", request.url));
  }

  const codeVerifier = client.randomPKCECodeVerifier();
  const state = client.randomState();
  const nonce = client.randomNonce();
  const authorizationUrl = client.buildAuthorizationUrl(config, {
    redirect_uri: REDIRECT_URI,
    scope: SCOPES,
    code_challenge: await client.calculatePKCECodeChallenge(codeVerifier),
    code_challenge_method: "S256",
    state,
    nonce,
  });

  const response = NextResponse.redirect(authorizationUrl);
  response.cookies.set("oidc_state", state, flowCookie);
  response.cookies.set("oidc_code_verifier", codeVerifier, flowCookie);
  response.cookies.set("oidc_nonce", nonce, flowCookie);
  response.cookies.set("oidc_return_to", safeReturnTo(request.nextUrl.searchParams.get("redirect")), flowCookie);
  return response;
}

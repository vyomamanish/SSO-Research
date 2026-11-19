// OIDC client for Authentik, using openid-client (ott-sso.md 4.1, approach 2).
import * as client from "openid-client";

export const ISSUER = process.env.AUTHENTIK_ISSUER!; // must end in a slash
export const CLIENT_ID = process.env.AUTHENTIK_CLIENT_ID!;
export const APP_URL = process.env.NEXT_PUBLIC_APP_URL!;
export const REDIRECT_URI = `${APP_URL}/api/auth/callback`;
export const POST_LOGOUT_REDIRECT_URI = `${APP_URL}/login`;
// `vyoma_roles` is the custom scope that adds the `role` claim.
export const SCOPES = "openid email profile vyoma_roles";

let configPromise: Promise<client.Configuration> | undefined;

/** Reads Authentik's discovery document once and caches it. */
export function getOidcConfig() {
  configPromise ??= client
    .discovery(
      new URL(ISSUER),
      CLIENT_ID,
      process.env.AUTHENTIK_CLIENT_SECRET,
      undefined,
      // Plain HTTP is only allowed for a local Authentik.
      ISSUER.startsWith("http://localhost") ? { execute: [client.allowInsecureRequests] } : undefined,
    )
    .catch((error) => {
      configPromise = undefined; // retry on the next request
      throw error;
    });
  return configPromise;
}

/** Only same-site relative paths, so `redirect` can't be an open redirect. */
export function safeReturnTo(value: string | null | undefined) {
  return value && value.startsWith("/") && !value.startsWith("//") ? value : "/";
}

export { client };

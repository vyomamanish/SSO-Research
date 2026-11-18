import { createRemoteJWKSet, jwtVerify } from "jose";
import { revokeSession } from "@/lib/revoked-sessions";

const LOGOUT_EVENT = "http://schemas.openid.net/event/backchannel-logout";

const issuer = process.env.AUTH_AUTHENTIK_ISSUER!;
const jwks = createRemoteJWKSet(new URL("jwks/", issuer));

// Authentik calls this server-to-server when a user's SSO session ends, so this
// app logs out even if the logout started in a different app.
export async function POST(request: Request) {
  const form = await request.formData().catch(() => null);
  const logoutToken = form?.get("logout_token");
  if (typeof logoutToken !== "string") {
    return new Response("missing logout_token", { status: 400 });
  }

  try {
    const { payload } = await jwtVerify(logoutToken, jwks, {
      issuer,
      audience: process.env.AUTH_AUTHENTIK_ID,
      typ: "logout+jwt",
    });
    const events = payload.events as Record<string, unknown> | undefined;
    if (!events?.[LOGOUT_EVENT] || typeof payload.sid !== "string") {
      return new Response("invalid logout_token", { status: 400 });
    }
    revokeSession(payload.sid);
  } catch {
    return new Response("invalid logout_token", { status: 400 });
  }

  return new Response(null, { status: 200 });
}

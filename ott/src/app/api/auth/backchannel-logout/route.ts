// Back-channel logout (ott-sso.md 4.4): Authentik calls this server-to-server
// when an SSO session ends, for example after logging out of DSG.
import { createRemoteJWKSet, jwtVerify } from "jose";
import prisma from "@/lib/prisma";
import { CLIENT_ID, ISSUER } from "@/lib/oidc";

const LOGOUT_EVENT = "http://schemas.openid.net/event/backchannel-logout";
const JWKS = createRemoteJWKSet(new URL("jwks/", ISSUER));

export async function POST(request: Request) {
  const form = await request.formData().catch(() => null);
  const logoutToken = form?.get("logout_token");
  if (typeof logoutToken !== "string") return new Response("missing logout_token", { status: 400 });

  try {
    const { payload } = await jwtVerify(logoutToken, JWKS, {
      issuer: ISSUER,
      audience: CLIENT_ID,
      algorithms: ["RS256"],
      typ: "logout+jwt",
    });
    const events = payload.events as Record<string, unknown> | undefined;
    if (!events?.[LOGOUT_EVENT] || typeof payload.sid !== "string") {
      return new Response("invalid logout_token", { status: 400 });
    }
    await prisma.sessionRevocation.upsert({ where: { sid: payload.sid }, create: { sid: payload.sid }, update: {} });
  } catch {
    return new Response("invalid logout_token", { status: 400 });
  }
  return new Response(null, { status: 200 });
}

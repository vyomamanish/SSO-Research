// The new auth engine (ott-sso.md 10.1 B): verifies Authentik tokens and
// resolves the signed-in user from the `vyoma_session` cookie.
import { cookies } from "next/headers";
import { createRemoteJWKSet, jwtVerify } from "jose";
import prisma from "@/lib/prisma";
import { CLIENT_ID, ISSUER } from "@/lib/oidc";
import { SESSION_COOKIE, openSession, type SessionPayload } from "@/lib/session";

// Cached in memory; refetched when Authentik rotates to an unknown key id.
const JWKS = createRemoteJWKSet(new URL("jwks/", ISSUER));

/** Checks signature, issuer, audience and expiry of an Authentik JWT. */
export async function verifyAuthentikToken(token: string) {
  const { payload } = await jwtVerify(token, JWKS, {
    issuer: ISSUER,
    audience: CLIENT_ID,
    algorithms: ["RS256"],
  });
  return payload;
}

/** The session, unless it was revoked by logout or back-channel logout. */
export async function getSession(): Promise<SessionPayload | null> {
  const cookieStore = await cookies();
  const session = await openSession(cookieStore.get(SESSION_COOKIE)?.value);
  if (!session) return null;
  if (session.sid) {
    const revoked = await prisma.sessionRevocation.findUnique({ where: { sid: session.sid } });
    if (revoked) return null;
  }
  return session;
}

/** The OTT user record. Plan and purchases come from OTT's database. */
export async function getCurrentUser() {
  const session = await getSession();
  if (!session) return null;

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    include: {
      purchases: { include: { course: true }, orderBy: { createdAt: "desc" } },
      progress: { include: { course: true } },
    },
  });
  if (!user) return null;

  // Active subscription enforcement, unchanged from the current app.
  if (user.plan !== "FREE" && user.planExpiresAt && Date.now() > user.planExpiresAt.getTime()) {
    await prisma.user.update({
      where: { id: user.id },
      data: { plan: "FREE", planInterval: null, planStartedAt: null, planExpiresAt: null },
    });
    user.plan = "FREE";
  }

  return user;
}

export type CurrentUser = NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>;

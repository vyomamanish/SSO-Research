// The `vyoma_session` cookie (ott-sso.md 4.3): an encrypted, HttpOnly JWT that
// replaces the old plaintext `user_email` cookie. No database or Node-only
// imports, so src/proxy.ts can use it too.
import { EncryptJWT, jwtDecrypt } from "jose";

export const SESSION_COOKIE = "vyoma_session";
export const SESSION_MAX_AGE = 60 * 60 * 24 * 7; // 7 days, as in the plan

export interface SessionPayload {
  userId: string;
  authentikId: string;
  email: string;
  role: string;
  /** Authentik's session id, used to match back-channel logout tokens. */
  sid?: string;
  /** Sent back to Authentik as id_token_hint at logout. */
  idToken?: string;
}

let keyPromise: Promise<Uint8Array> | undefined;
function sessionKey() {
  // A256GCM needs exactly 32 bytes, so derive them from SESSION_SECRET.
  keyPromise ??= crypto.subtle
    .digest("SHA-256", new TextEncoder().encode(process.env.SESSION_SECRET))
    .then((digest) => new Uint8Array(digest));
  return keyPromise;
}

export async function sealSession(payload: SessionPayload) {
  return new EncryptJWT({ ...payload })
    .setProtectedHeader({ alg: "dir", enc: "A256GCM" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_MAX_AGE}s`)
    .encrypt(await sessionKey());
}

/** Returns the payload, or null if the cookie is missing, tampered or expired. */
export async function openSession(token: string | undefined): Promise<SessionPayload | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtDecrypt(token, await sessionKey());
    return payload as unknown as SessionPayload;
  } catch {
    return null;
  }
}

export const sessionCookieOptions = {
  httpOnly: true,
  // Secure only over HTTPS. Some browsers drop Secure cookies on http://localhost.
  secure: (process.env.NEXT_PUBLIC_APP_URL ?? "").startsWith("https:"),
  sameSite: "lax" as const,
  path: "/",
  maxAge: SESSION_MAX_AGE,
};

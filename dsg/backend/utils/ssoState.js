// The short-lived login state cookie (dsg-sso.md 6.1): state, nonce, PKCE
// verifier and returnTo, signed with HMAC so it can't be altered.
const crypto = require("node:crypto");

const COOKIE_NAME = "dsg_oidc_state";
const MAX_AGE_SECONDS = 300;

function sign(data, secret) {
  return crypto.createHmac("sha256", secret).update(data).digest("base64url");
}

function encodeState(payload, secret, now = Date.now()) {
  const data = Buffer.from(JSON.stringify({ ...payload, exp: now + MAX_AGE_SECONDS * 1000 })).toString("base64url");
  return `${data}.${sign(data, secret)}`;
}

/** Returns the payload, or null if missing, tampered or expired. */
function decodeState(value, secret, now = Date.now()) {
  if (typeof value !== "string" || !value.includes(".")) return null;
  const [data, signature] = value.split(".");
  const expected = sign(data, secret);
  if (!signature || signature.length !== expected.length) return null;
  if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;
  try {
    const payload = JSON.parse(Buffer.from(data, "base64url").toString("utf8"));
    return payload.exp > now ? payload : null;
  } catch {
    return null;
  }
}

/** Only same-site relative paths, so returnTo can't be an open redirect. */
function safeReturnTo(value) {
  return typeof value === "string" && value.startsWith("/") && !value.startsWith("//") && !value.includes("\\")
    ? value
    : "/";
}

function cookieOptions(secure) {
  return { httpOnly: true, secure, sameSite: "lax", path: "/api/auth/oidc", maxAge: MAX_AGE_SECONDS * 1000 };
}

module.exports = { COOKIE_NAME, encodeState, decodeState, safeReturnTo, cookieOptions };

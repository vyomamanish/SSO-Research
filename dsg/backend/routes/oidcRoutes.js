// SSO routes, mounted at /api/auth/oidc (dsg-sso.md 4.1 and 6.1).
const crypto = require("node:crypto");
const express = require("express");
const User = require("../models/User");
const SsoLoginCode = require("../models/SsoLoginCode");
const AdminAuditLog = require("../models/AdminAuditLog");
const adminPages = require("../config/adminPages.json");
const { protect } = require("../middleware/authMiddleware");
const { buildAuthUrl, handleCallback, endSessionUrl, verifyAuthentikJwt } = require("../services/oidcClient");
const { COOKIE_NAME, encodeState, decodeState, safeReturnTo, cookieOptions } = require("../utils/ssoState");
const { rolesFromClaims } = require("../utils/ssoRoles");
const { decideLink } = require("../utils/ssoLinking");
const { issueSessionToken } = require("../utils/sessionToken");
const { profile } = require("./authRoutes");

const router = express.Router();
const secureCookies = () => (process.env.OIDC_REDIRECT_BASE || "").startsWith("https:");
const hash = (value) => crypto.createHash("sha256").update(value).digest("hex");
const rolesClaim = () => process.env.OIDC_ROLES_CLAIM || "dsg_roles";

async function audit(action, user, detail) {
  await AdminAuditLog.create({
    action,
    entityType: "user",
    entityId: user ? String(user._id) : undefined,
    entityLabel: user?.email ?? detail?.email,
    detail,
  });
}

// 1. Start login: remember state, nonce and PKCE verifier in a signed cookie.
router.get("/login", async (req, res) => {
  try {
    const { url, state, nonce, codeVerifier } = await buildAuthUrl();
    const returnTo = safeReturnTo(req.query.returnTo);
    res.cookie(COOKIE_NAME, encodeState({ state, nonce, codeVerifier, returnTo }, process.env.OIDC_STATE_SECRET), cookieOptions(secureCookies()));
    res.redirect(url.href);
  } catch (error) {
    console.error("[SSO] login failed:", error.message);
    res.redirect("/login?sso=unavailable");
  }
});

// 2. Callback: verify, link or create the DSG user, then hand the SPA a one-time code.
router.get("/callback", async (req, res) => {
  const st = decodeState(req.cookies[COOKIE_NAME], process.env.OIDC_STATE_SECRET);
  res.clearCookie(COOKIE_NAME, { path: "/api/auth/oidc" });
  if (!st) return res.redirect("/login?sso=expired");

  let claims;
  let tokens;
  try {
    const currentUrl = new URL(req.originalUrl, process.env.OIDC_REDIRECT_BASE);
    ({ claims, tokens } = await handleCallback(currentUrl, st));
  } catch (error) {
    console.error("[SSO] callback failed:", error.message);
    return res.redirect("/login?sso=error");
  }

  if (claims.email_verified !== true) return res.redirect("/login?sso=unverified");

  const email = String(claims.email).toLowerCase();
  const [bySub, byEmail] = await Promise.all([
    User.findOne({ authentikSub: claims.sub }),
    User.findOne({ email, isDeleted: { $ne: true } }),
  ]);
  const decision = decideLink(claims, { bySub, byEmail }, rolesClaim());
  if (decision.action === "refuse") {
    await audit("sso-link-refused", byEmail, { email, reason: decision.reason });
    return res.redirect(`/login?sso=${decision.reason}`);
  }

  // Authentik is the source of truth for roles: overwrite them at every login.
  const roles = rolesFromClaims(claims[rolesClaim()], adminPages);
  const user = decision.user ?? new User({ email, authSource: "authentik", hasLocalPassword: false });
  const firstLink = !user.authentikSub;
  Object.assign(user, roles, {
    authentikSub: claims.sub,
    name: claims.name || user.name,
    ssoIdToken: tokens.id_token,
    lastLoginAt: new Date(),
  });
  if (firstLink) user.ssoLinkedAt = new Date();
  await user.save();

  if (user.isBlocked || user.isDeleted) return res.redirect("/login?sso=inactive");
  await audit(firstLink ? "sso-link" : "sso-login", user, { created: decision.action === "create" });

  // Phase 1: a 60 s, single-use code. The DSG token never appears in the URL.
  const code = crypto.randomBytes(32).toString("base64url");
  await SsoLoginCode.create({ codeHash: hash(code), userId: user._id, expiresAt: new Date(Date.now() + 60_000) });
  res.redirect(`/auth/callback?code=${encodeURIComponent(code)}&returnTo=${encodeURIComponent(st.returnTo)}`);
});

// 3. The SPA swaps the code for the same DSG token as today.
router.post("/exchange", async (req, res) => {
  const code = req.body?.code;
  if (typeof code !== "string") return res.status(400).json({ message: "Missing code" });
  // findOneAndDelete makes the code single use.
  const entry = await SsoLoginCode.findOneAndDelete({ codeHash: hash(code), expiresAt: { $gt: new Date() } });
  if (!entry) return res.status(400).json({ message: "This sign-in link has expired" });

  const user = await User.findById(entry.userId);
  if (!user || user.isBlocked || user.isDeleted) return res.status(401).json({ message: "Account unavailable" });
  res.json({ token: issueSessionToken(user), user: profile(user) });
});

// 4. Logout: end every DSG session, then send the browser to Authentik.
router.post("/logout", protect, async (req, res) => {
  const user = await User.findById(req.user).select("+ssoIdToken");
  const idToken = user.ssoIdToken;
  user.tokenVersion += 1;
  user.ssoIdToken = undefined;
  await user.save();
  await audit("sso-logout", user);

  let url = process.env.OIDC_POST_LOGOUT_REDIRECT_URI;
  try {
    url = await endSessionUrl(idToken);
  } catch {
    // Authentik unreachable: the DSG session still ends.
  }
  res.json({ endSessionUrl: url });
});

// 5. Back-channel logout. dsg-sso.md 4.6 leaves this to open question Q9.
// Authentik 2026.8.5 supports it, so a logout in OTT also ends DSG sessions.
const LOGOUT_EVENT = "http://schemas.openid.net/event/backchannel-logout";
router.post("/backchannel-logout", express.urlencoded({ extended: false }), async (req, res) => {
  const logoutToken = req.body?.logout_token;
  if (typeof logoutToken !== "string") return res.status(400).send("missing logout_token");

  let payload;
  try {
    payload = await verifyAuthentikJwt(logoutToken, { typ: "logout+jwt" });
  } catch {
    return res.status(400).send("invalid logout_token");
  }
  if (!payload.events?.[LOGOUT_EVENT] || typeof payload.sub !== "string") {
    return res.status(400).send("invalid logout_token");
  }

  const user = await User.findOneAndUpdate({ authentikSub: payload.sub }, { $inc: { tokenVersion: 1 }, $unset: { ssoIdToken: 1 } });
  if (user) await audit("sso-logout", user, { via: "backchannel" });
  res.sendStatus(200);
});

module.exports = router;

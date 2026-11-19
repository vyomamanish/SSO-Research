// The linking rule from dsg-sso.md 7.1, as a pure decision function. The route
// does the database lookups and passes the candidates in.
const { isStaffClaim } = require("./ssoRoles");

/**
 * @param {object} claims   verified ID token claims (sub, email, email_verified, dsg_roles)
 * @param {object} found    { bySub, byEmail } user records, or null
 * @returns {{ action: "link" | "create" | "refuse", user?: object, reason?: string }}
 */
function decideLink(claims, { bySub = null, byEmail = null } = {}, rolesClaim = "dsg_roles") {
  // 1. Same Authentik person as before.
  if (bySub && !bySub.isDeleted) return { action: "link", user: bySub };

  // Email linking needs a verified email.
  if (claims.email_verified !== true) return { action: "refuse", reason: "unverified" };

  // 2. Existing DSG account with the same email (deleted accounts are ignored).
  if (byEmail && !byEmail.isDeleted) {
    if (byEmail.authentikSub && byEmail.authentikSub !== claims.sub) {
      return { action: "refuse", reason: "conflict" };
    }
    // A customer account in Authentik must not take over an admin record.
    if (byEmail.isAdmin && !isStaffClaim(claims[rolesClaim])) {
      return { action: "refuse", reason: "admin_takeover" };
    }
    return { action: "link", user: byEmail };
  }

  // 3. Nobody matches: new customer.
  return { action: "create" };
}

module.exports = { decideLink };

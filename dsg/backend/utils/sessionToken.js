// DSG's own session token, unchanged from today: an HS256 JWT { id, tokenVersion }.
// After SSO, the callback mints it, so `protect` and every route keep working.
const jwt = require("jsonwebtoken");

function issueSessionToken(user) {
  const hours = user.isAdmin ? Number(process.env.SSO_STAFF_SESSION_HOURS || 8) : 12;
  return jwt.sign({ id: String(user._id), tokenVersion: user.tokenVersion }, process.env.JWT_SECRET, {
    algorithm: "HS256",
    expiresIn: `${hours}h`,
  });
}

module.exports = { issueSessionToken };

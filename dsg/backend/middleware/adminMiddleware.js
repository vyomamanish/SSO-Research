// Unchanged by SSO (dsg-sso.md 6.2): roles are read from the database, which
// the SSO callback keeps in step with Authentik's groups.
const User = require("../models/User");

async function admin(req, res, next) {
  const user = await User.findById(req.user).select("isAdmin adminLevel adminRole allowedPages");
  if (!user?.isAdmin) return res.status(403).json({ message: "Admins only" });
  req.adminLevel = user.adminLevel;
  req.adminRole = user.adminRole;
  req.allowedPages = user.allowedPages;
  next();
}

function requireSuperAdmin(req, res, next) {
  if (req.adminLevel !== 1) return res.status(403).json({ message: "Super Admins only" });
  next();
}

function requireAdminPage(key) {
  return (req, res, next) => {
    if (req.adminLevel === 1 || req.allowedPages.includes(key)) return next();
    res.status(403).json({ message: `You don't have access to the ${key} page` });
  };
}

module.exports = { admin, requireSuperAdmin, requireAdminPage };

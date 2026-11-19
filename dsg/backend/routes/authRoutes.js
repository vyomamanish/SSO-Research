// The parts of authRoutes.js that stay. In SSO_MODE=sso_only the local
// password routes answer 410 (dsg-sso.md 6.2).
const express = require("express");
const User = require("../models/User");
const { protect } = require("../middleware/authMiddleware");

const router = express.Router();

function profile(user) {
  return {
    id: String(user._id),
    name: user.name,
    email: user.email,
    isAdmin: user.isAdmin,
    adminLevel: user.adminLevel,
    adminRole: user.adminRole,
    allowedPages: user.allowedPages,
    ssoLinked: Boolean(user.authentikSub),
    authSource: user.authSource,
    memberSince: user.createdAt,
  };
}

router.get("/me", protect, async (req, res) => {
  const user = await User.findById(req.user);
  res.json(profile(user));
});

// Legacy password login, register and reset are replaced by Authentik.
const gone = (req, res) => {
  if (process.env.SSO_MODE === "sso_only") {
    return res.status(410).json({ message: "Use 'Continue with Vyoma account' to sign in." });
  }
  res.status(501).json({ message: "Local password login isn't part of this demo." });
};
router.post(["/login", "/register", "/forgot-password", "/reset-password", "/google"], gone);

module.exports = { router, profile };

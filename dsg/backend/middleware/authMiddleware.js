// `protect`, as in DSG today (dsg-sso.md 2.6): Bearer HS256 only, and the
// account state is re-read from the database on every request.
const jwt = require("jsonwebtoken");
const User = require("../models/User");

async function protect(req, res, next) {
  const [scheme, token] = (req.headers.authorization || "").split(" ");
  if (scheme !== "Bearer" || !token) return res.status(401).json({ message: "Not signed in" });

  let decoded;
  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ["HS256"] });
  } catch {
    return res.status(401).json({ message: "Session expired" });
  }

  const user = await User.findById(decoded.id).select("isBlocked isDeleted tokenVersion");
  // A tokenVersion bump (logout, back-channel logout) ends every session.
  if (!user || user.isBlocked || user.isDeleted || user.tokenVersion !== decoded.tokenVersion) {
    return res.status(401).json({ message: "Session ended" });
  }
  req.user = String(user._id);
  next();
}

module.exports = { protect };

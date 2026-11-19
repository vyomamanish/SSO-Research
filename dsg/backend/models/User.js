// A cut-down copy of DSG 2.0's User model with the fields from dsg-sso.md 6.2.
const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    name: String,
    // Legacy local credential. Kept until the rollback window ends (Q8).
    password: { type: String, select: false },
    hasLocalPassword: { type: Boolean, default: true },
    googleSub: String,

    // NEW for SSO
    authentikSub: String,
    authSource: { type: String, enum: ["local", "authentik"], default: "local" },
    ssoLinkedAt: Date,
    // Sent back to Authentik as id_token_hint at logout. Not a secret, but not
    // returned by default either.
    ssoIdToken: { type: String, select: false },

    isBlocked: { type: Boolean, default: false },
    isDeleted: { type: Boolean, default: false },
    // Bumping this logs the user out of every DSG session.
    tokenVersion: { type: Number, default: 0 },

    // Roles. After cutover these are a cache, rewritten from Authentik at login.
    isAdmin: { type: Boolean, default: false },
    adminLevel: { type: Number, enum: [1, 2], default: 2 }, // 1 = Super Admin
    adminRole: { type: String, default: "Staff" },
    allowedPages: { type: [String], default: [] },

    lastLoginAt: Date,
  },
  { timestamps: true },
);

// Same pattern as googleSub: unique only when set.
userSchema.index(
  { authentikSub: 1 },
  { unique: true, partialFilterExpression: { authentikSub: { $type: "string" } } },
);

module.exports = mongoose.model("User", userSchema);

const mongoose = require("mongoose");

const adminAuditLogSchema = new mongoose.Schema(
  {
    action: { type: String, required: true }, // sso-login, sso-link, sso-link-refused, sso-logout, ...
    entityType: String,
    entityId: String,
    entityLabel: String,
    detail: mongoose.Schema.Types.Mixed,
  },
  { timestamps: true },
);

module.exports = mongoose.model("AdminAuditLog", adminAuditLogSchema);

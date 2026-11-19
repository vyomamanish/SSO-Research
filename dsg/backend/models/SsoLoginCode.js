// Phase 1 one-time codes (dsg-sso.md 4.3): the callback hands the SPA a 60 s,
// single-use code instead of putting the DSG token in the URL.
const mongoose = require("mongoose");

const ssoLoginCodeSchema = new mongoose.Schema({
  codeHash: { type: String, required: true, unique: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  // MongoDB deletes expired codes itself (TTL index, like PhoneOtp).
  expiresAt: { type: Date, required: true, index: { expires: 0 } },
});

module.exports = mongoose.model("SsoLoginCode", ssoLoginCodeSchema);

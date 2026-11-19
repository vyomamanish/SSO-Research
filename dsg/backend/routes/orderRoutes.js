const express = require("express");
const Order = require("../models/Order");
const { protect } = require("../middleware/authMiddleware");

const router = express.Router();

// My Library / My Orders: everything references User._id, so linking an
// existing account to SSO keeps the whole history.
router.get("/my", protect, async (req, res) => {
  const orders = await Order.find({ user: req.user }).sort({ createdAt: -1 });
  res.json(orders);
});

module.exports = router;

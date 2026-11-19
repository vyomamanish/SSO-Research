// Admin APIs. The guard chain is the same as DSG today: protect, admin, page.
const express = require("express");
const Order = require("../models/Order");
const User = require("../models/User");
const { protect } = require("../middleware/authMiddleware");
const { admin, requireAdminPage } = require("../middleware/adminMiddleware");

const router = express.Router();
router.use(protect, admin);

router.get("/orders", requireAdminPage("orders"), async (req, res) => {
  const orders = await Order.find().populate("user", "name email").sort({ createdAt: -1 });
  res.json(orders);
});

router.get("/coupons", requireAdminPage("coupons"), (req, res) => {
  res.json([
    { code: "GITA20", discount: "20%", uses: 41 },
    { code: "WELCOME10", discount: "10%", uses: 318 },
  ]);
});

router.get("/users", requireAdminPage("users"), async (req, res) => {
  const users = await User.find({ isDeleted: { $ne: true } }).sort({ createdAt: 1 });
  res.json(
    users.map((user) => ({
      id: String(user._id),
      name: user.name,
      email: user.email,
      role: user.isAdmin ? user.adminRole : "Customer",
      ssoLinked: Boolean(user.authentikSub),
    })),
  );
});

module.exports = router;

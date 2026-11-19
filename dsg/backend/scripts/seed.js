// Puts DSG's demo database into its "before SSO" state. Only ever runs against
// MONGO_URI from backend/.env, which points at the demo's own container.
const mongoose = require("mongoose");
const User = require("../models/User");
const Order = require("../models/Order");
const SsoLoginCode = require("../models/SsoLoginCode");
const AdminAuditLog = require("../models/AdminAuditLog");

const LEGACY_HASH = "$2b$12$legacybcrypthashnotusedbythisdemo0000000000000000000"; // bcrypt-shaped placeholder

async function main() {
  const uri = process.env.MONGO_URI;
  if (!uri || !uri.includes(":27018/dsg_demo")) {
    throw new Error(`Refusing to seed ${uri}: only the demo database (port 27018, dsg_demo) is allowed.`);
  }
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 });
  await Promise.all([User.deleteMany({}), Order.deleteMany({}), SsoLoginCode.deleteMany({}), AdminAuditLog.deleteMany({})]);
  await User.syncIndexes();

  // Existing customer with two orders. Her first SSO login must keep them.
  const meera = await User.create({ email: "meera@vyoma.demo", name: "Meera Iyer", password: LEGACY_HASH });
  // Existing staff. Ravi's legacy pages are wider than his Authentik groups.
  const asha = await User.create({
    email: "asha@vyoma.demo",
    name: "Asha Rao",
    password: LEGACY_HASH,
    isAdmin: true,
    adminLevel: 1,
    adminRole: "Super Admin",
    allowedPages: ["dashboard", "orders", "coupons", "users"],
  });
  await User.create({
    email: "ravi@vyoma.demo",
    name: "Ravi Kumar",
    password: LEGACY_HASH,
    isAdmin: true,
    adminLevel: 2,
    adminRole: "Custom Sub-Admin",
    allowedPages: ["dashboard", "orders", "coupons", "users"],
  });

  await Order.create([
    { user: meera._id, number: "DSG-2026-27-0012", items: [{ title: "Spoken Sanskrit, Level 1", kind: "course", price: 1499 }], total: 1499 },
    { user: meera._id, number: "DSG-2026-27-0024", items: [{ title: "Sanskrit Primer (printed book)", kind: "book", price: 650 }], total: 650 },
    { user: asha._id, number: "DSG-2026-27-0025", items: [{ title: "Gita Chanting Audio Pack", kind: "digital", price: 399 }], total: 399 },
  ]);

  console.log("DSG seeded: 3 existing users (Meera, Asha, Ravi) and 3 orders. Priya and Kiran are created at first login.");
  await mongoose.disconnect();
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});

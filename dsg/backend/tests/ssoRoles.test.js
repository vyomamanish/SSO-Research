const test = require("node:test");
const assert = require("node:assert/strict");
const { rolesFromClaims } = require("../utils/ssoRoles");

const PAGES = ["dashboard", "orders", "coupons", "users"];

test("super admin gets every page at level 1", () => {
  assert.deepEqual(rolesFromClaims(["dsg-super-admin"], PAGES), {
    isAdmin: true,
    adminLevel: 1,
    adminRole: "Super Admin",
    allowedPages: PAGES,
  });
});

test("staff get only the pages their page groups grant, plus the dashboard", () => {
  const roles = rolesFromClaims(["dsg-staff", "dsg-page-orders"], PAGES);
  assert.equal(roles.isAdmin, true);
  assert.equal(roles.adminLevel, 2);
  assert.deepEqual(roles.allowedPages, ["dashboard", "orders"]);
});

test("unknown page groups are ignored", () => {
  assert.deepEqual(rolesFromClaims(["dsg-staff", "dsg-page-nuclear"], PAGES).allowedPages, ["dashboard"]);
});

test("page groups without dsg-staff don't make someone staff", () => {
  assert.equal(rolesFromClaims(["dsg-page-orders"], PAGES).isAdmin, false);
});

test("an empty or missing claim means customer", () => {
  assert.equal(rolesFromClaims([], PAGES).isAdmin, false);
  assert.equal(rolesFromClaims(undefined, PAGES).isAdmin, false);
  assert.equal(rolesFromClaims("dsg-super-admin", PAGES).isAdmin, false);
});

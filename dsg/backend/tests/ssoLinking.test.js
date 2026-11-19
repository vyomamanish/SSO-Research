const test = require("node:test");
const assert = require("node:assert/strict");
const { decideLink } = require("../utils/ssoLinking");

const claims = (extra = {}) => ({ sub: "sub-1", email: "a@x.test", email_verified: true, dsg_roles: [], ...extra });

test("a sub match links, even before checking email", () => {
  const user = { _id: 1, authentikSub: "sub-1" };
  assert.deepEqual(decideLink(claims({ email_verified: false }), { bySub: user }), { action: "link", user });
});

test("a verified email links an unlinked account", () => {
  const user = { _id: 2 };
  assert.deepEqual(decideLink(claims(), { byEmail: user }), { action: "link", user });
});

test("an unverified email is refused", () => {
  assert.deepEqual(decideLink(claims({ email_verified: false }), { byEmail: { _id: 2 } }), {
    action: "refuse",
    reason: "unverified",
  });
});

test("an account linked to a different sub is refused", () => {
  assert.equal(decideLink(claims(), { byEmail: { authentikSub: "sub-other" } }).reason, "conflict");
});

test("a customer identity can't take over an admin record", () => {
  assert.equal(decideLink(claims(), { byEmail: { isAdmin: true } }).reason, "admin_takeover");
});

test("a staff identity may link an admin record", () => {
  const user = { isAdmin: true };
  assert.deepEqual(decideLink(claims({ dsg_roles: ["dsg-staff"] }), { byEmail: user }), { action: "link", user });
});

test("deleted users are ignored", () => {
  assert.deepEqual(decideLink(claims(), { byEmail: { isDeleted: true } }), { action: "create" });
  assert.deepEqual(decideLink(claims(), { bySub: { isDeleted: true } }), { action: "create" });
});

test("no match creates a new customer", () => {
  assert.deepEqual(decideLink(claims(), {}), { action: "create" });
});

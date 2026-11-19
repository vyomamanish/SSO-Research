const test = require("node:test");
const assert = require("node:assert/strict");
const { encodeState, decodeState, safeReturnTo } = require("../utils/ssoState");

const SECRET = "test-secret";
const payload = { state: "s", nonce: "n", codeVerifier: "v", returnTo: "/my-library" };

test("a fresh cookie round-trips", () => {
  const decoded = decodeState(encodeState(payload, SECRET), SECRET);
  assert.equal(decoded.state, "s");
  assert.equal(decoded.returnTo, "/my-library");
});

test("a tampered cookie is refused", () => {
  const [data, signature] = encodeState(payload, SECRET).split(".");
  const forged = Buffer.from(JSON.stringify({ ...payload, returnTo: "/admin", exp: Date.now() + 60_000 })).toString("base64url");
  assert.equal(decodeState(`${forged}.${signature}`, SECRET), null);
  assert.equal(decodeState(`${data}.${signature}x`, SECRET), null);
  assert.equal(decodeState(encodeState(payload, "other-secret"), SECRET), null);
});

test("an expired cookie is refused", () => {
  const old = encodeState(payload, SECRET, Date.now() - 10 * 60_000);
  assert.equal(decodeState(old, SECRET), null);
});

test("garbage is refused", () => {
  for (const value of [undefined, "", "abc", "a.b", null]) assert.equal(decodeState(value, SECRET), null);
});

test("an external returnTo is replaced with /", () => {
  for (const value of ["https://evil.test", "//evil.test", "/\\evil.test", "javascript:alert(1)", undefined]) {
    assert.equal(safeReturnTo(value), "/");
  }
  assert.equal(safeReturnTo("/my-library?tab=1"), "/my-library?tab=1");
});

// Authentik session ids ended by a back-channel logout. App sessions are stateless
// JWT cookies, so the server has to remember which ones are no longer valid.
//
// In-memory is enough for one demo process. A real deployment would use Redis or
// a database, and globalThis is what lets route handlers and pages share this map.
const REMEMBER_MS = 60 * 60 * 1000; // matches the app session lifetime

const store = globalThis as typeof globalThis & { revokedSessions?: Map<string, number> };
const revoked = (store.revokedSessions ??= new Map<string, number>());

export function revokeSession(sid: string) {
  const now = Date.now();
  for (const [id, expiresAt] of revoked) {
    if (expiresAt < now) revoked.delete(id);
  }
  revoked.set(sid, now + REMEMBER_MS);
}

export function isSessionRevoked(sid: string) {
  return revoked.has(sid);
}

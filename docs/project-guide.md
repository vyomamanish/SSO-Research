# Project guide: Vyoma SSO with Authentik

This guide explains the whole project, from the idea to each file and each request. Read it top to bottom once and you should be able to answer any technical question about it. Two related documents cover the rest:

- [`migration-plan.md`](migration-plan.md): how existing OTT and DSG users move to SSO in production.
- [`presenter-qa.md`](presenter-qa.md): questions you are likely to be asked, with answers.
- [`architecture.md`](architecture.md): the diagrams on their own.

## Contents

1. [The problem and the idea](#1-the-problem-and-the-idea)
2. [Words you need](#2-words-you-need)
3. [The pieces and where they run](#3-the-pieces-and-where-they-run)
4. [How Authentik is configured](#4-how-authentik-is-configured)
5. [Signing in to OTT, request by request](#5-signing-in-to-ott-request-by-request)
6. [Signing in to DSG, request by request](#6-signing-in-to-dsg-request-by-request)
7. [Single sign-on: why the second app needs no password](#7-single-sign-on-why-the-second-app-needs-no-password)
8. [Logging out everywhere](#8-logging-out-everywhere)
9. [Roles: from Authentik groups to app permissions](#9-roles-from-authentik-groups-to-app-permissions)
10. [Existing users: the linking rule](#10-existing-users-the-linking-rule)
11. [Sessions after sign-in](#11-sessions-after-sign-in)
12. [Google sign-in](#12-google-sign-in)
13. [Security: what each protection stops](#13-security-what-each-protection-stops)
14. [Every file and what it does](#14-every-file-and-what-it-does)
15. [Configuration and secrets](#15-configuration-and-secrets)
16. [Running, resetting and testing](#16-running-resetting-and-testing)
17. [Where the demo differs from the plans](#17-where-the-demo-differs-from-the-plans)
18. [What is not built, and known limits](#18-what-is-not-built-and-known-limits)

---

## 1. The problem and the idea

Vyoma has two apps today, and each one has its own login:

| App | Stack | How login works today | Main weaknesses (from the plans) |
| --- | --- | --- | --- |
| **Vyoma OTT 2.0** (video courses) | Next.js 16 App Router, Prisma, PostgreSQL | Email and password checked by OTT. The session is a cookie called `user_email` that holds the email in plain text. | Anyone who sets `user_email=<someone's email>` becomes that person. Fallback admin password `vyoma-secure-123` in the code. Unsalted SHA-256 password hashes. Logout only deletes the browser cookie. A Manager can reach pages they shouldn't (section 13). |
| **DSG 2.0** (Digital Sanskrit Guru store) | React SPA built with Vite, Express API, MongoDB | Email and password (bcrypt) or Google, checked by Express. Express returns an HS256 JWT, and the SPA keeps it in `localStorage` or `sessionStorage`. | Any script on the page can read the token. Tokens last up to 30 days and logout doesn't revoke them. Admins have no MFA. A test-only Google "mock token" works on any server without `NODE_ENV=production`. |

**The idea:** move "who is this person?" into one service, **Authentik**. Authentik checks passwords, runs MFA and talks to Google. The apps never see a password. Each app asks Authentik, gets back a **signed statement** (an ID token) saying who the person is, checks the signature, and then runs its own session as before.

The apps keep everything else: OTT keeps plans, purchases and watch progress. DSG keeps orders and the library. Authentik only knows identity and staff groups.

This repository is a **working prototype** of that design. It runs locally, it is a cut-down copy of both apps, and it follows the two plans (`ott-sso.md`, `dsg-sso.md`) closely: same file names, same routes, same environment variable names, same Authentik settings. Where the plans would not have worked, the code does something different and says why (section 17).

---

## 2. Words you need

| Term | Meaning in this project |
| --- | --- |
| **IdP (identity provider)** | The service that checks who someone is. Here: Authentik. |
| **RP / client (relying party)** | An app that trusts the IdP. Here: OTT and DSG. |
| **OIDC (OpenID Connect)** | The standard protocol the apps use to talk to Authentik. It sits on top of OAuth 2.0. |
| **Authorization code flow** | The OIDC flow used here. The browser goes to Authentik, comes back with a short-lived **code**, and the app's **server** swaps the code for tokens. Tokens never pass through the browser's address bar. |
| **PKCE** ("pixy") | The app makes a random secret (the *verifier*), sends only its SHA-256 hash (the *challenge*) when starting login, and sends the verifier when swapping the code. A stolen code is useless without the verifier. |
| **state** | A random value the app stores before redirecting and checks when the browser returns. It stops another site from feeding your browser someone else's login (login CSRF). |
| **nonce** | A random value the app sends at the start, which Authentik copies into the ID token. The app checks it, so an old ID token can't be replayed. |
| **ID token** | A JWT signed by Authentik that says who the user is: `sub`, `email`, `name`, and our custom claims (`role` or `dsg_roles`). |
| **JWT** | A JSON object plus a signature, written as three base64 parts. Anyone can read it; only the key holder can sign it. |
| **JWKS** | Authentik's public keys, published at `.../jwks/`. Apps use them to check ID token signatures. |
| **`sub` (subject)** | The user's ID in the token. We use `sub_mode: user_uuid`, so it is the user's Authentik UUID and is **the same in every app**. |
| **Claim** | One field in a token, such as `email` or `role`. |
| **Scope** | A label the app requests (`openid email profile vyoma_roles`). Each scope makes Authentik add certain claims. |
| **Scope mapping** | A small Python expression in Authentik that produces the claims for a scope. We wrote three. |
| **Provider / Application** | In Authentik, a *provider* is the OIDC configuration for one app (client ID, secret, redirect URIs). An *application* wraps a provider and shows up in Authentik's app list. |
| **Blueprint** | A YAML file Authentik applies to configure itself. Ours creates every group, user, mapping and provider, so nobody has to click through the admin UI. |
| **Flow** | A sequence of Authentik screens, such as "authentication" (username, password) or "invalidation" (logout). |
| **Source** | An outside login Authentik trusts, such as Google. |
| **RP-initiated logout** | The app sends the browser to Authentik's end-session URL to end the Authentik session. |
| **Back-channel logout** | Authentik's server POSTs a signed `logout_token` straight to each app's server when a session ends. No browser involved. |
| **`sid`** | Authentik's session ID. It's in the ID token and in the logout token, so the app can match them. |
| **`tokenVersion`** | A counter on each DSG user. DSG tokens carry the value at issue time. Bumping the counter makes every existing DSG token for that user invalid. |
| **BFF (backend for frontend)** | The pattern DSG uses: the Express server does the OIDC work on behalf of the React app, so Authentik tokens never reach the browser. |
| **JIT (just-in-time) linking** | Linking an existing app account to an Authentik user at that user's first SSO sign-in, instead of in a batch job. |

---

## 3. The pieces and where they run

```
Browser ──► OTT (Next.js)            http://localhost:3000
        ──► DSG SPA (Vite preview)   http://localhost:5173  ──/api proxy──► DSG API (Express) :5001
        ──► Authentik server         http://localhost:9000

OTT server     ──► Authentik  (discovery, code→token exchange, JWKS)
DSG API        ──► Authentik  (same)
Authentik worker ──► OTT  /api/auth/backchannel-logout          (via host.docker.internal:3000)
                 ──► DSG  /api/auth/oidc/backchannel-logout     (via host.docker.internal:5001)

OTT  ──Prisma──►   PostgreSQL "ott"       127.0.0.1:5433   (Docker service ott-db)
DSG  ──Mongoose──► MongoDB "dsg_demo"     127.0.0.1:27018  (Docker service dsg-db)
Authentik ───────► PostgreSQL "authentik" (Docker service postgresql, not exposed)
```

| Piece | Runs as | Version |
| --- | --- | --- |
| Authentik server (login pages, OIDC endpoints, admin UI) | Docker `server` | `ghcr.io/goauthentik/server:2026.8.5` |
| Authentik worker (applies blueprints, sends back-channel logouts) | Docker `worker` | same image |
| Authentik's database | Docker `postgresql` | `postgres:16.15-alpine` |
| OTT database | Docker `ott-db`, port 5433 on localhost only | `postgres:16.15-alpine` |
| DSG database | Docker `dsg-db`, port 27018 on localhost only | `mongo:8.0.38` |
| OTT app | Node on the host, `npm start` in `ott/` | Next.js 16.2.12, Prisma 6.2.1, openid-client 6.9.0, jose |
| DSG API | Node on the host, `npm start` in `dsg/backend/` | Express 5, Mongoose, openid-client, jose, jsonwebtoken |
| DSG SPA | Vite preview on the host | React, react-router, axios |

Current Authentik needs no Redis, so there are only three Authentik containers. Ports 5433 and 27018 were chosen so they can't clash with a PostgreSQL or MongoDB already running on the default ports.

**Why the DSG SPA and API share one origin:** Vite proxies `/api` to Express (`dsg/vite.config.js`), just like nginx and Vercel do in DSG's real deployments. So the browser sees everything on `localhost:5173`, and the SSO callback (`/api/auth/oidc/callback`) can read the state cookie that `/api/auth/oidc/login` set.

**Why the worker uses `host.docker.internal`:** the worker runs inside Docker, and the apps run on the host. Inside a container, `localhost` means the container itself. `host.docker.internal` is Docker's name for the host. `extra_hosts` in `docker-compose.yml` makes the name work on Linux too.

---

## 4. How Authentik is configured

Everything is in two blueprint files, mounted into the worker at `/blueprints/vyoma`. The worker applies them at startup and again every hour.

### `blueprints/vyoma-sso-demo.yaml`

| Section | What it creates | Notes |
| --- | --- | --- |
| `metaapplyblueprint` entries | Waits for Authentik's built-in flows and scope mappings | Blueprints load in any order; without this, `!Find` could fail on a fresh install. |
| `state: absent` entries | Deletes the objects from the first version of this demo | This is how an existing install upgrades cleanly. |
| Groups | `vyoma-superadmins`, `vyoma-admins`, `vyoma-managers`, `vyoma-finance`, `vyoma-users`, `dsg-super-admin`, `dsg-staff`, `dsg-page-orders`, `dsg-page-coupons`, `dsg-page-users` | OTT roles use `vyoma-*`. DSG uses `dsg-*`, following the DSG plan's `<app>-<role>` naming. |
| Users (`state: created`) | `asha.admin`, `ravi.manager`, `priya.finance`, `meera.learner`, `kiran.new`, passwords from `.env` via `!Env` | `state: created` means "create once, never overwrite", so changes you make in the UI during a demo survive the hourly re-apply. Each has `attributes.email_verified: true`. |
| Scope mapping `Vyoma: email with verified flag` (scope `email`) | `email` and `email_verified` from the user's attribute | Authentik's built-in email mapping always sends `email_verified: false`, which would make both apps refuse to link any existing account. |
| Scope mapping `Vyoma Roles Mapping` (scope `vyoma_roles`) | One `role` claim: `SUPER_ADMIN`, `ADMIN`, `MANAGER`, `FINANCE` or `USER`, first match wins | The plan used `user.ak_groups`, which Authentik 2026.8 removed. This uses `request.user.groups.all()`. |
| Scope mapping `DSG roles` (scope `dsg`) | `dsg_roles`: the list of the user's group names starting with `dsg-` | Same `ak_groups` fix. |
| Provider `Vyoma OTT 2.0 Provider` + application `vyoma-ott` | client ID `vyoma-ott-platform`, confidential, explicit-consent flow, 15-minute access token, back-channel logout to OTT | |
| Provider `DSG Dev (OIDC)` + application `dsg-dev` | client ID `dsg-dev`, confidential, implicit-consent flow (no consent screen), 1-minute code, 10-minute access token, back-channel logout to DSG | |

Settings that matter on **both** providers:

- `grant_types: [authorization_code]`. A provider created from a blueprint without this has an empty list and rejects every login. The admin UI fills it in for you, which is why the plans don't mention it.
- `sub_mode: user_uuid`. The same person gets the same `sub` in OTT and DSG.
- `issuer_mode: per_provider`. Each app has its own issuer URL: `http://localhost:9000/application/o/vyoma-ott/` and `.../dsg-dev/`. The trailing slash is part of the issuer and must match exactly.
- `invalidation_flow: default-invalidation-flow`. This flow contains the stage that actually ends the Authentik session at logout.
- `redirect_uris` with `matching_mode: strict`: one `authorization` URI (the callback) and one `logout` URI (where to land after logout). Authentik refuses any other URL, which stops an attacker from sending codes to their own site.
- `signing_key`: Authentik's self-signed certificate, so ID tokens are RS256 and can be checked with JWKS. The DSG plan asks for one key per environment in production.
- `include_claims_in_id_token: true`, so the role claims are in the ID token the apps verify.

### `blueprints/google-source.yaml`

Every entry has `conditions: [!Env GOOGLE_CLIENT_ID]`, so nothing happens until you put a Google client ID in `.env`. Then it creates the Google source, a property mapping (username = email, `email_verified` copied from Google) and adds the Google button to the default login page. See section 12.

---

## 5. Signing in to OTT, request by request

Files: `ott/src/app/api/auth/login/route.ts`, `ott/src/app/api/auth/callback/route.ts`, `ott/src/lib/oidc.ts`, `ott/src/lib/auth.ts`, `ott/src/lib/session.ts`.

**Step 1. Browser → `GET /api/auth/login?redirect=/profile`** (the "Sign in with Vyoma SSO" button)

`login/route.ts`:
1. Loads Authentik's discovery document once (`getOidcConfig()` in `lib/oidc.ts`, cached; on failure the cache is cleared so the next request retries). If Authentik is down, the user goes to `/login?error=sso_unavailable`.
2. Makes three random values: `codeVerifier` (PKCE), `state`, `nonce`.
3. Builds the authorize URL: `http://localhost:9000/application/o/authorize/?client_id=vyoma-ott-platform&redirect_uri=http://localhost:3000/api/auth/callback&scope=openid email profile vyoma_roles&code_challenge=<SHA-256 of verifier>&code_challenge_method=S256&state=...&nonce=...&response_type=code`.
4. Stores `oidc_state`, `oidc_code_verifier`, `oidc_nonce` and `oidc_return_to` in four HttpOnly cookies, `SameSite=Lax`, path `/api/auth`, 5 minutes.
5. Redirects the browser to Authentik.

`oidc_return_to` goes through `safeReturnTo()`: only paths that start with `/` and not `//` are kept, so the redirect can't send the user to another site.

**Step 2. Browser ↔ Authentik**

Authentik shows its login flow (username, then password, or the Google button). For OTT it then shows a consent screen the first time, because the OTT plan asks for the explicit-consent flow. Authentik redirects to `http://localhost:3000/api/auth/callback?code=...&state=...`.

**Step 3. Browser → `GET /api/auth/callback?code=...&state=...`**

`callback/route.ts`:
1. Reads the four flow cookies. Missing → `/login?error=invalid_state`.
2. `client.authorizationCodeGrant(...)` (openid-client):
   - checks the `state` in the URL equals the cookie,
   - POSTs to Authentik's token endpoint, **server to server**, with the code, the PKCE verifier and the client secret,
   - checks the ID token's `iss`, `aud`, `exp` and `nonce`.
3. `verifyAuthentikToken(idToken)` in `lib/auth.ts` checks the **signature** against Authentik's JWKS, plus issuer, audience (`vyoma-ott-platform`) and algorithm (RS256 only). openid-client does not check the signature in this flow, because it trusts the direct TLS connection; the plan asks for an explicit JWKS check, so we do it.
4. Reads the claims: `sub` → `authentikId`, `email` (lowercased), `name`, `email_verified`, `role`. Unknown roles become `USER`.
5. Links or creates the OTT user (section 10). Writes `authentikId` and **overwrites** `role` with the claim.
6. Seals the session: `{ userId, authentikId, email, role, sid, idToken }` encrypted as a JWE (`alg: dir`, `enc: A256GCM`, key = SHA-256 of `SESSION_SECRET`), valid 7 days. Sets it as the `vyoma_session` cookie: HttpOnly, `SameSite=Lax`, `Secure` when the app URL is HTTPS.
7. Deletes the four flow cookies and redirects to `returnTo`.

Any failure redirects to `/login?error=<reason>`, and the login page shows a readable message: `token_exchange_failed`, `access_denied`, `email_unverified`, `account_conflict`, `missing_email`.

**Step 4. Every later request**

- `src/proxy.ts` (Next.js 16's name for `middleware.ts`) runs first for every page except `/api` and static files. For `/admin`, `/profile` and `/watch`, it decrypts the cookie; no valid cookie → redirect to `/login?redirect=<path>`. This is a fast check of the cookie only.
- The page then calls `getCurrentUser()` (`lib/auth.ts`), which decrypts the cookie again, checks the `sid` isn't in the `SessionRevocation` table, and loads the user from PostgreSQL (with purchases and progress). It also downgrades an expired plan to FREE, as OTT does today.
- Admin pages also call `requireAdminAccess(path)` (`lib/adminGuard.tsx`). See section 9.

---

## 6. Signing in to DSG, request by request

Files: `dsg/backend/routes/oidcRoutes.js`, `dsg/backend/services/oidcClient.js`, `dsg/backend/utils/ssoState.js`, `ssoLinking.js`, `ssoRoles.js`, `sessionToken.js`, `dsg/src/context/AuthContext.jsx`, `dsg/src/pages/AuthCallback.jsx`.

DSG is a React SPA, so it can't keep a client secret. The Express API does all the OIDC work (the BFF pattern), and the SPA never sees an Authentik token.

**Step 1. SPA → `GET /api/auth/oidc/login?returnTo=/my-library`** (full page navigation from `loginWithSso()`)

Express (`oidcRoutes.js` `/login`):
1. `buildAuthUrl()` makes the PKCE verifier, state and nonce, and the authorize URL (client `dsg-dev`, scope `openid email profile dsg`).
2. Puts `{ state, nonce, codeVerifier, returnTo, exp }` in **one** cookie, `dsg_oidc_state`, as `base64url(JSON).HMAC-SHA256` signed with `OIDC_STATE_SECRET` (`ssoState.js`). HttpOnly, `SameSite=Lax`, path `/api/auth/oidc`, 5 minutes. The HMAC means the browser can't change the values; the comparison uses `timingSafeEqual`.
3. Redirects to Authentik.

**Step 2. Browser ↔ Authentik.** No consent screen for DSG (implicit-consent flow).

**Step 3. Browser → `GET /api/auth/oidc/callback?code=...&state=...`**

1. Decodes and checks the state cookie (signature and expiry), then deletes it. Bad or missing → `/login?sso=expired`.
2. `handleCallback()`: code exchange with PKCE, state and nonce checks (openid-client), then signature check via JWKS (`verifyAuthentikJwt`, RS256, issuer, audience, 30 s clock tolerance).
3. `email_verified !== true` → `/login?sso=unverified`.
4. Looks up `bySub` (`authentikSub`) and `byEmail` (not deleted) **in parallel**, then calls `decideLink()` (section 10). A refusal is written to `AdminAuditLog` and redirects to `/login?sso=<reason>`.
5. `rolesFromClaims(claims.dsg_roles, adminPages)` turns the groups into `isAdmin`, `adminLevel`, `adminRole`, `allowedPages` (section 9), and saves them on the user together with `authentikSub`, `name`, `ssoIdToken` (for logout) and `lastLoginAt`. `ssoLinkedAt` is set on the first link.
6. Blocked or deleted → `/login?sso=inactive`.
7. Audits `sso-link` (first time) or `sso-login`.
8. **One-time code:** makes 32 random bytes, stores only their SHA-256 in `SsoLoginCode` with a 60-second expiry (a MongoDB TTL index deletes old ones), and redirects to the SPA: `/auth/callback?code=<code>&returnTo=/my-library`.

**Step 4. SPA → `POST /api/auth/oidc/exchange { code }`**

`AuthCallback.jsx` posts the code. Express does `findOneAndDelete({ codeHash, expiresAt > now })`, which makes the code **single use** atomically, checks the user isn't blocked, and returns `{ token, user }`. The token is **exactly DSG's existing session token**: HS256 JWT `{ id, tokenVersion }` signed with `JWT_SECRET`, valid 8 h for staff (`SSO_STAFF_SESSION_HOURS`) or 12 h for customers.

`AuthContext.persistAuth()` stores it in `sessionStorage` under `authSession`, as DSG does today. From here, every DSG API call works unchanged: `Authorization: Bearer <token>` → `protect` middleware.

**Why the extra one-time code?** Putting the DSG token itself in the redirect URL would leave it in browser history, logs and the `Referer` header. A 60-second, single-use, hashed code is worthless once used. This is "Phase 1" of the DSG plan. Phase 2 (not built) replaces `sessionStorage` with an HttpOnly cookie.

**React StrictMode detail:** in development React runs effects twice, which would send the code twice, and the second exchange would fail. `AuthCallback.jsx` keeps one promise per code in a module-level `Map`, so both runs share the same exchange.

---

## 7. Single sign-on: why the second app needs no password

After step 2 of either flow, Authentik has set **its own session cookie** in the browser for `localhost:9000`. When the second app redirects the browser to Authentik, Authentik sees that cookie, knows who the user is, and immediately redirects back with a new code. The second app runs exactly the same code as the first; it just never sees a password screen.

So SSO is **not** one shared cookie across apps. There are three separate sessions:

| Session | Where | Lifetime |
| --- | --- | --- |
| Authentik session | Cookie on the Authentik domain | Authentik's flow settings |
| OTT session | `vyoma_session` cookie on OTT's domain | 7 days, revocable by `sid` |
| DSG session | DSG token in `sessionStorage` | 8 h staff / 12 h customers, revocable by `tokenVersion` |

Both apps get the same `sub` for the person, because both providers use `sub_mode: user_uuid`.

---

## 8. Logging out everywhere

### Starting from OTT

1. Browser → `POST /api/auth/logout` (`ott/src/app/api/auth/logout/route.ts`).
2. OTT writes the session's `sid` into `SessionRevocation`. From now on `getCurrentUser()` rejects any cookie with that `sid`, so even a **copied** cookie stops working. (Old OTT only deleted the browser cookie.)
3. OTT deletes the `vyoma_session` cookie and redirects (303) to Authentik's end-session URL with `id_token_hint=<the ID token>` and `post_logout_redirect_uri=http://localhost:3000/login`. If Authentik can't be reached, the user still lands on `/login` and the OTT session is still ended.
4. Authentik runs the invalidation flow, which ends the Authentik session.
5. Authentik's **worker** sends a back-channel logout to every other app the user had a session with: `POST http://host.docker.internal:5001/api/auth/oidc/backchannel-logout` with form field `logout_token=<JWT>`.
6. DSG checks the logout token: RS256 signature via JWKS, issuer, audience, `typ: logout+jwt`, and the `events` claim containing `http://schemas.openid.net/event/backchannel-logout`. Then `tokenVersion += 1` and `ssoIdToken` is removed for the user with that `sub`.
7. Next time the DSG tab calls `/api/auth/me` (on refresh), `protect` sees the token's `tokenVersion` no longer matches → 401 → `AuthContext` clears `sessionStorage` → signed out.

In testing, the back-channel call reached the other app in about 1–2 seconds.

### Starting from DSG

1. SPA → `POST /api/auth/oidc/logout` with the Bearer token.
2. DSG bumps `tokenVersion` (ends every DSG session for this user, same as DSG's existing "log out everywhere"), clears `ssoIdToken`, audits, and returns `{ endSessionUrl }`.
3. The SPA clears `sessionStorage` and navigates to the end-session URL.
4. Authentik ends its session and back-channels OTT: `POST http://host.docker.internal:3000/api/auth/backchannel-logout`.
5. OTT verifies the logout token the same way and writes the token's `sid` into `SessionRevocation`. OTT's next page load rejects the cookie.

### Why OTT revokes by `sid` but DSG by `tokenVersion`

- OTT keeps Authentik's `sid` in its cookie, so it can end **just that browser's** session. Other devices stay signed in.
- DSG's token has no `sid`, only `{ id, tokenVersion }`, which is what DSG uses today. Bumping `tokenVersion` ends **all** of that person's DSG sessions. Changing that would mean changing the token format, which the plan avoids in Phase 1.

---

## 9. Roles: from Authentik groups to app permissions

### OTT

The `vyoma_roles` scope gives one `role` claim, chosen by the first group that matches:

| Group | `role` claim | What OTT allows (`ott/src/lib/roles.ts`) |
| --- | --- | --- |
| `vyoma-superadmins` | `SUPER_ADMIN` | Every admin page |
| `vyoma-admins` | `ADMIN` | Every admin page |
| `vyoma-managers` | `MANAGER` | Not `/admin/users`, `/reports`, `/subscriptions`, `/vouchers`, `/invoices`, `/orders` (but `/admin/users/import` is allowed) |
| `vyoma-finance` | `FINANCE` | Not `/admin/courses`, `/episodes`, `/pages`, `/layout-settings`, `/navigation`, `/users`, `/bundles`, `/sponsors` |
| none of these | `USER` | No admin pages |

These page rules are copied from OTT's current `admin/layout.tsx`. Only the **source** of the role changes: it used to be set in OTT's database by an admin, and now it comes from Authentik at every login.

**Where it's enforced:** each admin page calls `requireAdminAccess('/admin/<page>')`. That is deliberate. OTT today checks in `admin/layout.tsx` using the `x-pathname` header, but the Next.js App Router **does not re-render a shared layout when you navigate between its child pages on the client**. So the check only runs on the first admin page you open. The demo script showed a Manager opening Courses (allowed), then clicking Users, and seeing every customer's name and email. A full reload showed "Restricted". Page components do re-render on every navigation, so the check now lives there. This bug is probably in OTT production today, independent of SSO.

Entitlement (can this user watch this course?) is a separate check, `canWatch()` in `roles.ts`: FREE courses for everyone, GOLD/PLATINUM by plan rank, PAID by purchase. Authentik plays no part in it.

### DSG

The `dsg` scope gives `dsg_roles`: every group name the user has that starts with `dsg-`. `rolesFromClaims()` in `dsg/backend/utils/ssoRoles.js` turns that into DSG's existing fields:

| Groups in `dsg_roles` | `isAdmin` | `adminLevel` | `allowedPages` |
| --- | --- | --- | --- |
| contains `dsg-super-admin` | true | 1 | all keys in `config/adminPages.json` (`dashboard`, `orders`, `coupons`, `users`) |
| contains `dsg-staff` | true | 2 | `dashboard` plus each `X` that has a `dsg-page-X` group |
| neither | false | 2 | none (customer) |

DSG's admin middleware is **unchanged**: `protect` → `admin` (reads `isAdmin`, `adminLevel`, `allowedPages` from MongoDB) → `requireAdminPage('coupons')` or `requireSuperAdmin`. The SSO callback rewrites those fields at every login, so the database is now a cache of Authentik's groups.

### When a role change takes effect

Both apps overwrite the role **at the next sign-in**. A person removed from a staff group keeps their old role in a session that is already open, until that session ends (OTT up to 7 days, DSG up to 8 hours for staff). To remove access immediately, also end their Authentik sessions (Authentik admin → user → Sessions), which triggers back-channel logout to both apps. The DSG plan's section 4.5 (periodic re-check with a refresh token) closes this gap and is not built yet.

---

## 10. Existing users: the linking rule

Every relation in both databases points at the app's own user ID (OTT `User.id`, a cuid; DSG `User._id`), not at the email. So linking an existing account to Authentik only **adds** one field. Nothing is copied or moved.

The rule runs on every SSO callback:

1. **Find by Authentik ID** (`authentikId` in OTT, `authentikSub` in DSG). Found → same person, sign in.
2. **Else find by email**, lowercased (DSG ignores deleted accounts):
   - Email not verified in Authentik → **refuse** (`email_unverified` / `unverified`). Otherwise anyone could create an Authentik account with a victim's email and take over their app account.
   - That record is already linked to a **different** Authentik ID → **refuse** (`account_conflict` / `conflict`).
   - DSG only: the record is an **admin** but the Authentik user has no DSG staff group → **refuse** (`admin_takeover`). A customer identity must never inherit a staff record.
   - Otherwise → **link**: save the Authentik ID on the record.
3. **No match** → create a new account: OTT `plan: FREE`, `role` from the claim; DSG customer with `authSource: "authentik"`, `hasLocalPassword: false`.

In DSG the rule is a pure function, `decideLink(claims, { bySub, byEmail })` in `ssoLinking.js`, with unit tests. OTT does the same inline in `callback/route.ts`.

Demo proof: Meera exists in both databases before SSO (OTT: GOLD yearly, a ₹2,999 purchase, Bhagavad Gita progress at 2h 14m; DSG: two orders). After her first SSO sign-in she sees all of it, and the tests confirm her OTT row ID and DSG `_id` didn't change. Kiran exists in neither and gets new accounts. Ravi's old records say OTT `ADMIN` and four DSG pages; after SSO he is OTT `MANAGER` with DSG Dashboard and Orders only, because Authentik now decides.

The full production plan for existing users (getting them into Authentik, their passwords, the rollout) is in [`migration-plan.md`](migration-plan.md).

---

## 11. Sessions after sign-in

| | OTT | DSG |
| --- | --- | --- |
| Format | JWE (encrypted JWT), `dir` + `A256GCM` | JWS (signed JWT), HS256 |
| Contains | `userId`, `authentikId`, `email`, `role`, `sid`, `idToken` | `id`, `tokenVersion` |
| Stored in | `vyoma_session` cookie, HttpOnly, SameSite=Lax | `sessionStorage` (`authSession`) |
| Sent as | Cookie, automatically | `Authorization: Bearer` header, added by each axios call |
| Lifetime | 7 days | 8 h staff, 12 h customers |
| Checked on each request | Decrypt; `sid` not revoked; user loaded from DB | Signature; user not blocked/deleted; `tokenVersion` matches DB |
| Revoked by | `SessionRevocation` row for the `sid` | `tokenVersion + 1` |
| Readable by page JavaScript? | No | Yes (until DSG Phase 2) |

The Authentik access token and ID token are not used for API calls in either app. They prove identity once, at sign-in. OTT keeps the ID token in its encrypted cookie and DSG keeps it in the database, only to send as `id_token_hint` at logout.

---

## 12. Google sign-in

Google is configured **in Authentik**, not in the apps. To turn it on: create a Google OAuth client (web application) with redirect URI `http://localhost:9000/source/oauth/callback/google/`, put `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` in `.env`, and run `npm run google:apply`. A "Google" button appears on the Vyoma login page.

What happens when someone clicks it:

1. Authentik sends them to Google, Google sends them back to Authentik.
2. `user_matching_mode: email_link`: if an Authentik user has the same email, Authentik links the Google identity to that user. Otherwise it enrolls a new Authentik user, using the `Vyoma: Google profile` mapping to set `username = email` (so there's no username prompt) and `attributes.email_verified` from Google.
3. Authentik finishes the OIDC flow to whichever app started it. From the app's point of view it is a normal SSO login.

So a Google sign-in is linked to existing OTT/DSG accounts by the same rule as section 10. `email_link` is safe for Google because Google only returns addresses it has verified.

Status: built and tested with a placeholder client and a stand-in that answers in Google's format (15 checks). A real Google account sign-in hasn't been tested; it needs Vyoma's own Google OAuth client.

---

## 13. Security: what each protection stops

| Protection | Where | Stops |
| --- | --- | --- |
| Authorization code flow, tokens fetched server to server | both | Tokens leaking via the address bar, history or `Referer` |
| Confidential clients with a secret | both | Anyone else exchanging a stolen code |
| PKCE (S256) | both | A stolen code being exchanged without the verifier |
| `state` checked against an HttpOnly cookie | both | Login CSRF (being signed in as the attacker) |
| `nonce` checked in the ID token | both | Replay of an old ID token |
| Signature via JWKS, RS256 only, issuer and audience checked | both | Forged tokens, tokens meant for another app, `alg: none` / HS256 confusion |
| Strict redirect URIs in Authentik | Authentik | Codes being sent to an attacker's URL |
| `safeReturnTo()` | both | Open redirect after login |
| HMAC-signed state cookie, `timingSafeEqual` | DSG | Tampering with the stored verifier or `returnTo` |
| Encrypted session cookie | OTT | Reading or forging the session (old `user_email` cookie) |
| `sid` revocation table | OTT | A copied cookie still working after logout |
| One-time code: 60 s, hashed, single use (`findOneAndDelete`) | DSG | DSG token in a URL; replay of the code |
| `tokenVersion` bump on logout and back-channel | DSG | A copied DSG token still working after logout |
| Logout token: signature, `typ: logout+jwt`, `events` claim | both | Forged logout requests |
| Verified-email requirement for linking | both | Account takeover by registering the victim's email |
| Already-linked and admin-takeover refusals | both / DSG | One identity grabbing another's account or a staff record |
| Per-page admin check | OTT | The layout-bypass bug (section 9) |
| Roles overwritten at every login | both | Stale or over-privileged roles in the app database |
| App databases bound to 127.0.0.1 | Docker | Exposing demo databases to the network |

What is **not** solved yet: DSG token readable by page scripts (Phase 2), no Content-Security-Policy, MFA available but not required for staff, plain HTTP locally.

---

## 14. Every file and what it does

### Root

| File | Purpose |
| --- | --- |
| `docker-compose.yml` | Authentik (server, worker, PostgreSQL) plus `ott-db` and `dsg-db`. Based on Authentik's official compose file, versions pinned, Docker socket removed. |
| `blueprints/vyoma-sso-demo.yaml` | All Authentik configuration (section 4). |
| `blueprints/google-source.yaml` | Optional Google source (section 12). |
| `scripts/setup.mjs` | Generates every secret and writes `.env`, `ott/.env` and `dsg/backend/.env`. Safe to re-run: keeps existing values, adds missing ones. Prints the demo logins. |
| `package.json` | `setup`, `up`, `down`, `reset`, `google:apply`, `db:init`, `build`, `start`, `dev`, `test`. |
| `.env.example`, `ott/.env.example`, `dsg/backend/.env.example` | Document the variables. Real `.env` files are git-ignored. |
| `README.md` | Setup steps, demo users, nine-step demo script, mapping to the plans, troubleshooting. |

### OTT (`ott/`)

| File | Purpose |
| --- | --- |
| `prisma/schema.prisma` | `User` (+ `authentikId` unique), `Course`, `Purchase`, `Progress`, and new `SessionRevocation`. |
| `prisma/seed.mjs` | Resets to the "before SSO" state: 4 courses, Meera (GOLD, purchase, progress), Asha (SUPER_ADMIN), Ravi (ADMIN, deliberately too high). |
| `src/lib/oidc.ts` | Issuer, client ID, redirect URIs, scopes; cached discovery; `safeReturnTo()`. |
| `src/lib/session.ts` | Seal/open the encrypted `vyoma_session` cookie; cookie options. No Node-only imports, so `proxy.ts` can use it. |
| `src/lib/auth.ts` | `verifyAuthentikToken()` (JWKS), `getSession()` (with revocation check), `getCurrentUser()`. |
| `src/lib/roles.ts` | Staff roles, page rules per role, `canWatch()` entitlement. |
| `src/lib/adminGuard.tsx` | `requireAdminAccess(path)`: per-page admin check and the "Restricted" panel. |
| `src/lib/prisma.ts`, `format.ts` | Prisma client singleton; display helpers. |
| `src/proxy.ts` | Route guard for `/admin`, `/profile`, `/watch`; sets `x-pathname`. |
| `src/app/api/auth/login/route.ts` | Start SSO (section 5, step 1). |
| `src/app/api/auth/callback/route.ts` | Finish SSO, link user, set session (step 3). |
| `src/app/api/auth/logout/route.ts` | Revoke, clear cookie, redirect to end-session. |
| `src/app/api/auth/backchannel-logout/route.ts` | Verify Authentik's logout token, revoke the `sid`. |
| `src/app/api/auth/status/route.ts` | `{ authenticated, user }` for the nav bar, as today. |
| `src/app/login/page.tsx` | "Sign in with Vyoma SSO" button and error messages. |
| `src/app/page.tsx`, `profile/page.tsx`, `watch/[id]/page.tsx` | Catalogue, profile (plan, purchases, progress), player with lock overlay. |
| `src/app/admin/*` | Dashboard, Courses, Users, Invoices; each calls `requireAdminAccess`. `layout.tsx` only draws the sidebar. |
| `src/components/NavBar.tsx`, `AdminNav.tsx` | Header with role badge and logout form; admin sidebar that marks pages the role can't open with a lock. |

### DSG backend (`dsg/backend/`)

| File | Purpose |
| --- | --- |
| `server.js` | Express app: JSON, cookies, routes, `/api/health`; connects to MongoDB first. `trust proxy` for the Vite proxy. |
| `services/oidcClient.js` | Discovery, `buildAuthUrl()`, `handleCallback()`, `endSessionUrl()`, `verifyAuthentikJwt()`. Loads ESM libraries with `import()` from CommonJS. |
| `routes/oidcRoutes.js` | `/login`, `/callback`, `/exchange`, `/logout`, `/backchannel-logout` (section 6 and 8). |
| `routes/authRoutes.js` | `/me` and `profile()`. Old `/login`, `/register`, `/forgot-password`, `/reset-password`, `/google` return 410 in `sso_only`. |
| `routes/orderRoutes.js`, `adminRoutes.js` | My orders; admin dashboard, orders, coupons, users, each behind `requireAdminPage` or `requireSuperAdmin`. |
| `middleware/authMiddleware.js` | `protect`: Bearer HS256, user not blocked/deleted, `tokenVersion` matches. |
| `middleware/adminMiddleware.js` | `admin`, `requireSuperAdmin`, `requireAdminPage(key)`. Unchanged by SSO. |
| `models/User.js` | Existing fields + `authentikSub` (partial unique index), `authSource`, `ssoLinkedAt`, `ssoIdToken`. |
| `models/SsoLoginCode.js` | Hashed one-time codes with a TTL index. |
| `models/Order.js`, `AdminAuditLog.js` | Orders; audit log of links, refusals, logins and logouts. |
| `utils/ssoState.js` | Signed state cookie, `safeReturnTo()`. |
| `utils/ssoLinking.js` | `decideLink()` (section 10). |
| `utils/ssoRoles.js` | `rolesFromClaims()`, `isStaffClaim()` (section 9). |
| `utils/sessionToken.js` | Issues DSG's HS256 token, 8 h staff / 12 h customers. |
| `config/adminPages.json` | The admin page keys. |
| `scripts/seed.js` | Resets to "before SSO": Meera with 2 orders, Asha (level 1), Ravi (4 pages). Refuses any database other than `:27018/dsg_demo`. |
| `tests/*.test.js` | 18 `node:test` unit tests for linking, roles and the state cookie. |

### DSG frontend (`dsg/src/`)

| File | Purpose |
| --- | --- |
| `context/AuthContext.jsx` | Session in `sessionStorage`; checks `/me` on load (401 clears it); `loginWithSso()`, `completeSso()`, `logout()`. |
| `pages/Login.jsx` | "Continue with Vyoma account" and `?sso=` error messages. |
| `pages/AuthCallback.jsx` | Exchanges the one-time code, then goes to `returnTo`. |
| `pages/Home.jsx`, `MyLibrary.jsx` | Store home; the user's orders. |
| `pages/admin/*`, `components/AdminRoute.jsx`, `ProtectedRoute.jsx`, `Navbar.jsx` | Admin screens and route guards (display only; the API is authoritative). |
| `vite.config.js` | Port 5173, proxies `/api` to `127.0.0.1:5001`. |

---

## 15. Configuration and secrets

`npm run setup` (`scripts/setup.mjs`) writes three files with mode 600. None are committed.

| File | Variables | Used by |
| --- | --- | --- |
| `.env` | `PG_PASS`, `AUTHENTIK_SECRET_KEY`, `OTT_DB_PASS`, `OTT_CLIENT_SECRET`, `DSG_CLIENT_SECRET`, `DEMO_*_PASSWORD`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Docker Compose and the blueprints (`!Env`) |
| `ott/.env` | `DATABASE_URL`, `AUTHENTIK_ISSUER`, `AUTHENTIK_CLIENT_ID`, `AUTHENTIK_CLIENT_SECRET`, `SESSION_SECRET`, `NEXT_PUBLIC_APP_URL`, `DSG_URL` | OTT (names from `ott-sso.md` section 12) |
| `dsg/backend/.env` | `PORT`, `MONGO_URI`, `JWT_SECRET`, `SSO_MODE`, `OIDC_ISSUER_URL`, `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET`, `OIDC_REDIRECT_URI`, `OIDC_REDIRECT_BASE`, `OIDC_POST_LOGOUT_REDIRECT_URI`, `OIDC_SCOPES`, `OIDC_ROLES_CLAIM`, `OIDC_STATE_SECRET`, `SSO_STAFF_SESSION_HOURS`, `OTT_URL` | DSG API (names from `dsg-sso.md` section 8) |

The client secrets appear twice on purpose: Authentik reads them from `.env` through the blueprint, and each app reads its own copy. They must match.

---

## 16. Running, resetting and testing

```bash
npm run setup                 # secrets + npm install everywhere
npm run up                    # Authentik + both databases
# first time only: open http://localhost:9000/ and create the akadmin user
npm run db:init               # create OTT tables, seed OTT and DSG
npm run build && npm start    # OTT :3000, DSG API :5001, DSG SPA :5173
```

- `npm run db:init` resets both app databases to the "before SSO" state. Run it before every demo.
- `npm run down` stops containers and keeps data. `npm run reset` also deletes all three databases' volumes.
- `npm test` runs DSG's 18 unit tests.
- The end-to-end checks (58 browser checks across all five users and both logout directions, 15 Google checks, and the 9-step demo script) were run with Playwright against the real services during development, on a separate Docker project so the main data wasn't touched. They are not committed as a test suite.

Demo users and their passwords are printed by `npm run setup` and stored in `.env`:

| User | Authentik groups | Before SSO | After SSO |
| --- | --- | --- | --- |
| `asha.admin` | `vyoma-superadmins`, `dsg-super-admin` | OTT SUPER_ADMIN, DSG level 1 | Same |
| `ravi.manager` | `vyoma-managers`, `dsg-staff`, `dsg-page-orders` | OTT ADMIN, DSG 4 pages | OTT MANAGER, DSG Dashboard + Orders |
| `priya.finance` | `vyoma-finance` | Not in either app | OTT FINANCE (created), DSG customer (created) |
| `meera.learner` | `vyoma-users` | OTT GOLD + purchase + progress, DSG 2 orders | Same data, now linked |
| `kiran.new` | `vyoma-users` | Not in either app | New FREE user / new customer |

---

## 17. Where the demo differs from the plans

| Plan says | Problem | Demo does |
| --- | --- | --- |
| Scope mappings use `user.ak_groups` | Removed in Authentik 2026.8; the role claim fails | `request.user.groups.all()` |
| Link existing accounts on a verified email (DSG) | Authentik's built-in mapping always sends `email_verified: false`, so nobody links | Custom email mapping with a real per-user flag |
| OTT callback only raises roles | Removing someone in Authentik never demotes them | Always overwrites the role |
| OTT links any matching email | An unverified Authentik account could take over an OTT record | Requires `email_verified` |
| OTT route guard in `middleware.ts` | Renamed to `proxy.ts` in Next.js 16 | `src/proxy.ts` |
| Admin rules in `admin/layout.tsx` | Skipped on client-side navigation (section 9) | Per-page `requireAdminAccess` |
| Providers created in the admin UI | Blueprint-created providers get no grant types; every login fails | `grant_types: [authorization_code]` |
| OTT logout deletes the cookie | A copied cookie keeps working | Also revokes the `sid` |
| Back-channel logout is open question Q9 (DSG) | — | Works on 2026.8.5; both apps use it |

---

## 18. What is not built, and known limits

Not built (in the plans, left out of the prototype):

- **Running old and new login side by side** (`ENABLE_AUTHENTIK_SSO` / `ENABLE_LEGACY_LOGIN` in OTT, `SSO_MODE=both` in DSG). The demo runs SSO only.
- **Importing existing users into Authentik** and **migrating passwords**. See [`migration-plan.md`](migration-plan.md).
- **Silent refresh / periodic role re-check** (OTT plan 7.2, DSG plan 4.5). Role changes apply at next sign-in.
- **DSG Phase 2**: HttpOnly cookie instead of `sessionStorage`, plus a Content-Security-Policy.
- **OTT media protection**: signed CDN URLs, concurrent-stream limits, the open video and offline proxies.
- **Mobile and TV apps** (OTT plan section 8: native PKCE and device authorization grant).
- **Authentik policies**: required MFA for staff, customer self-registration with captcha, branding.
- **Production hosting**: HTTPS, real domain (e.g. `auth.vyoma.org`), backups, monitoring, per-environment signing keys.

Known limits of the demo:

- Plain HTTP on localhost, so cookies aren't `Secure`.
- OTT shows a consent screen on first sign-in (the OTT plan asks for it; DSG doesn't).
- Back-channel logout needs the Authentik worker to reach the apps; in production, the apps' back-channel URLs must be reachable from wherever Authentik runs.
- If Authentik is down, people who are already signed in keep working (each app has its own session), but nobody can sign in.

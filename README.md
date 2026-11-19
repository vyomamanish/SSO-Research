# Vyoma SSO demo: OTT 2.0 and DSG 2.0 with Authentik

A working version of the two integration plans, `ott-sso.md` and `dsg-sso.md`. Each app is built the way its plan recommends, with the same file names, routes, variable names and Authentik settings, so the code can be used as a reference when changing the real apps.

A user signs in once with their Vyoma account and uses both apps. Existing users keep their plans, purchases and orders. Staff roles come from Authentik groups, and logging out of one app logs out of both.

| Service | URL | Built like |
| --- | --- | --- |
| Authentik | http://localhost:9000 | The shared Vyoma identity provider |
| Vyoma OTT | http://localhost:3000 | OTT 2.0: Next.js 16 App Router, Prisma, PostgreSQL |
| Digital Sanskrit Guru | http://localhost:5173 | DSG 2.0: React + Vite SPA, with Express and MongoDB behind it on port 5001 |

How the pieces fit together, with diagrams of sign-in and logout, is in [docs/architecture.md](docs/architecture.md).

The demo runs only on this machine, with its own databases. It never connects to a real OTT or DSG database. DSG's MongoDB uses port **27018**, so it can't collide with a MongoDB already running on the default port 27017.

## Setup

You need Docker running and Node.js 20.19 or later.

### 1. Generate secrets and install

```bash
npm run setup
```

This writes `.env`, `ott/.env` and `dsg/backend/.env`, then installs every package. It prints the five demo logins, which are also kept in `.env`. Re-running it keeps existing values and only adds missing ones.

### 2. Start Authentik and the databases

```bash
npm run up
```

Wait about 90 seconds, until this returns JSON:

```bash
curl http://localhost:9000/application/o/vyoma-ott/.well-known/openid-configuration
```

### 3. Create the Authentik admin (first time only)

Open **http://localhost:9000/**, enter an email and password for `akadmin`, and continue. Start from the root URL: opening `/if/flow/initial-setup/` directly shows "Request has been denied". If you see a login page instead, this is already done.

### 4. Load the demo data

```bash
npm run db:init
```

This creates OTT's tables and puts both databases into their "before SSO" state. Run it again before each demo to start fresh.

### 5. Build and start

```bash
npm run build
npm start
```

`npm run dev` also works, with hot reload.

### Optional: Sign in with Google

Both plans move Google sign-in into Authentik as a **source**, instead of a Google button in each app (dsg-sso.md 5.5). Once you set it up, a **Google** button appears on the Vyoma login page under the password form, and it works for OTT, DSG and any future app. Neither app has any Google code.

**1. Create a Google OAuth client** (about 5 minutes, needs a Google account):

1. Open https://console.cloud.google.com/ and create or select a project.
2. Open the Google Auth Platform at https://console.cloud.google.com/auth/overview and click **Get started**. Enter an app name, such as "Vyoma SSO (local demo)", and your email. For **Audience**, choose **External**.
3. While the app is in **Testing** status, only listed accounts can sign in. Open https://console.cloud.google.com/auth/audience and add each Google account you'll use under **Test users**.
4. Open https://console.cloud.google.com/auth/clients, click **Create client**, and choose **Web application**.
5. Under **Authorized redirect URIs**, add exactly:

   ```text
   http://localhost:9000/source/oauth/callback/google/
   ```

6. Click **Create**, then copy the **Client ID** and **Client secret**.

**2. Add them to `.env`** in this folder. The empty keys are already there:

```bash
GOOGLE_CLIENT_ID=1234567890-abc.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-...
```

Keep the secret in `.env`, which git ignores, and don't paste it into chat or commit it.

**3. Turn it on:**

```bash
npm run google:apply
```

This restarts Authentik's worker with the new values and applies `blueprints/google-source.yaml`. It takes about a minute and prints nothing when it succeeds. Then open http://localhost:3000, click **Sign in with Vyoma SSO**, and choose **Google**.

**What happens to Google users:**

- **Existing accounts:** a Google account whose email matches an existing Vyoma account signs in as that person. For example, if your Gmail matched Meera's email, you'd see her GOLD plan.
- **New users:** anyone else gets a new Vyoma account, with their email as the username and no extra prompts. OTT then creates a FREE account, and DSG creates a customer account.
- **Verification:** Google confirms the email is verified. OTT and DSG require that before linking to an existing record.

To turn Google off, empty both keys, then delete the **Google** source under **Directory > Federation and Social login** in the Authentik admin.

### Upgrading from the earlier version of this demo

The earlier demo (two Next.js apps on ports 3001 and 3002) is in this repository's first commit. To switch an existing install to this version, run:

```bash
npm run setup
npm run up
npm run db:init
npm run build
npm start
```

Your Authentik admin login is kept, so skip setup step 3. On startup the blueprint deletes the old demo apps and users from Authentik.

## The demo users

| Login | Authentik groups | Already in OTT | Already in DSG |
| --- | --- | --- | --- |
| `meera.learner` | `vyoma-users` | GOLD yearly plan, 1 purchase, 2h 14m of watch progress | Customer with 2 orders |
| `ravi.manager` | `vyoma-managers`, `dsg-staff`, `dsg-page-orders` | Legacy role `ADMIN` | Staff with 4 pages |
| `asha.admin` | `vyoma-superadmins`, `dsg-super-admin` | `SUPER_ADMIN` | Super Admin |
| `priya.finance` | `vyoma-finance` | No | No |
| `kiran.new` | `vyoma-users` | No | No |

The passwords are in `.env` (`DEMO_MEERA_PASSWORD` and so on), and `npm run setup` prints them.

## Demo script

**Prepare:** run `npm run db:init`, then open a private window with two tabs: http://localhost:3000 (OTT) and http://localhost:5173 (DSG).

### Part 1: One login, existing data kept

1. **OTT tab:** click **Sign in**, then **Sign in with Vyoma SSO**. Log in as `meera.learner`.
   - The first time each user signs in to OTT, Authentik asks them to approve access. Click **Continue**. OTT's plan asks for this consent screen, and DSG's plan doesn't.
   - *Say: "OTT no longer checks passwords. Vyoma SSO did that and told OTT who Meera is."*
2. OTT says **Your plan: GOLD**. Click **Meera Iyer** at the top to open the profile.
   - *Say: "Her plan, purchase and watch history were already in OTT's database. On first sign-in, OTT matched her by email and linked her Vyoma account. Nothing was migrated or lost."*
3. Go back to the catalogue. Open **Bhagavad Gita Intensive**, which resumes at 2h 14m. Then open **Advanced Vedic Chanting**, which is locked.
   - *Say: "Vyoma SSO says who you are. OTT still decides what you've paid for."*
4. **DSG tab:** click **Continue with Vyoma account**. You're signed in with no password. Click **My library** to see her 2 orders.
   - *Say: "A different app with a different database, and no second login. DSG found her existing customer record too."*

### Part 2: Roles come from Vyoma SSO

5. **DSG tab:** click **Log out**. **OTT tab:** refresh. You're signed out there too.
6. **OTT tab:** sign in as `ravi.manager`. The header shows **MANAGER**. Click **Admin**.
   - Open **Courses**: allowed. Open **Users**: **Restricted**.
   - *Say: "OTT's old database had Ravi as ADMIN. Vyoma SSO says MANAGER, and Vyoma SSO wins, so access is managed in one place."*
7. **DSG tab:** click **Continue with Vyoma account**, then **Admin**.
   - Open **Orders**: allowed. Open **Coupons**: **403 from the DSG API**.
   - *Say: "DSG gives page-level access from Vyoma SSO groups, and the server enforces it, not just the screen."*

### Part 3: Log out everywhere

8. **OTT tab:** click **Log out**. You land on OTT's sign-in page.
9. **DSG tab:** refresh. You're signed out.
   - *Say: "One logout ended both sessions. Authentik told DSG server-to-server, so a copied DSG token stops working too."*

### Optional Part 4: Google

If you've set up Google, sign in to OTT with **Google** on the Vyoma login page, then open DSG and click **Continue with Vyoma account**. You're signed in without signing in to Google again.
- *Say: "Google is just another way to prove who you are to Vyoma SSO. The apps didn't change at all."*

**Close:** "One account and one place to manage access, while each app keeps its own data. This is the code shape both plans describe."

If something looks wrong mid-demo, run `npm run db:init` and use a new private window.

## How each plan maps to the code

### OTT (`ott-sso.md`)

| Plan | Here |
| --- | --- |
| 4.1: native OIDC with `openid-client` and `jose`, not Auth.js | `ott/src/lib/oidc.ts`, `ott/src/lib/auth.ts` |
| 3.2: code flow with PKCE, state and nonce in HttpOnly cookies | `ott/src/app/api/auth/login/route.ts` |
| 10.1 C: callback, ID token checked against JWKS, link by `authentikId` then email | `ott/src/app/api/auth/callback/route.ts` |
| 4.3: encrypted `vyoma_session` cookie replaces `user_email` | `ott/src/lib/session.ts` |
| 4.4: RP-initiated logout to `/login` | `ott/src/app/api/auth/logout/route.ts` |
| 4.4: back-channel logout | `ott/src/app/api/auth/backchannel-logout/route.ts` |
| 10: route guard in `src/middleware.ts` | `ott/src/proxy.ts` (Next.js 16 renamed the file) |
| 2.4: admin roles and MANAGER/FINANCE restrictions | `ott/src/app/admin/layout.tsx`, `ott/src/lib/roles.ts` |
| 10.1 A: `authentikId` on `User` | `ott/prisma/schema.prisma` |
| 9: provider `vyoma-ott-platform`, slug `vyoma-ott`, `vyoma_roles` scope | `blueprints/vyoma-sso-demo.yaml` |

### DSG (`dsg-sso.md`)

| Plan | Here |
| --- | --- |
| 4.1: backend-for-frontend on Express with `openid-client` | `dsg/backend/services/oidcClient.js` |
| 6.1: `/api/auth/oidc/login`, `/callback`, `/exchange`, `/logout` | `dsg/backend/routes/oidcRoutes.js` |
| 4.3 Phase 1: 60-second single-use code, then today's DSG JWT | `dsg/backend/models/SsoLoginCode.js`, `dsg/src/pages/AuthCallback.jsx` |
| 5.6: `dsg_roles` to `isAdmin`, `adminLevel`, `allowedPages` | `dsg/backend/utils/ssoRoles.js` |
| 7.1: link by sub, then verified email, with refusals | `dsg/backend/utils/ssoLinking.js` |
| 6.1: signed state cookie, safe `returnTo` | `dsg/backend/utils/ssoState.js` |
| 2.6: `protect` and `adminMiddleware`, with `tokenVersion` revocation | `dsg/backend/middleware/` |
| 10.2: `node:test` tests for the pure functions | `dsg/backend/tests/` (run `npm test`) |
| 6.2: `loginWithSso` and the new `logout` in `AuthContext` | `dsg/src/context/AuthContext.jsx` |
| 5: provider and app `dsg-dev`, `dsg` scope, implicit consent | `blueprints/vyoma-sso-demo.yaml` |

## Changes from the plans

Building the plans against Authentik 2026.8.5 turned up these issues. Each one is fixed here and marked in the code.

| Plan says | Problem | What this demo does |
| --- | --- | --- |
| Both: scope mappings use `user.ak_groups` | Authentik 2026.8 removed `ak_groups` | Uses `request.user.groups` |
| DSG 7.1: link by email only if `email_verified` is true | Authentik's built-in email mapping always sends `false`, so every existing user would be refused | A custom email mapping reports a real per-user flag |
| OTT 10.1 C: link any matching email | An unverified account could take over someone's OTT record | Also requires `email_verified` |
| OTT 10.1 C: only raise roles (`assignedRole !== 'USER' ? ...`) | Removing someone from a staff group in Authentik would never demote them | Always copies the role from Authentik |
| OTT 10: `src/middleware.ts` | Deprecated in Next.js 16 | `src/proxy.ts` |
| OTT 14.1: compose file with Redis and Authentik 2024.8 | Redis is no longer used | Official 2026.8.5 compose file, plus the two app databases |
| DSG 4.6, Q9: back-channel logout unconfirmed | Authentik 2026.8.5 supports it | Both apps use it, so logout reaches the other app |
| Both: configured in the admin UI | A provider created by a blueprint has no grant types and rejects every login | The blueprint sets `grant_types: [authorization_code]` |
| OTT 4.4: logout only deletes the cookie | A copied cookie would keep working | Logout also revokes the session ID on the server |
| Both: `sub` mode | The two plans differ | Both use `user_uuid`, so a person has the same ID in every app |
| DSG 5.5: Google Source | Google sends no username or `email_verified`, so new users would stop at a username prompt, and the apps would refuse to link them | A Google property mapping sets the username to the email and copies Google's `verified_email` flag |

## Not included

These parts of the plans are left out, to keep the demo focused on sign-in, roles and logout:

- **Rollout flags:** dual login (`SSO_MODE=both`, `ENABLE_LEGACY_LOGIN`) isn't built. Legacy password routes answer 410.
- **Silent refresh:** OTT's refresh in `proxy.ts` and DSG's refresh-token re-check aren't built. Sessions simply last 7 days (OTT) or 8 to 12 hours (DSG).
- **OTT playback features:** CDN URL signing, concurrent-stream limits and the heartbeat aren't built.
- **DSG Phase 2:** the HttpOnly cookie and CSP aren't built.
- **Authentik extras:** customer self-registration, captcha, required staff MFA, a DSG brand and SCIM or webhook deprovisioning aren't configured. Google sign-in is optional; see setup. MFA can still be enrolled by hand at http://localhost:9000/if/flow/default-authenticator-totp-setup/.

## Troubleshooting

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| "Vyoma SSO isn't reachable" | Authentik isn't up yet | Wait for the check in setup step 2 |
| "That sign-in link expired" right after logging in | You opened the app at `127.0.0.1`, so its cookies were set for a different host than the callback | Use `localhost` |
| "Redirect URI Error" in Authentik | A redirect URI in the app's `.env` doesn't match the provider exactly | Compare the redirect values in `ott/.env` or `dsg/backend/.env` with that folder's `.env.example` |
| OTT shows "Sign-in couldn't be completed" | The token exchange failed | Check the `ott` lines in the terminal. `ott/.env` must have `AUTHENTIK_ISSUER` with its trailing slash |
| DSG API exits with "can't reach MongoDB" | The `dsg-db` container isn't running | Run `npm run up` |
| OTT shows an error page, with a Prisma error in the terminal | `ott-db` isn't running, or the tables don't exist | Run `npm run up`, then `npm run db:init` |
| No password prompt, or the wrong user | Authentik's login cookie is shared by every `localhost` app | Log out, or use a new private window |
| The other app still shows you signed in | It hasn't reloaded since you logged out | Refresh it. If that doesn't help, check **Dashboards > System Tasks** in the Authentik admin for `send_backchannel_logout_request` errors |
| DSG asks you to sign in in a new tab | DSG keeps its token in `sessionStorage`, as DSG does today | Click **Continue with Vyoma account**. No password is needed |
| No Google button on the login page | The keys are empty, or the blueprint hasn't been applied | Check both `GOOGLE_` keys in `.env`, then run `npm run google:apply` and wait for it to finish |
| Google says "Error 400: redirect_uri_mismatch" | The redirect URI in Google Cloud isn't exact | Use `http://localhost:9000/source/oauth/callback/google/`, with `http`, port 9000 and the trailing slash |
| Google says "The OAuth client was not found" (invalid_client) | The client ID is wrong, or the client was deleted | Copy it again from Google Cloud, then run `npm run google:apply` |
| Google says "Access blocked" or that the app is in testing | Your account isn't a test user | Add it under **Test users** on the Audience page |
| Blueprint changes don't apply | Authentik only re-reads the file on discovery | Run `docker compose restart worker` |

To wipe everything, including Authentik, run `npm run reset`, then repeat setup steps 2 to 4.

## Pinned versions

| Component | Version | Note |
| --- | --- | --- |
| Authentik | 2026.8.5 | |
| PostgreSQL | 16.15 | Authentik and OTT |
| MongoDB | 8.0.38 | DSG |
| Next.js | 16.2.12 | The version OTT 2.0 runs |
| Prisma | 6.2.1 | The version OTT 2.0 runs |
| React | 19.3.1 | Both apps |
| Vite | 7.3.8 | |
| React Router | 7.18.6 | |
| Express | 5.3.0 | |
| Mongoose | 9.12.2 | |
| openid-client | 6.9.0 | |
| jose | 6.2.18 | |

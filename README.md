# Vyoma SSO demo with Authentik

A user signs in once through Authentik, then opens a second app without entering a password again. The demo also shows role-based access and a logout that ends the session in both apps.

| Service | URL | Purpose |
| --- | --- | --- |
| Authentik | http://localhost:9000 | Identity Provider |
| OTT Demo (`app-a`) | http://localhost:3001 | First app; also calls the API |
| DSG Demo (`app-b`) | http://localhost:3002 | Second app |
| Express API (`api`) | http://localhost:4000/api/me | Backend that trusts the same login |

## Setup

You need Docker running, and Node.js 20.9 or later. First boot takes about 2 minutes, plus image download time.

### 1. Generate secrets and install dependencies

```bash
npm run setup
```

This creates `.env`, `app-a/.env.local` and `app-b/.env.local` with random secrets, then installs all dependencies. It prints the two demo logins, which are also in `.env` as `DEMO_ADMIN_PASSWORD` and `DEMO_STAFF_PASSWORD`. Re-running it keeps existing files.

### 2. Start Authentik

```bash
npm run up
```

Compose starts PostgreSQL, the Authentik server and the Authentik worker. Current Authentik doesn't need Redis. The worker then applies `blueprints/vyoma-sso-demo.yaml`, which creates all the configuration in the [next section](#what-the-blueprint-configures).

Wait until this returns JSON rather than a 404:

```bash
curl http://localhost:9000/application/o/ott-demo/.well-known/openid-configuration
```

### 3. Create the Authentik admin

1. Open **http://localhost:9000/**. It redirects you to the setup form.
2. Enter an email and a password for the built-in `akadmin` user.
3. Keep the base URL as `http://localhost:9000`, then continue.

> Start from `http://localhost:9000/`. On Authentik 2026.8.5, opening `/if/flow/initial-setup/` directly shows "Request has been denied".

### 4. Build and start the apps

```bash
npm run build
npm start
```

Use this production build for the meeting because pages load instantly. `npm run dev` also works, but compiles each page on first visit.

## What the blueprint configures

The blueprint is Authentik's infrastructure-as-code format, so nobody has to click through setup. You can show each result in the admin UI at http://localhost:9000/if/admin/.

| What | Value | Where to show it |
| --- | --- | --- |
| Groups | `vyoma-admins`, `vyoma-staff` | Directory > Groups |
| Admin test user | `vyoma.admin` (Asha Admin), in both groups | Directory > Users |
| Staff test user | `vyoma.staff` (Sam Staff), in `vyoma-staff` | Directory > Users |
| Scope mappings | `groups`, plus a `profile` that leaves groups out | Customization > Property Mappings |
| OIDC providers | `OTT Demo provider`, `DSG Demo provider` | Applications > Providers |
| Applications | `ott-demo`, `dsg-demo` | Applications > Applications |

Each provider's settings matter for a specific part of the demo:

| Setting | Value | Why |
| --- | --- | --- |
| Authorization flow | `default-provider-authorization-implicit-consent` | No consent screen, so the second app signs in without a prompt |
| Invalidation flow | `default-invalidation-flow` | Contains the logout stage that ends the Authentik session |
| Grant types | `authorization_code` | An empty list rejects every login |
| Redirect URIs | `/api/auth/callback/authentik` and `/` | The login callback, and where logout returns to |
| Signing key | Self-signed certificate | RS256 publishes public keys, which the API verifies against |
| Logout method and URI | Back-channel, `http://host.docker.internal:<port>/api/backchannel-logout` | Authentik tells every app in the session when it ends |
| Access token validity | 1 hour | The 5-minute default could expire mid-demo |

To change the configuration, edit the blueprint and run `docker compose restart worker`.

### How logout reaches both apps

Logging out takes two mechanisms:

1. **RP-initiated logout:** the app clears its own cookie and sends the browser to Authentik's end-session endpoint, which ends the SSO session.
2. **Back-channel logout:** Authentik then sends a signed `logout_token` to every app in that session. Each app verifies it and revokes that session ID.

Without the second step, the other app would stay signed in, because its session is its own cookie. The revocation applies on that app's next page load, so refresh the page to see it.

## Demo script

**Prepare:** start everything, open a private window, and open http://localhost:3001 in the first tab and http://localhost:3002 in the second. Have both passwords ready. A private window matters because cookies from an earlier test can make the first login skip the password step.

### Part 1: Single sign-on

1. In the **OTT** tab, click **Sign in with Vyoma SSO**.
   > "The app doesn't handle passwords. It hands off to Authentik, our central identity provider."
2. Sign in as `vyoma.staff`. You land back on OTT Demo showing the name, email and groups.
   > "Authentik returned a signed token saying who this user is and which groups they belong to."
3. Point to the **Backend API** card.
   > "A separate backend verified the same login using Authentik's public keys. It never saw a password."
4. Switch to the **DSG** tab, which still shows signed out, and click **Sign in with Vyoma SSO**. You're signed in with no password prompt.
   > "This is a different app with its own session. Authentik already knew who I was, so I didn't log in again."

### Part 2: Role-based access

5. On DSG Demo, click **Admin page (restricted)**. You see **Admins only**.
   > "Sam is authenticated but not authorized, because the `vyoma-admins` group isn't in the token."
6. Click **Back to home**, then **Log out everywhere**.
7. In the **OTT** tab, refresh. It's signed out too.
8. Click **Sign in with Vyoma SSO** and sign in as `vyoma.admin`. The password is required again, which proves the Authentik session ended.
9. Click **Admin page**. You see the **OTT admin console**.
   > "Same app, same page, but a different group gives a different result. Roles are managed in one place."

### Part 3: Logout everywhere

10. In the **DSG** tab, refresh and click **Sign in with Vyoma SSO**. Again there's no password prompt.
11. In the **OTT** tab, click **Back to home**, then **Log out everywhere**. You return to OTT Demo, signed out.
12. In the **DSG** tab, refresh. It's signed out too.
    > "I logged out of one app, and Authentik told the other app to end its session as well."

If you want to prove the session is really gone, click **Sign in with Vyoma SSO** once more and show that Authentik asks for a password.

## Optional: TOTP MFA for the admin

This is safest as a separate step, because it adds a code prompt to every admin login afterwards.

1. Sign in to an app as `vyoma.admin`.
2. In the same browser, open http://localhost:9000/if/flow/default-authenticator-totp-setup/.
3. Scan the QR code with an authenticator app, enter the 6-digit code, and continue.
4. Log out, then sign in as `vyoma.admin` again. After the password, Authentik asks for an authentication code.

Only the admin is affected, because Authentik's default login flow asks for a code only from users who have a device enrolled. Each code works once, so wait for a new one if you've just used it. To remove MFA, delete the device under **Credentials** in the Authentik user settings, or run `npm run reset`.

## Troubleshooting

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| "Redirect URI Error" in Authentik | The app's callback doesn't exactly match the provider | Open the app at `localhost`, not `127.0.0.1`. The URI must be `http://localhost:3001/api/auth/callback/authentik`, or port 3002 for DSG |
| `/api/auth/signin?error=OAuthCallbackError` | Authentik refused the login request | Run `docker compose logs server \| grep "Invalid grant_type"`. A match means `grant_types` is missing from the provider |
| `/api/auth/error?error=Configuration`, with `"issuer" property does not match` in the app logs | The issuer doesn't match Authentik's | `AUTH_AUTHENTIK_ISSUER` needs its trailing slash, unlike the example in the Auth.js docs: `http://localhost:9000/application/o/ott-demo/` |
| `/api/auth/error?error=Configuration`, with a fetch error in the app logs | The app can't reach Authentik | Start Authentik and wait for the check in setup step 2 to pass |
| "Request has been denied" during setup | `/if/flow/initial-setup/` was opened directly | Start from http://localhost:9000/ |
| Signed in as the wrong user, or no password prompt | The Authentik session cookie is shared across all `localhost` ports | Log out, or use a new private window |
| Sign-in loops or a state or PKCE error | Stale cookies; browsers ignore ports when scoping cookies, so all apps share one jar | Clear `localhost` cookies. Each app prefixes its cookies with `ott.` or `dsg.`, so keep those distinct |
| The other app stays signed in after logout | The worker couldn't reach the app, or the page wasn't refreshed | Refresh first. Then open **Dashboards > System Tasks** in the admin UI and look for `send_backchannel_logout_request` errors. On Linux, check that your firewall allows Docker to reach ports 3001 and 3002 |
| Logout stops on an Authentik page | The logout redirect isn't registered | The provider needs `http://localhost:<port>/` as a redirect URI of type `logout` |
| The API card says the token was rejected | The access token expired after 1 hour, or Authentik was reset | Log out and sign in again |
| No groups are shown | The token was issued before a scope change | Log out and sign in again |
| Blueprint changes don't apply | The file is only re-read on discovery | Run `docker compose restart worker`, then check **Customization > Blueprints** in the admin UI |

To start again from an empty Authentik, run `npm run reset`, then repeat steps 2 and 3. Users and TOTP devices are removed; your `.env` passwords are kept. `npm run down` stops Authentik and keeps its data.

## Demo limits

These are deliberate shortcuts, which a production deployment would need to replace:

- **Revocation list:** it's held in each app's memory, so restarting an app forgets it. Use Redis or a database in production.
- **HTTP:** everything runs on plain `localhost` HTTP. Production needs HTTPS and secure cookies.
- **Token refresh:** the apps don't refresh tokens. Sessions and access tokens simply last 1 hour.
- **Back-channel URL:** `host.docker.internal` only suits local Docker. Production uses real service URLs.
- **Page-level checks:** the admin check runs on the `/admin` page only. A real app should also enforce roles on its APIs.

## Pinned versions

Checked on 2026-11-01. Every npm package is pinned to an exact version, with lockfiles.

| Component | Version |
| --- | --- |
| Authentik | 2026.8.5 |
| PostgreSQL | 16.15 |
| Next.js | 16.4.3 |
| React | 19.3.1 |
| Auth.js (`next-auth`) | 5.0.0-beta.32 |
| Express | 5.3.0 |
| jose | 6.2.14 |

Auth.js v5 is still published as a beta, so `5.0.0-beta.32` is the current release under the `beta` tag.

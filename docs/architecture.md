# Architecture

One Vyoma account works for every app. Authentik checks who you are, and each app keeps its own data and its own session. This page shows how the demo in this repository fits together. The code follows `ott-sso.md` and `dsg-sso.md`.

## How the pieces connect

The browser talks to all three services. Each app swaps a login code for tokens with Authentik server-to-server, and Authentik calls the apps back when a session ends.

```mermaid
flowchart TB
    browser["Browser<br/>localhost:3000 and localhost:5173"]

    subgraph OTT["Vyoma OTT · Next.js 16 · :3000"]
        ottGuard["proxy.ts · route guard"]
        ottAuth["/api/auth/login · callback · logout"]
        ottBcl["/api/auth/backchannel-logout"]
    end

    subgraph AK["Authentik 2026.8.5 · :9000"]
        akServer["server · OIDC + login pages"]
        akWorker["worker · blueprints, logout jobs"]
        akDb[("PostgreSQL<br/>users, groups")]
    end

    subgraph DSG["Digital Sanskrit Guru"]
        dsgSpa["React SPA · Vite · :5173"]
        dsgApi["Express · :5001<br/>/api/auth/oidc/*"]
    end

    ottDb[("PostgreSQL :5433<br/>users, plans, purchases")]
    dsgDb[("MongoDB :27018<br/>users, orders")]
    google["Google<br/>optional source"]

    browser -- "pages · vyoma_session cookie" --> OTT
    browser -- "login page · redirects" --> akServer
    browser -- "SPA · /api with DSG token" --> dsgSpa
    dsgSpa -- "/api proxy" --> dsgApi

    ottAuth -- "code → tokens · JWKS" --> akServer
    dsgApi -- "code → tokens · JWKS" --> akServer
    akWorker -. "logout_token" .-> ottBcl
    akWorker -. "logout_token" .-> dsgApi
    google -. "sign-in" .-> akServer

    OTT -- Prisma --> ottDb
    dsgApi -- Mongoose --> dsgDb
    akServer --- akDb
```

Neither app ever sees a password. Each one checks the ID token's signature against Authentik's public keys (JWKS), and then runs its own session. Dotted arrows are back-channel logout and the optional Google source.

## Signing in once, using both apps

The second app still runs the full OIDC flow. Authentik recognises its own session cookie and answers straight away, so step 10 needs no password.

```mermaid
sequenceDiagram
    autonumber
    participant B as Browser
    participant O as Vyoma OTT
    participant A as Authentik
    participant D as DSG

    B->>O: Sign in with Vyoma SSO
    O-->>B: Redirect to Authentik (PKCE, state, nonce)
    B->>A: Log in with a password or Google
    A-->>B: Redirect to OTT's callback with a code
    B->>O: /api/auth/callback?code=…
    O->>A: Code + PKCE verifier + client secret
    A-->>O: ID token
    Note over O: Check via JWKS, link user,<br/>set encrypted vyoma_session

    Note over B,D: Later, in the DSG tab
    B->>D: Continue with Vyoma account
    D-->>B: Redirect to Authentik (PKCE, state, nonce)
    B->>A: Authorize: already signed in, no password prompt
    A-->>B: Redirect to DSG's callback with a code
    B->>D: /api/auth/oidc/callback?code=…
    D->>A: Code + PKCE verifier + client secret
    A-->>D: ID token
    Note over D: Link user, issue 60 s one-time code
    B->>D: POST /api/auth/oidc/exchange
    D-->>B: DSG token, kept in sessionStorage
```

## Logging out of both apps

Logging out of OTT ends three sessions: OTT's own, Authentik's, and DSG's. DSG learns about it server-to-server, so even a copied DSG token stops working.

```mermaid
sequenceDiagram
    autonumber
    participant B as Browser
    participant O as Vyoma OTT
    participant A as Authentik
    participant D as DSG

    B->>O: POST /api/auth/logout
    Note over O: Revoke the session id,<br/>delete vyoma_session
    O-->>B: 303 to end-session with id_token_hint
    B->>A: End the SSO session
    Note over A: Logout flow ends Authentik's session
    A-)D: Worker POSTs a signed logout_token
    Note over D: Check via JWKS, tokenVersion + 1
    A-->>B: Redirect back to OTT's sign-in page
    B->>D: DSG tab refreshes: GET /api/auth/me
    D-->>B: 401, so DSG shows you signed out
```

OTT revokes by session id, so other browsers stay signed in. DSG bumps a per-user counter, which ends all of that person's DSG sessions, as DSG does today. Logging out of DSG works the same way in reverse.

## Who owns what

Authentik answers "who is this?" The apps answer "what may they use?" The same `sub` (the user's UUID) joins a person's records across both apps.

| Data | Kept in |
| --- | --- |
| Passwords, MFA, Google link | Authentik |
| Staff roles, as groups | Authentik |
| OTT plan, purchases, watch progress | OTT PostgreSQL |
| DSG orders and library | DSG MongoDB |
| Link to the Vyoma account | `authentikId` (OTT), `authentikSub` (DSG) |
| OTT session | Encrypted `vyoma_session` cookie, 7 days, revoked by session id |
| DSG session | DSG token in `sessionStorage`, 8 h staff / 12 h customers, revoked by `tokenVersion` |

## How groups become roles

| Authentik group | Becomes |
| --- | --- |
| `vyoma-superadmins` | OTT `SUPER_ADMIN`: every admin page |
| `vyoma-admins` | OTT `ADMIN`: every admin page |
| `vyoma-managers` | OTT `MANAGER`: no Users or Invoices |
| `vyoma-finance` | OTT `FINANCE`: no Courses or Users |
| `dsg-super-admin` | DSG level 1: every page |
| `dsg-staff` + `dsg-page-*` | DSG level 2: only the listed pages |
| None of these | Customer in both apps |

OTT reads its role from the `vyoma_roles` scope (`role` claim). DSG reads `dsg_roles` from the `dsg` scope. Both apps overwrite the stored role at every login, so a change in Authentik takes effect at the user's next sign-in.

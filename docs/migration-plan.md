# Migration plan: moving existing OTT and DSG users to Vyoma SSO

This document explains how the people who already have OTT and DSG accounts get onto Authentik in production, without losing data and without being locked out. It combines section 11 and 15 of `ott-sso.md`, section 7 and 11 of `dsg-sso.md`, and what we learned building the prototype.

For how the prototype works, see [`project-guide.md`](project-guide.md).

## Contents

1. [The short version](#1-the-short-version)
2. [Who we are migrating](#2-who-we-are-migrating)
3. [What never moves](#3-what-never-moves)
4. [Step A: create the Authentik accounts](#4-step-a-create-the-authentik-accounts)
5. [Step B: passwords](#5-step-b-passwords)
6. [Step C: link the app accounts](#6-step-c-link-the-app-accounts)
7. [Step D: staff roles to groups](#7-step-d-staff-roles-to-groups)
8. [Duplicates and conflicts](#8-duplicates-and-conflicts)
9. [The rollout, phase by phase](#9-the-rollout-phase-by-phase)
10. [Rollback](#10-rollback)
11. [What to monitor](#11-what-to-monitor)
12. [What the prototype already does, and what is left to build](#12-what-the-prototype-already-does-and-what-is-left-to-build)
13. [Decisions needed before starting](#13-decisions-needed-before-starting)

---

## 1. The short version

- **Nobody's data moves.** Plans, purchases, watch progress, orders and library stay in the app databases. Each app's user record gets one new field, the person's Authentik ID (`authentikId` in OTT, `authentikSub` in DSG). Every purchase and order still points at the same user ID as before.
- **Each person gets one Authentik account.** Staff are created in Authentik before go-live. Customers are created either when they first sign in or by a bulk import (a decision, see section 13).
- **Linking is automatic.** At a person's first SSO sign-in, each app matches them by Authentik ID, else by verified email, else creates a new account. This is already built and tested.
- **Passwords:** OTT's hashes are unsalted SHA-256 and should not be carried over. Either users set a new password once through Authentik's recovery flow, or the old password is moved into Authentik the next time they use it (just-in-time). DSG's bcrypt hashes might be importable; that needs testing.
- **The rollout is gradual and reversible:** staff first, then old and new login side by side, then SSO by default, then SSO only. Each step is a configuration flag, so going back is a restart, not a deploy.

---

## 2. Who we are migrating

| Group | Where | What they have today | How they reach Authentik | Password |
| --- | --- | --- | --- | --- |
| **Staff (OTT)** | OTT `User.role` ≠ `USER` | Password (SHA-256) or the admin master key | Created in Authentik before go-live, added to `vyoma-*` groups, MFA enrolled | New password set in Authentik at enrolment |
| **Staff (DSG)** | DSG `User.isAdmin = true` | bcrypt password; Google linking is refused for admins | Same, added to `dsg-super-admin` or `dsg-staff` + `dsg-page-*` | New password set in Authentik at enrolment |
| **OTT learners with a password** | OTT `User.password` set | SHA-256 password; "tens of thousands" per the OTT plan, many with GOLD/PLATINUM plans | First SSO sign-in, or bulk import | Reset once, or just-in-time move (section 5) |
| **OTT learners imported from WordPress** | `forcePasswordChange = true` | Already required to reset | Same | They must set a password anyway: send them to Authentik recovery |
| **OTT Google users** | `password` is null | Google Identity Services | Google button on Authentik (email-linked) | None needed |
| **DSG customers with a password** | `hasLocalPassword = true` | bcrypt password | First SSO sign-in, or bulk import | Import the bcrypt hash if Authentik accepts it, else reset or just-in-time |
| **DSG Google users** | `googleSub` set | Google Identity Services | Google button on Authentik (email-linked) | None needed |
| **DSG guest-checkout accounts** | `hasLocalPassword = false` | An account with a random password nobody knows | First SSO sign-in (by verified email) | None: Google, or Authentik recovery to set one |
| **People in both apps** | Same email in OTT and DSG | Two separate accounts | **One** Authentik account; both apps link to it | One password for both |

---

## 3. What never moves

| Data | Stays in | Why it's safe |
| --- | --- | --- |
| OTT plan, plan dates, Razorpay IDs, coins | OTT `User` row | Same row, one column added |
| OTT purchases, progress, certificates, notes | OTT tables | Foreign keys point at `User.id` (cuid), which doesn't change |
| DSG orders, library, carts, wishlists, addresses | DSG MongoDB | References point at `User._id`, which doesn't change |
| Old password hashes | Both apps | Kept until the rollback window ends (section 10), then removed |

No foreign key, table or collection changes. The migration is **additive**: OTT gains `authentikId` (unique, nullable) and a `SessionRevocation` table; DSG gains `authentikSub` (partial unique index), `authSource`, `ssoLinkedAt` and `ssoIdToken`.

---

## 4. Step A: create the Authentik accounts

### Staff: bulk import before go-live (both plans agree)

1. Export staff from both apps: OTT users with `role ≠ USER`, DSG users with `isAdmin = true`.
2. Merge by lowercased email, so a person who is staff in both gets one Authentik account.
3. Review the list with the business. This is the moment to remove leavers and over-privileged accounts (the demo's Ravi is an example: ADMIN in OTT's database, MANAGER in reality).
4. Create each user through Authentik's API (`POST /api/v3/core/users/` with `username`, `name`, `email`, `attributes.email_verified: true`, `groups`).
5. Write the returned user UUID back as `authentikId` (OTT) and `authentikSub` (DSG). With `sub_mode: user_uuid`, that UUID is exactly the `sub` the apps will receive, so these accounts are linked before anyone signs in.
6. Send each staff member an enrolment link (Authentik recovery flow) to set a password and enrol MFA.

### Customers: two options

| | (a) Bulk import | (b) Just-in-time (lazy) |
| --- | --- | --- |
| How | Same script as staff, for every customer | Customer clicks "Sign in with Vyoma", registers or uses Google on Authentik, and the app links by verified email |
| Linked when | Immediately (Authentik ID written back) | At first SSO sign-in |
| Email verification | Imported accounts are pre-linked, so linking doesn't depend on it; set `email_verified` from what the app knows | The Authentik enrolment flow **must** verify the email (email stage), and set `attributes.email_verified = true`, otherwise the apps refuse to link |
| Passwords | Need import, reset or just-in-time move | User sets one at enrolment, or uses Google |
| Effort | Script + dry run + one big change | Nothing extra; already built |
| Risk | One large write to three systems | Spread over weeks; support load spread too |
| Plans recommend | Staff | Customers (or a later bulk import) |

**Recommendation:** (a) for staff, (b) for customers during the "both" phase, then optionally (a) for whoever hasn't signed in by the cutover date, so no one has to register again.

**Important for (b):** our email scope mapping reports `attributes.email_verified`. The production enrolment flow has to set that attribute after an email verification stage, and the Google source mapping already copies Google's flag. If neither happens, the apps will refuse to link existing customers (`email_unverified`), which is safe but annoying.

---

## 5. Step B: passwords

| App | Today's hash | Recommended | Why |
| --- | --- | --- | --- |
| OTT | Unsalted SHA-256 (`src/lib/hash.ts`) | **Don't import.** Just-in-time move during the "both" phase, then reset for the rest | Unsalted SHA-256 is weak; importing it would carry the weakness into the central system |
| DSG | bcrypt, cost 12 | **Test importing** (DSG open question Q3). If Authentik accepts the hash, users keep their passwords with no reset. If not, just-in-time move, then reset | bcrypt is a good hash; keeping it avoids a mass reset |
| Google, guest, WordPress-flagged | none / random / must reset | Nothing to migrate | They use Google or Authentik recovery |

### Just-in-time password move (both phase only)

While old login is still allowed (`SSO_MODE=both` / `ENABLE_LEGACY_LOGIN=true`):

1. The user signs in with the **old** form, and the app checks the password as today.
2. If it's correct, the app calls Authentik's API (server to server, over TLS) to set that password on the user's Authentik account (creating the account if needed), and links the Authentik ID.
3. The plaintext password is never stored or logged. Authentik hashes it with its own algorithm.
4. Next time, the user can use "Sign in with Vyoma" with the same password.

This needs an Authentik API token with permission to create users and set passwords. It must be stored as a server secret, never in the frontend.

### Everyone else: reset once

At cutover, anyone without an Authentik password uses Authentik's "Forgot password" (the recovery flow). The Phase 3 emails ("activate your Vyoma account") link straight to it.

---

## 6. Step C: link the app accounts

This is built and tested. At every SSO callback, each app runs:

```
1. Find by Authentik ID              → found: same person, sign in
2. Else find by email (lowercased)
     email_verified is not true      → refuse  (email_unverified)
     record linked to another ID     → refuse  (account_conflict)
     DSG admin record, no staff group→ refuse  (admin_takeover)
     otherwise                       → link: save the Authentik ID
3. Else                              → create a new account (FREE / customer)
```

Code: `ott/src/app/api/auth/callback/route.ts`, `dsg/backend/utils/ssoLinking.js` (unit tested), called from `dsg/backend/routes/oidcRoutes.js`. DSG writes every link and refusal to `AdminAuditLog` (`sso-link`, `sso-link-refused`).

Two changes from the plans, both security fixes: OTT also requires a verified email before linking, and both apps overwrite the role at every login (the OTT plan only raised it).

---

## 7. Step D: staff roles to groups

1. **Snapshot** every staff member's current access: OTT `role`; DSG `isAdmin`, `adminLevel`, `adminRole`, `allowedPages`.
2. **Map** them:

   | Today | Authentik groups |
   | --- | --- |
   | OTT `SUPER_ADMIN` / `ADMIN` / `MANAGER` / `FINANCE` | `vyoma-superadmins` / `vyoma-admins` / `vyoma-managers` / `vyoma-finance` |
   | DSG `adminLevel 1` | `dsg-super-admin` |
   | DSG `adminLevel 2` with pages `[a, b]` | `dsg-staff` + `dsg-page-a` + `dsg-page-b` |

3. **Review** the mapping with each team lead before applying. Access should be what people *need*, not what they had.
4. **Apply** in Authentik (API or blueprint).
5. **Verify** on staging: each staff member signs in once with SSO, and their access (`/api/auth/me` in DSG, the role badge and admin pages in OTT) is compared to the snapshot.
6. **After cutover**, Authentik is the only place to grant or remove access. DSG's Admin Access page and OTT's role editor become read-only (DSG open question Q6).

Note: a role change takes effect at the person's **next sign-in**. To remove access immediately, also end their sessions in Authentik, which triggers back-channel logout in both apps.

---

## 8. Duplicates and conflicts

Run a **read-only dry-run report** on a copy of each production database first (the DSG plan lists `backend/scripts/ssoLinkReport.js`; OTT needs the same). It should count each case below.

| Case | Handling |
| --- | --- |
| Emails that differ only by case or spaces in one app | Both apps lowercase emails in queries, but old data may not be. Report, then merge by hand |
| Deleted DSG account with the same email as an active one | Linking ignores deleted accounts |
| Same email in OTT and DSG | That's the same person: one Authentik account, both apps link to it. This is the point of SSO |
| Same person, different emails in OTT and DSG | Can't be detected automatically. They end up with two Authentik accounts until support merges them on request (OTT open question 2) |
| Record already linked to a different Authentik ID | Refused (`account_conflict`); support investigates |
| Customer identity claiming a DSG admin record | Refused (`admin_takeover`); staff are pre-created and pre-linked, so this should only ever be an attack |
| Unverified email in Authentik | Never linked by email; the user verifies first |
| Google account email differs from the app email | Becomes a new account; support links on request |
| DSG guest-checkout accounts | Link normally by verified email |

---

## 9. The rollout, phase by phase

Both plans describe the same shape. Flags: OTT `ENABLE_AUTHENTIK_SSO` and `ENABLE_LEGACY_LOGIN`; DSG `SSO_MODE` (`off`, `both`, `sso_only`).

| Phase | When (OTT plan) | OTT flags | DSG `SSO_MODE` | What happens | Exit criteria |
| --- | --- | --- | --- | --- | --- |
| **0. Prepare** | Before week 1 | SSO off | `off` | Decide section 13. Fix things that are bugs today: OTT admin-guard bypass, OTT master-key fallback, DSG Google mock token (W8), DSG open CORS (W12). Host Authentik with HTTPS, backups, monitoring. Run the dry-run reports | Decisions recorded; reports reviewed |
| **1. Staging** | Week 1 | SSO on, legacy on | `both` | Staging apps and Authentik apps; test accounts; full test matrix | All test cases pass; team sign-off |
| **2. Staff first (production)** | Week 1 | SSO on, legacy on, **staff must use SSO** | `both`, local login refused for `isAdmin` | Staff imported with groups (section 7), MFA required | Every admin has signed in once via SSO; access matches the snapshot |
| **3. Both logins for customers** | Weeks 2–3 | SSO on, legacy on | `both` | "Sign in with Vyoma" shown first, old form as fallback. Just-in-time linking and password moves | Low error and refusal rate for 2–4 weeks; support load acceptable |
| **4. SSO by default** | Weeks 4–5 | SSO on, legacy behind "other options" | `both` | Emails ask remaining users to activate their Vyoma account. Optional bulk import of the rest | Most active users linked |
| **5. SSO only (cutover)** | Week 6 | SSO on, **legacy off** | `sso_only` | Old login, register and reset return 410 / redirect to Authentik | No blocker for 2 weeks |
| **6. Clean up** | After the rollback window (e.g. 90 days, DSG Q8) | — | — | Remove old auth code and the admin master key; unset `password`, reset-token fields | Business approval |

**DSG caution from its plan:** a merge to `main` deploys DSG to production immediately, so set each phase's `SSO_MODE` in the server environment **before** merging.

---

## 10. Rollback

| If this happens | Do this | Effect |
| --- | --- | --- |
| Authentik is down or misbehaving during phases 1–4 | Users use the old login, which is still on | No outage |
| A serious problem after cutover | Set `SSO_MODE=both` / `ENABLE_LEGACY_LOGIN=true` and restart | Old login works again immediately: password hashes were kept |
| A user created only in Authentik (no app password) after rollback | They use the app's "Forgot password" | That flow still works because it wasn't removed yet |
| Wrong roles after import | Fix the groups in Authentik; the person signs in again | Roles overwrite at next login |

Rollback works because linking only **adds** fields. Nothing is deleted until phase 6.

---

## 11. What to monitor

| Signal | Source | Watch for |
| --- | --- | --- |
| Callback failures | App logs (`[SSO] callback failed`) and `/login?error=` / `?sso=` hits | A sudden rise means a configuration or Authentik problem |
| Link refusals by reason | DSG `AdminAuditLog` `sso-link-refused`; OTT should log the same | Many `email_unverified` → enrolment isn't verifying emails; any `admin_takeover` → investigate |
| Share of active users linked | `count(authentikId not null) / active users` | Progress toward cutover |
| Back-channel logout errors | Authentik worker logs / events | Apps not reachable from Authentik |
| Authentik health | Authentik metrics, uptime check on the login page | Every app depends on it |
| Support tickets about login | Support | "Can't find my account" usually means a different email |

---

## 12. What the prototype already does, and what is left to build

| Piece | Status |
| --- | --- |
| `authentikId` / `authentikSub` fields and indexes | **Built** |
| Linking rule with the three refusals | **Built and tested** (Meera, Kiran, Ravi in the demo; DSG unit tests) |
| Roles from Authentik groups, overwritten at every login | **Built and tested** |
| Old password routes return 410 in `sso_only` (DSG) | **Built** |
| Old data kept (no destructive change) | **Built** (Meera's row ID and `_id` unchanged) |
| `SSO_MODE=both` / OTT dual-login flags | Not built: the demo runs SSO only |
| Staff import script (export, merge, create in Authentik, write IDs back) | Not built |
| Dry-run duplicate/conflict report | Not built |
| Just-in-time password move | Not built |
| Test of bcrypt hash import into Authentik | Not done (DSG Q3) |
| Enrolment flow with email verification and captcha | Not built (Authentik configuration) |
| Production Authentik (HTTPS, domain, backups) | Not built |

---

## 13. Decisions needed before starting

| # | Decision | Suggested answer |
| --- | --- | --- |
| 1 | Customers on Authentik, or staff only at first? (DSG Q1) | Staff first, then customers |
| 2 | One shared customer identity for OTT and DSG? (DSG Q2) | Yes, with an updated privacy notice |
| 3 | Customers: bulk import or link at first sign-in? | Link at first sign-in, bulk import the rest before cutover |
| 4 | Can Authentik import DSG's bcrypt hashes? (DSG Q3) | Test on the local instance |
| 5 | Reset OTT passwords, or just-in-time move? | Just-in-time during "both", reset for the rest |
| 6 | MFA mandatory for staff, which factors? (DSG Q5) | Yes; passkeys preferred, TOTP allowed |
| 7 | How long to keep old password hashes? (DSG Q8) | 90 days after cutover |
| 8 | Where roles are managed after cutover (DSG Q6, Q7) | Authentik only; Vyoma IT administers it |
| 9 | Different-email merges and Google email mismatches (OTT Q2) | Support merges on request, after verifying both emails |
| 10 | Authentik hosting and domain (OTT Q1, DSG Q9) | `auth.vyoma.org`, HTTPS, backed up, monitored |
| 11 | Keep OTT's consent screen? | Drop it for first-party apps, as DSG does |

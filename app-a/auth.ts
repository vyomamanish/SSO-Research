import { headers } from "next/headers";
import NextAuth from "next-auth";
import { getToken } from "next-auth/jwt";
import Authentik from "next-auth/providers/authentik";
import { isSessionRevoked } from "@/lib/revoked-sessions";

declare module "next-auth" {
  interface Session {
    groups: string[];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    groups?: string[];
    sid?: string;
    idToken?: string;
    accessToken?: string;
  }
}

export const ADMIN_GROUP = "vyoma-admins";

// Browsers ignore the port when scoping cookies, so localhost:3001 and
// localhost:3002 share one cookie jar. Every cookie needs an app-specific name.
const COOKIE_PREFIX = "ott";
const SESSION_COOKIE = `${COOKIE_PREFIX}.session-token`;

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Authentik({
      // `groups` is the custom scope from blueprints/vyoma-sso-demo.yaml.
      authorization: { params: { scope: "openid profile email groups" } },
    }),
  ],
  session: { strategy: "jwt", maxAge: 60 * 60 },
  cookies: {
    sessionToken: { name: SESSION_COOKIE },
    callbackUrl: { name: `${COOKIE_PREFIX}.callback-url` },
    csrfToken: { name: `${COOKIE_PREFIX}.csrf-token` },
    pkceCodeVerifier: { name: `${COOKIE_PREFIX}.pkce` },
    state: { name: `${COOKIE_PREFIX}.state` },
    nonce: { name: `${COOKIE_PREFIX}.nonce` },
  },
  callbacks: {
    jwt({ token, account, profile }) {
      // `account` and `profile` are only present at sign-in.
      if (account && profile) {
        token.groups = (profile.groups as string[] | undefined) ?? [];
        token.sid = profile.sid as string | undefined;
        token.idToken = account.id_token;
        token.accessToken = account.access_token;
      }
      // Returning null ends the session after a back-channel logout.
      return token.sid && isSessionRevoked(token.sid) ? null : token;
    },
    session({ session, token }) {
      // Tokens stay in the encrypted cookie: this object reaches the browser.
      session.groups = token.groups ?? [];
      return session;
    },
  },
});

/** Reads the raw tokens server-side. They are deliberately not on the session. */
export async function getSessionTokens() {
  return getToken({
    req: { headers: await headers() },
    secret: process.env.AUTH_SECRET,
    cookieName: SESSION_COOKIE,
    salt: SESSION_COOKIE,
    secureCookie: false,
  });
}

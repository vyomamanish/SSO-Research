// RP-initiated logout (ott-sso.md 4.4): end the OTT session, then send the
// browser to Authentik's end-session endpoint, which ends the SSO session and
// tells every other app (back-channel logout).
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { APP_URL, POST_LOGOUT_REDIRECT_URI, client, getOidcConfig } from "@/lib/oidc";
import { SESSION_COOKIE, openSession } from "@/lib/session";

export async function POST(request: NextRequest) {
  const session = await openSession(request.cookies.get(SESSION_COOKIE)?.value);

  // Revoke server-side too, so a copied cookie stops working (fixes the plan's
  // vulnerability 6, where logout only deleted the browser cookie).
  if (session?.sid) {
    await prisma.sessionRevocation.upsert({ where: { sid: session.sid }, create: { sid: session.sid }, update: {} });
  }

  let destination = new URL(POST_LOGOUT_REDIRECT_URI);
  if (session?.idToken) {
    try {
      destination = client.buildEndSessionUrl(await getOidcConfig(), {
        id_token_hint: session.idToken,
        post_logout_redirect_uri: POST_LOGOUT_REDIRECT_URI,
      });
    } catch {
      // Authentik unreachable: the OTT session still ends.
    }
  }

  const response = NextResponse.redirect(destination, 303);
  response.cookies.set(SESSION_COOKIE, "", { path: "/", maxAge: 0 });
  return response;
}

// A plain GET (for example, a bookmarked link) only returns to the login page.
export function GET() {
  return NextResponse.redirect(new URL("/login", APP_URL));
}

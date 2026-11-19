// Route guard (ott-sso.md 10, src/middleware.ts). Next.js 16 renamed
// middleware.ts to proxy.ts. This is a fast first check on the cookie only;
// pages still call getCurrentUser(), which also checks revocations.
import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, openSession } from "@/lib/session";

const PROTECTED = ["/admin", "/profile", "/watch"];

export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  if (PROTECTED.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))) {
    const session = await openSession(request.cookies.get(SESSION_COOKIE)?.value);
    if (!session) {
      const login = new URL("/login", request.url);
      login.searchParams.set("redirect", pathname + search);
      return NextResponse.redirect(login);
    }
  }

  // Kept from the current proxy. Don't use it for access checks in a layout:
  // layouts don't re-render on client-side navigation (see lib/adminGuard.tsx).
  const headers = new Headers(request.headers);
  headers.set("x-pathname", pathname);
  return NextResponse.next({ request: { headers } });
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};

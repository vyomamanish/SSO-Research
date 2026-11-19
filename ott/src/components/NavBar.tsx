import Link from "next/link";
import type { CurrentUser } from "@/lib/auth";
import { isStaff } from "@/lib/roles";

export function NavBar({ user }: { user: CurrentUser | null }) {
  return (
    <header className="nav">
      <Link href="/" className="logo">
        Vyoma <span>OTT</span>
      </Link>
      <nav>
        {user ? (
          <>
            <Link href="/profile">{user.name}</Link>
            <span className="badge">{user.plan}</span>
            {user.role !== "USER" && <span className="badge staff">{user.role}</span>}
            {isStaff(user.role) && <Link href="/admin">Admin</Link>}
            <a href={process.env.DSG_URL}>Open DSG</a>
            {/* Ends the session here and in Authentik (single logout). */}
            <form action="/api/auth/logout" method="post">
              <button className="link-button">Log out</button>
            </form>
          </>
        ) : (
          <Link href="/login" className="button primary small">
            Sign in
          </Link>
        )}
      </nav>
    </header>
  );
}

// Per-page admin check. It must run in each page, not only in admin/layout.tsx:
// the App Router doesn't re-render a shared layout on client-side navigation,
// so a layout check reading x-pathname only runs on the first admin page you
// open. Clicking from /admin/courses to /admin/users would skip it.
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { canAccessAdminPath, isStaff } from "@/lib/roles";

export async function requireAdminAccess(path: string) {
  const user = await getCurrentUser();
  if (!user) redirect(`/login?redirect=${encodeURIComponent(path)}`);

  if (!canAccessAdminPath(user.role, path)) {
    const denied = (
      <section className="card denied">
        <p className="eyebrow">{isStaff(user.role) ? "Not available for your role" : "Access denied"}</p>
        <h1>{isStaff(user.role) ? "Restricted" : "Staff only"}</h1>
        <p className="muted">
          The <code>{user.role}</code> role can&apos;t open <code>{path}</code>. This rule is the same as in OTT
          today; only the source of the role has changed.
        </p>
      </section>
    );
    return { user, denied };
  }
  return { user, denied: null };
}

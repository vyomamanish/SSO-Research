// Mirrors OTT 2.0's src/app/admin/layout.tsx: staff roles only, with
// sub-route restrictions for MANAGER and FINANCE. The role now comes from
// Authentik's `role` claim instead of the ADMIN_MASTER_KEY backdoor.
//
// Change from the current app: the sub-route check moved into each page
// (src/lib/adminGuard.tsx). This layout doesn't re-render on client-side
// navigation, so a check here can be skipped by clicking a link.
import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { AdminNav } from "@/components/AdminNav";
import { getCurrentUser } from "@/lib/auth";
import { canAccessAdminPath, isStaff } from "@/lib/roles";

export const metadata = { title: "Admin · Vyoma OTT" };

const SECTIONS = [
  { href: "/admin", label: "Dashboard" },
  { href: "/admin/courses", label: "Courses" },
  { href: "/admin/users", label: "Users" },
  { href: "/admin/invoices", label: "Invoices" },
];

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login?redirect=/admin");

  if (!isStaff(user.role)) {
    return (
      <section className="card denied">
        <p className="eyebrow">Access denied</p>
        <h1>Staff only</h1>
        <p className="muted">
          Your Vyoma role is <code>{user.role}</code>. Admin needs one of the staff groups in Vyoma SSO.
        </p>
      </section>
    );
  }

  return (
    <div className="admin">
      <aside className="card side">
        <p className="eyebrow">Signed in as {user.role}</p>
        <AdminNav sections={SECTIONS.map((section) => ({ ...section, allowed: canAccessAdminPath(user.role, section.href) }))} />
      </aside>
      <div className="admin-main">{children}</div>
    </div>
  );
}

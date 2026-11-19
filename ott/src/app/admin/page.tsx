import prisma from "@/lib/prisma";
import { requireAdminAccess } from "@/lib/adminGuard";

export default async function AdminDashboard() {
  const { user, denied } = await requireAdminAccess("/admin");
  if (denied) return denied;
  const [users, linked, purchases] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { authentikId: { not: null } } }),
    prisma.purchase.count(),
  ]);

  return (
    <section className="card">
      <p className="eyebrow">Admin dashboard</p>
      <h1>Hello, {user?.name}</h1>
      <div className="stats">
        <div>
          <strong>{users}</strong>
          <span>OTT users</span>
        </div>
        <div>
          <strong>{linked}</strong>
          <span>Linked to Vyoma SSO</span>
        </div>
        <div>
          <strong>{purchases}</strong>
          <span>Purchases</span>
        </div>
      </div>
    </section>
  );
}

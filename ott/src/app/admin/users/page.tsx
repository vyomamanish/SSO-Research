import prisma from "@/lib/prisma";
import { requireAdminAccess } from "@/lib/adminGuard";

export default async function AdminUsers() {
  const { denied } = await requireAdminAccess("/admin/users");
  if (denied) return denied;
  const users = await prisma.user.findMany({ orderBy: { createdAt: "asc" } });

  return (
    <section className="card">
      <p className="eyebrow">Users · Admins only</p>
      <h1>Users</h1>
      <p className="muted">Roles are read-only here: they come from Vyoma SSO groups at each login.</p>
      <table>
        <thead>
          <tr>
            <th>Name</th>
            <th>Role</th>
            <th>Plan</th>
            <th>Vyoma SSO</th>
          </tr>
        </thead>
        <tbody>
          {users.map((user) => (
            <tr key={user.id}>
              <td>
                {user.name}
                <br />
                <span className="muted small">{user.email}</span>
              </td>
              <td>{user.role}</td>
              <td>{user.plan}</td>
              <td>{user.authentikId ? "Linked" : "Not yet"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

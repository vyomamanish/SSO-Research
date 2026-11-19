import prisma from "@/lib/prisma";
import { requireAdminAccess } from "@/lib/adminGuard";
import { formatDate } from "@/lib/format";

export default async function AdminInvoices() {
  const { denied } = await requireAdminAccess("/admin/invoices");
  if (denied) return denied;
  const purchases = await prisma.purchase.findMany({
    include: { user: true, course: true },
    orderBy: { createdAt: "desc" },
  });

  return (
    <section className="card">
      <p className="eyebrow">Billing · Finance and admins</p>
      <h1>Invoices</h1>
      <table>
        <thead>
          <tr>
            <th>Date</th>
            <th>Customer</th>
            <th>Course</th>
            <th>Amount</th>
          </tr>
        </thead>
        <tbody>
          {purchases.map((purchase) => (
            <tr key={purchase.id}>
              <td>{formatDate(purchase.createdAt)}</td>
              <td>{purchase.user.name}</td>
              <td>{purchase.course.title}</td>
              <td>₹{purchase.amount.toLocaleString("en-IN")}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

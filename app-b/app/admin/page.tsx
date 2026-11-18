import { redirect } from "next/navigation";
import { auth, ADMIN_GROUP } from "@/auth";
import { Groups } from "@/app/groups";

export const metadata = { title: "Admin · DSG Demo" };

export default async function AdminPage() {
  const session = await auth();
  if (!session) redirect("/");

  if (!session.groups.includes(ADMIN_GROUP)) {
    return (
      <section className="card denied">
        <p className="eyebrow">Access denied</p>
        <h1>Admins only</h1>
        <p className="muted">
          {session.user?.name} isn&apos;t in <code>{ADMIN_GROUP}</code>. This account&apos;s
          groups:
        </p>
        <Groups groups={session.groups} />
        <div className="actions">
          <a className="button" href="/">
            Back to home
          </a>
        </div>
      </section>
    );
  }

  return (
    <section className="card">
      <p className="eyebrow">Admin area</p>
      <h1>DSG admin console</h1>
      <p className="muted">
        You&apos;re here because the <code>groups</code> claim from Authentik includes{" "}
        <code>{ADMIN_GROUP}</code>.
      </p>
      <div className="actions">
        <a className="button" href="/">
          Back to home
        </a>
      </div>
    </section>
  );
}

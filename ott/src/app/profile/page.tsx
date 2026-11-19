import { redirect } from "next/navigation";
import { getCurrentUser, getSession } from "@/lib/auth";
import { formatDate, formatSeconds } from "@/lib/format";

export const metadata = { title: "Profile · Vyoma OTT" };

export default async function ProfilePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?redirect=/profile");
  const session = await getSession();

  return (
    <>
      <section className="card">
        <p className="eyebrow">From Vyoma SSO (Authentik)</p>
        <h1>{user.name}</h1>
        <dl className="facts">
          <dt>Email</dt>
          <dd>{user.email}</dd>
          <dt>Role</dt>
          <dd>{user.role}</dd>
          <dt>Authentik ID</dt>
          <dd>
            <code>{user.authentikId}</code>
          </dd>
          <dt>Session ID</dt>
          <dd>
            <code>{session?.sid?.slice(0, 16)}…</code>
          </dd>
        </dl>
      </section>

      <section className="card">
        <p className="eyebrow">From OTT&apos;s own database</p>
        <h2>Plan and history</h2>
        <dl className="facts">
          <dt>Plan</dt>
          <dd>
            {user.plan}
            {user.planInterval ? ` (${user.planInterval.toLowerCase()})` : ""}
          </dd>
          <dt>Renews</dt>
          <dd>{formatDate(user.planExpiresAt)}</dd>
          <dt>Coins</dt>
          <dd>{user.coins}</dd>
          <dt>Member since</dt>
          <dd>{formatDate(user.createdAt)}</dd>
        </dl>
        <h3>Purchases</h3>
        {user.purchases.length ? (
          <ul className="list">
            {user.purchases.map((purchase) => (
              <li key={purchase.id}>
                {purchase.course.title} · ₹{purchase.amount.toLocaleString("en-IN")}
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted">None yet.</p>
        )}
        <h3>Continue watching</h3>
        {user.progress.length ? (
          <ul className="list">
            {user.progress.map((entry) => (
              <li key={entry.id}>
                {entry.course.title} · {formatSeconds(entry.seconds)} watched
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted">Nothing yet.</p>
        )}
      </section>
    </>
  );
}

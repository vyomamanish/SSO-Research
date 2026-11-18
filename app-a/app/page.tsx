import { auth, ADMIN_GROUP } from "@/auth";
import { ApiPanel } from "@/app/api-panel";
import { login, logout } from "@/app/actions";
import { Groups } from "@/app/groups";

export default async function Home() {
  const session = await auth();

  if (!session) {
    return (
      <section className="card">
        <p className="eyebrow">Signed out</p>
        <h1>Welcome to OTT Demo</h1>
        <p className="muted">One Vyoma account gets you into every demo app.</p>
        <form action={login}>
          <button className="primary">Sign in with Vyoma SSO</button>
        </form>
      </section>
    );
  }

  const isAdmin = session.groups.includes(ADMIN_GROUP);

  return (
    <>
      <section className="card">
        <p className="eyebrow">Signed in with Vyoma SSO</p>
        <h1>{session.user?.name}</h1>
        <p className="muted">{session.user?.email}</p>
        <Groups groups={session.groups} />
        <div className="actions">
          <a className="button primary" href={process.env.OTHER_APP_URL}>
            Open DSG Demo
          </a>
          <a className="button" href="/admin">
            Admin page{isAdmin ? "" : " (restricted)"}
          </a>
          <form action={logout}>
            <button>Log out everywhere</button>
          </form>
        </div>
      </section>
      <ApiPanel />
    </>
  );
}

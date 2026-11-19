import Link from "next/link";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { canWatch } from "@/lib/roles";
import { accessLabel } from "@/lib/format";

export default async function Home() {
  const [user, courses] = await Promise.all([getCurrentUser(), prisma.course.findMany({ orderBy: { durationMin: "asc" } })]);

  return (
    <>
      <section className="hero">
        <p className="eyebrow">{user ? `Welcome back, ${user.name}` : "Sanskrit and Indic Knowledge Systems"}</p>
        <h1>Learn from the source.</h1>
        <p className="muted">
          {user
            ? `Your plan: ${user.plan}. Plans and purchases are kept by OTT; your login comes from Vyoma SSO.`
            : "Sign in with your Vyoma account to start watching."}
        </p>
        {!user && (
          <Link className="button primary" href="/login">
            Sign in with Vyoma SSO
          </Link>
        )}
      </section>

      <section className="grid">
        {courses.map((course) => {
          const unlocked = user ? canWatch(course, user) : false;
          return (
            <Link key={course.id} href={`/watch/${course.id}`} className={`tile ${unlocked ? "" : "locked"}`}>
              <span className={`tag ${course.accessLevel.toLowerCase()}`}>{accessLabel(course)}</span>
              <h2>{course.title}</h2>
              <p className="muted">{course.description}</p>
              <span className="tile-foot">{user ? (unlocked ? "▶ Watch" : "🔒 Locked") : "Sign in to watch"}</span>
            </Link>
          );
        })}
      </section>
    </>
  );
}

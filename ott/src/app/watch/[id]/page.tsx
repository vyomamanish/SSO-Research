import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { canWatch } from "@/lib/roles";
import { accessLabel, formatSeconds } from "@/lib/format";

export default async function WatchPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) redirect(`/login?redirect=/watch/${id}`);

  const course = await prisma.course.findUnique({ where: { id } });
  if (!course) notFound();

  const unlocked = canWatch(course, user);
  const progress = user.progress.find((entry) => entry.courseId === course.id);

  return (
    <section className="card">
      <p className="eyebrow">{accessLabel(course)}</p>
      <h1>{course.title}</h1>
      {unlocked ? (
        <div className="player">
          <span className="play">▶</span>
          <span>{progress ? `Resume at ${formatSeconds(progress.seconds)}` : "Start watching"}</span>
          {/* ott-sso.md 6.3: watermark with the signed-in identity. */}
          <span className="watermark">{user.email}</span>
        </div>
      ) : (
        <div className="player locked">
          <span className="lock">🔒</span>
          <strong>
            {course.accessLevel === "PAID" ? "Buy this course to watch it." : `Needs the ${course.accessLevel} plan.`}
          </strong>
          <span className="muted">Your plan: {user.plan}. Upgrades happen in OTT, not in Vyoma SSO.</span>
        </div>
      )}
      <p className="muted">{course.description}</p>
      <Link className="button" href="/">
        Back to catalogue
      </Link>
    </section>
  );
}

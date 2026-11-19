import prisma from "@/lib/prisma";
import { requireAdminAccess } from "@/lib/adminGuard";
import { accessLabel } from "@/lib/format";

export default async function AdminCourses() {
  const { denied } = await requireAdminAccess("/admin/courses");
  if (denied) return denied;
  const courses = await prisma.course.findMany({ include: { _count: { select: { purchases: true } } } });

  return (
    <section className="card">
      <p className="eyebrow">Content · Managers and admins</p>
      <h1>Courses</h1>
      <table>
        <thead>
          <tr>
            <th>Title</th>
            <th>Access</th>
            <th>Sales</th>
          </tr>
        </thead>
        <tbody>
          {courses.map((course) => (
            <tr key={course.id}>
              <td>{course.title}</td>
              <td>{accessLabel(course)}</td>
              <td>{course._count.purchases}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

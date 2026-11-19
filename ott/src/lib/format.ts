export function accessLabel(course: { accessLevel: string; price: number | null }) {
  if (course.accessLevel === "PAID") return `₹${course.price?.toLocaleString("en-IN")}`;
  if (course.accessLevel === "FREE") return "Free";
  return `${course.accessLevel[0]}${course.accessLevel.slice(1).toLowerCase()} plan`;
}

export function formatSeconds(total: number) {
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  return hours ? `${hours}h ${minutes}m` : `${minutes}m`;
}

export function formatDate(date: Date | null) {
  return date ? date.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "—";
}

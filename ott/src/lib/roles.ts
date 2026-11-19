// Role rules from src/app/admin/layout.tsx in OTT 2.0 (ott-sso.md 2.4).
export const STAFF_ROLES = ["SUPER_ADMIN", "ADMIN", "MANAGER", "FINANCE"];

const FORBIDDEN: Record<string, string[]> = {
  MANAGER: ["/admin/users", "/admin/reports", "/admin/subscriptions", "/admin/vouchers", "/admin/invoices", "/admin/orders"],
  FINANCE: ["/admin/courses", "/admin/episodes", "/admin/pages", "/admin/layout-settings", "/admin/navigation", "/admin/users", "/admin/bundles", "/admin/sponsors"],
};

export function isStaff(role: string) {
  return STAFF_ROLES.includes(role);
}

export function canAccessAdminPath(role: string, path: string) {
  if (!isStaff(role)) return false;
  // Managers may still import users.
  if (role === "MANAGER" && path.startsWith("/admin/users/import")) return true;
  return !(FORBIDDEN[role] ?? []).some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
}

const PLAN_RANK: Record<string, number> = { FREE: 0, GOLD: 1, PLATINUM: 2 };

/** Entitlement check: identity comes from Authentik, access from OTT's data. */
export function canWatch(
  course: { id: string; accessLevel: string },
  user: { plan: string; purchases: { courseId: string }[] },
) {
  switch (course.accessLevel) {
    case "FREE":
      return true;
    case "GOLD":
    case "PLATINUM":
      return (PLAN_RANK[user.plan] ?? 0) >= PLAN_RANK[course.accessLevel];
    case "PAID":
      return user.purchases.some((purchase) => purchase.courseId === course.id);
    default:
      return false;
  }
}

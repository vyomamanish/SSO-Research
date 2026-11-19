// Turns the `dsg_roles` claim into DSG's role fields (dsg-sso.md 5.6). Pure,
// so it is unit tested in tests/ssoRoles.test.js.
function rolesFromClaims(dsgRoles = [], adminPageKeys = []) {
  const set = new Set(Array.isArray(dsgRoles) ? dsgRoles : []);

  if (set.has("dsg-super-admin")) {
    return { isAdmin: true, adminLevel: 1, adminRole: "Super Admin", allowedPages: [...adminPageKeys] };
  }
  if (set.has("dsg-staff")) {
    const pages = adminPageKeys.filter((key) => set.has(`dsg-page-${key}`));
    // Staff always see the dashboard, even with no page groups.
    return {
      isAdmin: true,
      adminLevel: 2,
      adminRole: "Staff",
      allowedPages: pages.includes("dashboard") ? pages : ["dashboard", ...pages],
    };
  }
  return { isAdmin: false, adminLevel: 2, adminRole: "Customer", allowedPages: [] };
}

function isStaffClaim(dsgRoles = []) {
  return rolesFromClaims(dsgRoles).isAdmin;
}

module.exports = { rolesFromClaims, isStaffClaim };

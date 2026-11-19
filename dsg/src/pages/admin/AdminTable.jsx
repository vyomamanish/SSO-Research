import { useEffect, useState } from "react";
import axios from "axios";
import { useAuth } from "../../context/AuthContext.jsx";

const inr = (amount) => `₹${amount.toLocaleString("en-IN")}`;

const VIEWS = {
  orders: {
    title: "Orders",
    columns: ["Order", "Customer", "Items", "Total"],
    row: (order) => [order.number, order.user?.name, order.items.map((item) => item.title).join(", "), inr(order.total)],
  },
  coupons: {
    title: "Coupons",
    columns: ["Code", "Discount", "Uses"],
    row: (coupon) => [coupon.code, coupon.discount, coupon.uses],
  },
  users: {
    title: "Users",
    columns: ["Name", "Email", "Role", "Vyoma SSO"],
    row: (user) => [user.name, user.email, user.role, user.ssoLinked ? "Linked" : "Not yet"],
  },
};

export default function AdminTable({ page }) {
  const { token } = useAuth();
  const [state, setState] = useState({ rows: null, error: "" });
  const view = VIEWS[page];

  useEffect(() => {
    setState({ rows: null, error: "" });
    axios
      .get(`/api/admin/${page}`, { headers: { Authorization: `Bearer ${token}` } })
      .then(({ data }) => setState({ rows: data, error: "" }))
      .catch((error) => setState({ rows: [], error: error.response?.data?.message ?? "Couldn't load this page." }));
  }, [page, token]);

  if (state.error) {
    return (
      <section className="card denied">
        <p className="eyebrow">403 from the DSG API</p>
        <h1>Restricted</h1>
        <p className="muted">{state.error}. Page access comes from dsg-page-* groups in Vyoma SSO.</p>
      </section>
    );
  }

  return (
    <section className="card">
      <p className="eyebrow">Admin</p>
      <h1>{view.title}</h1>
      {state.rows === null ? (
        <p className="muted">Loading…</p>
      ) : (
        <table>
          <thead>
            <tr>
              {view.columns.map((column) => (
                <th key={column}>{column}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {state.rows.map((row, index) => (
              <tr key={row._id ?? row.id ?? row.code ?? index}>
                {view.row(row).map((cell, cellIndex) => (
                  <td key={cellIndex}>{cell}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

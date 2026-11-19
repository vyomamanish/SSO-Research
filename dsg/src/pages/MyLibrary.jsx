import { useEffect, useState } from "react";
import axios from "axios";
import { useAuth } from "../context/AuthContext.jsx";

const inr = (amount) => `₹${amount.toLocaleString("en-IN")}`;

export default function MyLibrary() {
  const { token, user } = useAuth();
  const [orders, setOrders] = useState(null);

  useEffect(() => {
    // The Bearer header is added by hand, as in DSG's 40 call sites today.
    axios
      .get("/api/orders/my", { headers: { Authorization: `Bearer ${token}` } })
      .then(({ data }) => setOrders(data))
      .catch(() => setOrders([]));
  }, [token]);

  return (
    <>
      <section className="card">
        <p className="eyebrow">From Vyoma SSO</p>
        <h1>{user.name}</h1>
        <dl className="facts">
          <dt>Email</dt>
          <dd>{user.email}</dd>
          <dt>Account</dt>
          <dd>{user.ssoLinked ? "Linked to your Vyoma account" : "Not linked"}</dd>
          <dt>Role</dt>
          <dd>{user.isAdmin ? user.adminRole : "Customer"}</dd>
        </dl>
      </section>
      <section className="card">
        <p className="eyebrow">From DSG&apos;s own database</p>
        <h2>My orders</h2>
        {orders === null ? (
          <p className="muted">Loading…</p>
        ) : orders.length ? (
          <ul className="orders">
            {orders.map((order) => (
              <li key={order._id}>
                <div>
                  <strong>{order.items.map((item) => item.title).join(", ")}</strong>
                  <span className="muted small">
                    {order.number} · {new Date(order.createdAt).toLocaleDateString("en-IN")}
                  </span>
                </div>
                <span>{inr(order.total)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted">No orders yet.</p>
        )}
      </section>
    </>
  );
}

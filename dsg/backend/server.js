const express = require("express");
const cookieParser = require("cookie-parser");
const mongoose = require("mongoose");
const { router: authRoutes } = require("./routes/authRoutes");
const oidcRoutes = require("./routes/oidcRoutes");
const orderRoutes = require("./routes/orderRoutes");
const adminRoutes = require("./routes/adminRoutes");

const app = express();
// The SPA reaches this server through the Vite (or nginx) proxy on one origin.
app.set("trust proxy", "loopback");
app.use(express.json());
app.use(cookieParser());

app.use("/api/auth/oidc", oidcRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/orders", orderRoutes);
app.use("/api/admin", adminRoutes);
app.get("/api/health", (req, res) => res.json({ ok: true, db: mongoose.connection.readyState === 1 }));

app.use((err, req, res, next) => {
  console.error("[DSG] unhandled error:", err.message);
  res.status(500).json({ message: "Something went wrong" });
});

const port = Number(process.env.PORT || 5001);
mongoose
  .connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 5000 })
  .then(() => app.listen(port, () => console.log(`DSG API listening on http://localhost:${port}`)))
  .catch((error) => {
    console.error(`[DSG] can't reach MongoDB at ${process.env.MONGO_URI}: ${error.message}`);
    process.exit(1);
  });

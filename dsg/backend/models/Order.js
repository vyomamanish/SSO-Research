const mongoose = require("mongoose");

const orderSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    number: { type: String, required: true },
    items: [{ title: String, kind: { type: String, enum: ["course", "book", "digital"] }, price: Number }],
    total: Number,
    status: { type: String, default: "paid" },
  },
  { timestamps: true },
);

module.exports = mongoose.model("Order", orderSchema);

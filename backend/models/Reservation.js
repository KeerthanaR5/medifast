const mongoose = require("mongoose");

const ReservationSchema = new mongoose.Schema({
  // Reference to the customer who made the reservation
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  // Reference to the specific stock item (links to Pharmacy and Medicine)
  stock: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Stock",
    required: true,
  },
  quantity: {
    type: Number,
    required: [true, "Reservation quantity is required"],
    min: 1,
    validate: {
      validator: Number.isInteger,
      message: "Reservation quantity must be a whole number",
    },
  },
  status: {
    type: String,
    enum: ["pending", "confirmed", "picked_up", "canceled", "expired"],
    default: "pending",
  },
  reservedAt: {
    type: Date,
    default: Date.now,
  },
  // Timestamp for automatic expiration of the reservation
  expiresAt: {
    type: Date,
    required: true,
  },
}, {
  timestamps: true // Adds createdAt and updatedAt
});

// Optimize queries for expiry sweep and status filtering
ReservationSchema.index({ status: 1, expiresAt: 1 });

module.exports = mongoose.model("Reservation", ReservationSchema);
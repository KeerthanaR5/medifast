const mongoose = require("mongoose");

const StockSchema = new mongoose.Schema({
  // Reference to the Pharmacy location
  pharmacy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Pharmacy",
    required: true,
    index: true,
  },
  // Reference to the Medicine details
  medicine: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Medicine",
    required: false,
    index: true,
  },
  // Optional: medicineName if future decoupling from Medicine collection is needed
  medicineName: { type: String, trim: true, index: true, sparse: true },
  quantity: {
    type: Number,
    required: [true, "Stock quantity is required"],
    min: 0,
    validate: {
      validator: Number.isInteger,
      message: "Stock quantity must be a whole number",
    },
    default: 0,
  },
  unit: {
    type: String,
    enum: ['tabs', 'caps', 'ml', 'bottle', 'pack', 'unit'],
    default: 'unit',
  },
  unitPrice: {
    type: Number,
    required: [true, "Unit price at this pharmacy is required"],
    min: 0,
  },
  lastUpdated: {
    type: Date,
    default: Date.now,
  },
}, {
  timestamps: true // Adds createdAt and updatedAt; __v for optimistic concurrency
});

// Enforce uniqueness when medicine ObjectId is present (partial index)
StockSchema.index(
  { pharmacy: 1, medicine: 1 },
  { unique: true, partialFilterExpression: { medicine: { $type: 'objectId' } } }
);
// Enforce uniqueness when using free-text medicineName (sparse + partial)
StockSchema.index(
  { pharmacy: 1, medicineName: 1 },
  {
    unique: true,
    partialFilterExpression: {
      medicineName: { $type: 'string' }
    }
  }
);

module.exports = mongoose.model("Stock", StockSchema);

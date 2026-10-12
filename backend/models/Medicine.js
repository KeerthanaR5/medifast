const mongoose = require('mongoose');

const MedicineSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
    index: true,
  },
  generic_name: {
    type: String,
    required: true,
    trim: true,
    index: true,
  },
  category: {
    type: String,
    required: true,
    trim: true,
    index: true,
  }
}, {
  timestamps: true
});

MedicineSchema.index({ name: 1, generic_name: 1 }, { unique: true });

module.exports = mongoose.model('Medicine', MedicineSchema);

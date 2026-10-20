const mongoose = require('mongoose');

const PharmacySchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
    index: true
  },
  externalId: { type: String },
  owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  // External OSM or third-party ID to enable dedupe/linkage

  licenseNumber: { type: String, trim: true, index: true, sparse: true },

  // Normalized address for search/display
  addressNormalized: { type: String, trim: true },

  // Backward-compatible address block (kept for existing code paths)
  address: {
    street: { type: String, trim: true },
    city: { type: String, trim: true },
    state: { type: String, trim: true },
    zipCode: { type: String, trim: true },
    country: { type: String, default: 'India' },
    // Deprecated in favor of GeoJSON 'location', but kept for compatibility
    coordinates: {
      type: [Number], // [lon, lat]
      index: '2dsphere'
    }
  },

  // GeoJSON location (preferred) for $geoNear queries
  location: {
    type: {
      type: String,
      enum: ['Point'],
      default: 'Point'
    },
    coordinates: {
      type: [Number], // [lon, lat]
      required: false
    }
  },

  contact_info: {
    phone: { type: String, trim: true },
    email: { type: String, trim: true },
    website: { type: String, trim: true }
  },
  opening_hours: {
    mon: { type: String, default: '09:00-18:00' },
    tue: { type: String, default: '09:00-18:00' },
    wed: { type: String, default: '09:00-18:00' },
    thu: { type: String, default: '09:00-18:00' },
    fri: { type: String, default: '09:00-18:00' },
    sat: { type: String, default: '10:00-16:00' },
    sun: { type: String, default: 'closed' }
  },
  // Verification lifecycle
  verified: {
    type: String,
    enum: ['unverified', 'auto', 'manual', 'demo', 'rejected'],
    default: 'unverified',
    index: true
  },
  // Admin review note (e.g., rejection reason). Only returned on admin endpoints
  reviewNote: { type: String, trim: true },
  // Admin audit trail entries
  auditTrail: [{
    action: { type: String, enum: ['register', 'auto_verify', 'approve', 'reject'], required: true },
    admin: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    note: { type: String, trim: true },
    createdAt: { type: Date, default: Date.now }
  }],
  // Optional: auto-match score from Overpass candidate
  autoMatchScore: { type: Number, min: 0, max: 1 }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// 2dsphere index for GeoJSON location
PharmacySchema.index({ location: '2dsphere' });
// Enforce single-pharmacy-per-owner at DB level (nullable owner -> sparse)
PharmacySchema.index({ owner: 1 }, { unique: true, sparse: true });
// Ensure unique externalId when present to dedupe against Overpass
PharmacySchema.index({ externalId: 1 }, { unique: true, sparse: true });

// Virtual relation to Stock (one-to-many)
PharmacySchema.virtual('stock', {
  ref: 'Stock',
  localField: '_id',
  foreignField: 'pharmacy'
});

module.exports = mongoose.model('Pharmacy', PharmacySchema);

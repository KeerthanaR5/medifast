const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const refreshTokenSchema = new mongoose.Schema({
  token: {
    type: String,
    required: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  expiresAt: {
    type: Date,
    required: true
  }
});

const pharmacyDetailsSchema = new mongoose.Schema({
  licenseNumber: {
    type: String,
    required: true
  },
  pharmacyName: {
    type: String,
    required: true
  },
  address: {
    street: String,
    city: String,
    state: String,
    zipCode: String,
    country: { type: String, default: 'India' }
  },
  contactPerson: {
    name: String,
    phone: String,
    email: String
  },
  verified: {
    type: Boolean,
    default: false
  },
  verificationDocuments: [{
    type: String, // URLs to uploaded documents
  }]
});

const userSchema = new mongoose.Schema({
  fullName: {
    type: String,
    required: [true, 'Full name is required'],
    trim: true,
    maxlength: [100, 'Full name cannot exceed 100 characters']
  },
  email: {
    type: String,
    required: [true, 'Email is required'],
    unique: true,
    lowercase: true,
    trim: true,
    match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, 'Please enter a valid email']
  },
  password: {
    type: String,
    required: [true, 'Password is required'],
    minlength: [8, 'Password must be at least 8 characters'],
    select: false // Don't include password in queries by default
  },
  phone: {
    type: String,
    required: [true, 'Phone number is required'],
    unique: true,
    match: [/^[0-9]{10}$/, 'Please enter a valid 10-digit phone number']
  },
  role: {
    type: String,
    enum: ['customer', 'pharmacy', 'admin'],
    default: 'customer'
  },
  // NEW: User type for frontend compatibility (maps to role)
  userType: {
    type: String,
    enum: ['patient', 'pharmacy', 'admin'],
    default: 'patient'
  },
  address: {
    street: String,
    city: String,
    state: String,
    zipCode: String,
    country: { type: String, default: 'India' },
    coordinates: {
      type: [Number], // [longitude, latitude]
      index: '2dsphere'
    }
  },
  pharmacyDetails: pharmacyDetailsSchema,
  isActive: {
    type: Boolean,
    default: true
  },
  emailVerified: {
    type: Boolean,
    default: false
  },
  emailVerificationToken: String,
  emailVerificationExpires: Date,
  passwordResetToken: String,
  passwordResetExpires: Date,
  passwordChangedAt: Date,
  refreshTokens: [refreshTokenSchema],
  loginAttempts: {
    type: Number,
    default: 0
  },
  lockUntil: Date,
  lastLogin: Date,
  // NEW: Profile completion status for enhanced UX
  profileComplete: {
    type: Boolean,
    default: false
  },
  // NEW: User preferences for homepage personalization
  preferences: {
    language: { type: String, default: 'en' },
    notifications: { type: Boolean, default: true },
    location: { type: Boolean, default: false }
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true,
  toJSON: {
    transform: function(doc, ret) {
      delete ret.password;
      delete ret.passwordResetToken;
      delete ret.passwordResetExpires;
      delete ret.emailVerificationToken;
      delete ret.emailVerificationExpires;
      delete ret.refreshTokens;
      delete ret.loginAttempts;
      delete ret.lockUntil;
      delete ret.__v;
      return ret;
    }
  }
});

// Indexes for better query performance
userSchema.index({ role: 1 });
userSchema.index({ userType: 1 }); // NEW: Index for userType
// Ensure licenseNumber is unique only when it exists (avoid dup nulls for non-pharmacy users)
userSchema.index(
  { 'pharmacyDetails.licenseNumber': 1 },
  { unique: true, partialFilterExpression: { 'pharmacyDetails.licenseNumber': { $exists: true } } }
);

// Virtual for account lock status
userSchema.virtual('isLocked').get(function() {
  return !!(this.lockUntil && this.lockUntil > Date.now());
});


// NEW: Pre-save middleware to sync role and userType
userSchema.pre('save', function(next) {
  // Sync userType with role for frontend compatibility
  if (this.isModified('role')) {
    if (this.role === 'customer') this.userType = 'patient';
    else if (this.role === 'pharmacy') this.userType = 'pharmacy';
    else this.userType = this.role;
  }
  
  if (this.isModified('userType')) {
    if (this.userType === 'patient') this.role = 'customer';
    else if (this.userType === 'pharmacy') this.role = 'pharmacy';
    else this.role = this.userType;
  }
  
  next();
});

// Pre-save middleware to hash password if modified
userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  
  try {
    const salt = await bcrypt.genSalt(12);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// NEW: Pre-save middleware to check profile completion
userSchema.pre('save', function(next) {
  if (this.isModified('fullName') || this.isModified('email') || 
      this.isModified('phone') || this.isModified('address')) {
    
    const hasBasicInfo = this.fullName && this.email && this.phone;
    const hasAddress = this.address && this.address.city && this.address.state;
    
    if (this.role === 'pharmacy') {
      const hasPharmacyDetails = this.pharmacyDetails && 
                                this.pharmacyDetails.pharmacyName && 
                                this.pharmacyDetails.licenseNumber;
      this.profileComplete = hasBasicInfo && hasAddress && hasPharmacyDetails;
    } else {
      this.profileComplete = hasBasicInfo && hasAddress;
    }
  }
  next();
});

// Method to compare passwords
userSchema.methods.comparePassword = async function(candidatePassword) {
  if (!this.password) return false;
  return await bcrypt.compare(candidatePassword, this.password);
};

// Method to increment login attempts
userSchema.methods.incLoginAttempts = async function() {
  // If we have a previous lock that has expired, restart at 1
  if (this.lockUntil && this.lockUntil < Date.now()) {
    return this.updateOne({
      $unset: { lockUntil: 1 },
      $set: { loginAttempts: 1 }
    });
  }
  
  const updates = { $inc: { loginAttempts: 1 } };
  
  // Lock account after 5 failed attempts for 2 hours
  if (this.loginAttempts + 1 >= 5 && !this.isLocked) {
    updates.$set = { lockUntil: Date.now() + 2 * 60 * 60 * 1000 }; // 2 hours
  }
  
  return this.updateOne(updates);
};

// Method to reset login attempts
userSchema.methods.resetLoginAttempts = async function() {
  return this.updateOne({
    $unset: { loginAttempts: 1, lockUntil: 1 }
  });
};

// NEW: Method to get user dashboard data
userSchema.methods.getDashboardData = function() {
  return {
    id: this._id,
    fullName: this.fullName,
    email: this.email,
    phone: this.phone,
    userType: this.userType,
    role: this.role,
    profileComplete: this.profileComplete,
    emailVerified: this.emailVerified,
    preferences: this.preferences,
    isPharmacy: this.role === 'pharmacy',
    pharmacyVerified: this.role === 'pharmacy' ? this.pharmacyDetails?.verified : null
  };
};

// NEW: Static method to get user stats for homepage
userSchema.statics.getHomePageStats = async function() {
  const stats = await this.aggregate([
    {
      $group: {
        _id: null,
        totalUsers: { $sum: 1 },
        customers: { $sum: { $cond: [{ $eq: ['$role', 'customer'] }, 1, 0] } },
        pharmacies: { $sum: { $cond: [{ $eq: ['$role', 'pharmacy'] }, 1, 0] } },
        verifiedPharmacies: { 
          $sum: { 
            $cond: [
              { $and: [
                { $eq: ['$role', 'pharmacy'] }, 
                { $eq: ['$pharmacyDetails.verified', true] }
              ]}, 
              1, 
              0
            ] 
          }
        }
      }
    }
  ]);
  
  return stats[0] || {
    totalUsers: 0,
    customers: 0,
    pharmacies: 0,
    verifiedPharmacies: 0
  };
};

module.exports = mongoose.model('User', userSchema);

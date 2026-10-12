const express = require('express');
const rateLimit = require('express-rate-limit');
const { 
  register, 
  login, 
  refreshToken,
  forgotPassword, 
  resetPassword,
  logout,
  getProfile,
  healthCheck,
  // NEW: Additional controllers for enhanced homepage
  getHomeStats,
  validateToken,
  quickRegister,
  getDashboardData,
  updateProfile,
  updatePreferences,
  verifyEmail,
  resendVerification,
  getDetailedStats,
  testEmail // Added test email function
} = require('../controllers/authController');

const { authenticateToken } = require('../middlewares/authenticateToken');

// Create router instance
const router = express.Router();

// Rate limiting for auth routes
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 15, // Increased from 10 to 15 for better UX with popup modals
  message: {
    success: false,
    message: 'Too many authentication attempts, please try again later.'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

const resetLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 3, // limit each IP to 3 password reset requests per hour
  message: {
    success: false,
    message: 'Too many password reset attempts, please try again later.'
  }
});

// NEW: Rate limiter for stats endpoint (public but limited)
const statsLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 100, // High limit for homepage stats
  message: {
    success: false,
    message: 'Too many requests for statistics.'
  }
});

// NEW: Quick registration limiter (stricter for security)
const quickRegisterLimiter = rateLimit({
  windowMs: 10 * 60 * 1000, // 10 minutes
  max: 5, // limit quick registrations
  message: {
    success: false,
    message: 'Too many quick registration attempts.'
  }
});

// Simple admin middleware (inline to avoid import issues)
const requireAdmin = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      message: 'Authentication required'
    });
  }

  if (req.user.role !== 'admin') {
    return res.status(403).json({
      success: false,
      message: 'Admin privileges required'
    });
  }

  next();
};

// Public routes
router.get('/health', healthCheck);

// Test email endpoint (for debugging email configuration)
router.post('/test-email', testEmail);

// NEW: Homepage statistics endpoint (for animated counters)
router.get('/stats', statsLimiter, getHomeStats);

// Authentication routes with enhanced modal support
router.post('/register', authLimiter, register);
router.post('/login', authLimiter, login);

// NEW: Quick registration for modal popup (simplified flow)
router.post('/quick-register', quickRegisterLimiter, quickRegister);

// Token management
router.post('/refresh', refreshToken);

// NEW: Token validation endpoint (for frontend auth checks)
router.post('/validate-token', authenticateToken, validateToken);

// Password management
router.post('/forgot-password', resetLimiter, forgotPassword);
router.post('/reset-password', resetLimiter, resetPassword);

// Protected routes
router.post('/logout', authenticateToken, logout);
router.get('/profile', authenticateToken, getProfile);

// NEW: Enhanced profile routes for dashboard
router.put('/profile', authenticateToken, updateProfile);
router.get('/dashboard-data', authenticateToken, getDashboardData);

// NEW: User preference routes
router.put('/preferences', authenticateToken, updatePreferences);

// NEW: Account verification routes
router.post('/verify-email', authLimiter, verifyEmail);
router.post('/resend-verification', authLimiter, resendVerification);

// NEW: Admin routes for stats (if needed)
router.get('/admin/user-stats', authenticateToken, requireAdmin, getDetailedStats);

// Export the router
module.exports = router;

const path = require('path');
const fs = require('fs');

// ===============================================
// ENVIRONMENT SETUP AND DEBUGGING
// ===============================================

// Check if .env file exists and load it
const envPath = path.resolve(__dirname, '.env');
console.log('===============================================');
console.log('🔧 MediFast Backend Server Initialization');
console.log('===============================================');
console.log('📍 .env file path:', envPath);
console.log('📁 .env file exists:', fs.existsSync(envPath));

if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  console.log('📝 .env file size:', envContent.length, 'characters');
  
  // Load environment variables
  const dotenvResult = require('dotenv').config({ 
    path: envPath,
    debug: false  // Set to true for more debugging
  });
  
  if (dotenvResult.error) {
    console.error('❌ Error loading .env file:', dotenvResult.error);
  } else {
    console.log('✅ Environment variables loaded successfully');
  }
} else {
  if (process.env.NODE_ENV === 'test') {
    console.warn('⚠️  .env not found, continuing because NODE_ENV=test');
  } else {
    console.error('❌ .env file not found at:', envPath);
    console.log('📋 Please create a .env file with the following content:');
    console.log(`
NODE_ENV=development
PORT=5000
MONGODB_URI=your-mongodb-connection-string
JWT_ACCESS_SECRET=your-access-secret
JWT_REFRESH_SECRET=your-refresh-secret
CLIENT_URL=http://localhost:3000
`);
    process.exit(1);
  }
}

// ===============================================
// IMPORTS
// ===============================================
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');

// Import database utilities
const { 
  connectDB, 
  getConnectionStatus, 
  healthCheck, 
  createIndexes,
  getPerformanceMetrics 
} = require('./config/db');

// Import routes
const authRoutes = require('./routes/auth.routes');
const pharmaciesRoutes = require('./routes/pharmacies.routes');
const pharmacyOwnerRoutes = require('./routes/pharmacyOwner.routes');
const adminRoutes = require('./routes/admin.routes');
const reservationsRoutes = require('./routes/reservations.routes');
const mapsRoutes = require('./routes/maps.routes');
const medicinesRoutes = require('./routes/medicines.routes');
const { startReservationExpiryJob } = require('./jobs/reservationExpiry');

// ===============================================
// ENVIRONMENT VALIDATION
// ===============================================
console.log('🔍 Environment Variables Check:');
console.log('NODE_ENV:', process.env.NODE_ENV || 'undefined');
console.log('PORT:', process.env.PORT || 'undefined');
console.log('MONGODB_URI:', process.env.MONGODB_URI ? 'Found ✅' : 'Missing ❌');
console.log('JWT_ACCESS_SECRET:', process.env.JWT_ACCESS_SECRET ? 'Found ✅' : 'Missing ❌');
console.log('JWT_REFRESH_SECRET:', process.env.JWT_REFRESH_SECRET ? 'Found ✅' : 'Missing ❌');
console.log('CLIENT_URL:', process.env.CLIENT_URL || 'undefined');
console.log('🕐 Server startup time:', new Date().toISOString());
console.log('===============================================');

// Validate critical environment variables
const requiredEnvVars = [
  'MONGODB_URI', 
  'JWT_ACCESS_SECRET', 
  'JWT_REFRESH_SECRET'
];

const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);

if (missingVars.length > 0 && process.env.NODE_ENV !== 'test') {
  console.error('❌ Missing required environment variables:', missingVars.join(', '));
  console.error('📋 Please add these variables to your .env file');
  process.exit(1);
}

// ===============================================
// EXPRESS APP SETUP
// ===============================================
const app = express();

// Trust proxy for production deployments
app.set('trust proxy', 1);

// Generate request ID for tracking
app.use((req, res, next) => {
  req.id = require('crypto').randomBytes(8).toString('hex');
  res.setHeader('X-Request-ID', req.id);
  next();
});

// ===============================================
// SECURITY MIDDLEWARE
// ===============================================

// Helmet for security headers with CSP relaxed for modals
app.use(helmet({
  contentSecurityPolicy: process.env.NODE_ENV === 'production' ? {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"], // Allow inline styles for modal animations
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", "wss:", "ws:"], // Allow WebSocket connections
      fontSrc: ["'self'", "https:"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"],
    },
  } : false,
  crossOriginEmbedderPolicy: false
}));

// Compression for response optimization
app.use(compression());

// Enhanced rate limiting with different tiers
const createRateLimiter = (windowMs, max, message) => rateLimit({
  windowMs,
  max,
  message: {
    success: false,
    message,
    retryAfter: Math.ceil(windowMs / 1000)
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Different rate limits for different endpoint types
const generalLimiter = createRateLimiter(
  15 * 60 * 1000, // 15 minutes
  process.env.RATE_LIMIT_MAX_REQUESTS || 200, // Increased for modal usage
  'Too many requests from this IP, please try again later.'
);

const authLimiter = createRateLimiter(
  15 * 60 * 1000, // 15 minutes
  50, // Higher limit for auth endpoints
  'Too many authentication attempts, please try again later.'
);

const statsLimiter = createRateLimiter(
  1 * 60 * 1000, // 1 minute
  30, // Allow frequent stats requests for homepage
  'Too many statistics requests.'
);

if (process.env.NODE_ENV === 'production') {
  app.use('/api/auth', authLimiter);
  app.use('/api/stats', statsLimiter);
  app.use(generalLimiter);
}

// ===============================================
// CORS CONFIGURATION
// ===============================================
const corsOptions = {
  origin: function (origin, callback) {
    const allowedOrigins = (
      process.env.CORS_ORIGIN || 
      process.env.CLIENT_URL || 
      'http://localhost:3000'
    ).split(',').map(url => url.trim());
    
    // Allow requests with no origin (mobile apps, curl, etc.)
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      console.log('🚫 CORS blocked origin:', origin);
      callback(new Error('Not allowed by CORS policy'));
    }
  },
  credentials: true,
  optionsSuccessStatus: 200,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type', 
    'Authorization', 
    'X-Requested-With',
    'Origin',
    'Accept',
    'X-Request-ID' // Allow custom request ID header
  ]
};

app.use(cors(corsOptions));

// ===============================================
// BODY PARSING MIDDLEWARE
// ===============================================
app.use(express.json({ 
  limit: process.env.MAX_REQUEST_SIZE || '10mb',
  strict: true
}));

app.use(express.urlencoded({ 
  extended: true, 
  limit: process.env.MAX_REQUEST_SIZE || '10mb',
  parameterLimit: 50
}));

app.use(cookieParser());

// ===============================================
// LOGGING MIDDLEWARE
// ===============================================
const logFormat = process.env.NODE_ENV === 'production' ? 'combined' : 'dev';

if (process.env.ENABLE_REQUEST_LOGGING !== 'false') {
  app.use(morgan(logFormat, {
    skip: (req, res) => {
      // Skip logging for health checks and stats in production
      return process.env.NODE_ENV === 'production' && 
             (req.originalUrl === '/api/health' || req.originalUrl === '/api/stats');
    }
  }));
}

// ===============================================
// DATABASE CONNECTION
// ===============================================
const initializeDatabase = async () => {
  try {
    console.log('🔌 Initializing database connection...');
    await connectDB();
    
    // Create indexes for better performance
    await createIndexes();
    
    console.log('✅ Database initialization completed');
  } catch (error) {
    console.error('❌ Database initialization failed:', error.message);
    process.exit(1);
  }
};

// Initialize database connection (skip in tests; tests will connect via memory server)
if (process.env.NODE_ENV !== 'test') {
  initializeDatabase();
}

// ===============================================
// ENHANCED ROUTES
// ===============================================

// Enhanced health check route with database status
app.get('/api/health', async (req, res) => {
  try {
    const dbHealth = await healthCheck();
    const connectionStatus = getConnectionStatus();
    
    const healthInfo = {
      success: true,
      message: 'MediFast API is running',
      timestamp: new Date().toISOString(),
      version: process.env.API_VERSION || '1.0.0',
      environment: process.env.NODE_ENV || 'development',
      uptime: Math.floor(process.uptime()),
      database: dbHealth,
      connection: {
        status: connectionStatus.isConnected ? 'connected' : 'disconnected',
        lastConnected: connectionStatus.lastConnected
      }
    };

    // Add detailed info only in development
    if (process.env.NODE_ENV === 'development') {
      healthInfo.nodeVersion = process.version;
      healthInfo.platform = process.platform;
      healthInfo.requestId = req.id;
      healthInfo.memory = process.memoryUsage();
    }

    res.status(200).json(healthInfo);
  } catch (error) {
    console.error('Health check error:', error);
    res.status(503).json({
      success: false,
      message: 'Service unavailable',
      timestamp: new Date().toISOString(),
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal error'
    });
  }
});

// NEW: Homepage statistics endpoint for real-time counters
app.get('/api/stats', async (req, res) => {
  try {
    const User = require('./models/User');
    const stats = await User.getHomePageStats();
    
    res.json({
      success: true,
      data: {
        totalUsers: stats.customers || 0,
        pharmacies: stats.verifiedPharmacies || 0,
        medicines: 50000, // This would come from Medicine model when implemented
        support: '24/7'
      },
      timestamp: new Date().toISOString(),
      cached: false // Could implement caching later
    });
  } catch (error) {
    console.error('Stats endpoint error:', error);
    res.status(500).json({
      success: false,
      message: 'Unable to fetch statistics',
      data: {
        totalUsers: 10000,
        pharmacies: 500,
        medicines: 50000,
        support: '24/7'
      }
    });
  }
});

// NEW: Real-time server status for homepage "Backend: Connected" indicator
app.get('/api/status', (req, res) => {
  const connectionStatus = getConnectionStatus();
  
  res.json({
    success: true,
    status: 'online',
    database: connectionStatus.isConnected ? 'connected' : 'disconnected',
    timestamp: new Date().toISOString(),
    uptime: Math.floor(process.uptime())
  });
});

// Auth routes with enhanced logging
app.use('/api/auth', (req, res, next) => {
  if (process.env.NODE_ENV === 'development') {
    console.log(`🔐 Auth request: ${req.method} ${req.originalUrl} [ID: ${req.id}]`);
  }
  next();
}, authRoutes);

// Nearby pharmacies from Overpass (transient, unverified)
app.use('/api/pharmacies', pharmaciesRoutes);
// Owner management (stock/location)
app.use('/api/pharmacies', pharmacyOwnerRoutes);

// Admin routes (protected by middleware inside the router)
app.use('/api/admin', adminRoutes);

// Reservations
app.use('/api/reservations', reservationsRoutes);

// Maps (Ola proxy)
app.use('/api/maps', mapsRoutes);

// Medicines
app.use('/api/medicines', medicinesRoutes);

// Start background jobs (skip in tests)
if (process.env.NODE_ENV !== 'test') {
  startReservationExpiryJob();
}

// NEW: Performance metrics endpoint (development/admin only)
if (process.env.NODE_ENV === 'development') {
  app.get('/api/metrics', async (req, res) => {
    try {
      const perfMetrics = await getPerformanceMetrics();
      
      res.json({
        success: true,
        metrics: {
          uptime: Math.floor(process.uptime()),
          memory: process.memoryUsage(),
          cpu: process.cpuUsage(),
          timestamp: new Date().toISOString(),
          requests: {
            id: req.id
          },
          database: perfMetrics
        }
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Unable to fetch metrics'
      });
    }
  });
}

// API documentation route (development only)
if (process.env.NODE_ENV === 'development') {
  app.get('/api/docs', (req, res) => {
    res.status(200).json({
      success: true,
      message: 'MediFast API Documentation',
      version: process.env.API_VERSION || '1.0.0',
      baseUrl: `${req.protocol}://${req.get('host')}/api`,
      endpoints: {
        health: {
          method: 'GET',
          path: '/health',
          description: 'Check API and database health status'
        },
        stats: {
          method: 'GET',
          path: '/stats',
          description: 'Get homepage statistics (users, pharmacies, etc.)'
        },
        status: {
          method: 'GET',
          path: '/status',
          description: 'Get real-time server status'
        },
        auth: {
          register: {
            method: 'POST',
            path: '/auth/register',
            description: 'Register new user'
          },
          login: {
            method: 'POST',
            path: '/auth/login',
            description: 'User login'
          },
          'quick-register': {
            method: 'POST',
            path: '/auth/quick-register',
            description: 'Quick registration for modal popup'
          },
          'validate-token': {
            method: 'POST',
            path: '/auth/validate-token',
            description: 'Validate JWT token'
          },
          refresh: {
            method: 'POST',
            path: '/auth/refresh',
            description: 'Refresh access token'
          },
          'forgot-password': {
            method: 'POST',
            path: '/auth/forgot-password',
            description: 'Request password reset'
          },
          'reset-password': {
            method: 'POST',
            path: '/auth/reset-password',
            description: 'Reset password with token'
          },
          profile: {
            method: 'GET',
            path: '/auth/profile',
            description: 'Get user profile (requires auth)'
          },
          'dashboard-data': {
            method: 'GET',
            path: '/auth/dashboard-data',
            description: 'Get dashboard data (requires auth)'
          },
          logout: {
            method: 'POST',
            path: '/auth/logout',
            description: 'User logout (requires auth)'
          }
        }
      }
    });
  });
}

// ===============================================
// ERROR HANDLING
// ===============================================

// 404 handler for undefined routes
app.use((req, res) => {
  if (process.env.NODE_ENV === 'development') {
    console.log(`❌ 404 - Route not found: ${req.method} ${req.originalUrl} [ID: ${req.id}]`);
  }
  
  res.status(404).json({
    success: false,
    message: `Route ${req.method} ${req.originalUrl} not found`,
    requestId: req.id,
    timestamp: new Date().toISOString(),
    availableEndpoints: process.env.NODE_ENV === 'development' ? {
      health: 'GET /api/health',
      stats: 'GET /api/stats',
      status: 'GET /api/status',
      docs: 'GET /api/docs',
      auth: 'POST /api/auth/*'
    } : undefined
  });
});

// Global error handling middleware
app.use((error, req, res, next) => {
  const errorId = require('crypto').randomBytes(8).toString('hex');
  
  // Log error details
  console.error(`🚨 Error [${errorId}]:`, {
    message: error.message,
    stack: process.env.NODE_ENV === 'development' ? error.stack : 'Hidden in production',
    requestId: req.id,
    method: req.method,
    url: req.originalUrl,
    userAgent: req.get('User-Agent'),
    ip: req.ip,
    timestamp: new Date().toISOString()
  });

  // Determine error status
  const status = error.status || error.statusCode || 500;
  
  // Handle specific error types
  let message = 'Internal server error';
  
  if (process.env.NODE_ENV === 'development') {
    message = error.message;
  } else {
    // Production-friendly error messages
    switch (status) {
      case 400:
        message = 'Bad request';
        break;
      case 401:
        message = 'Unauthorized';
        break;
      case 403:
        message = 'Forbidden';
        break;
      case 404:
        message = 'Not found';
        break;
      case 429:
        message = 'Too many requests';
        break;
      case 500:
      default:
        message = 'Internal server error';
        break;
    }
  }
  
  // Prepare error response
  const errorResponse = {
    success: false,
    message: message,
    errorId: errorId,
    requestId: req.id,
    timestamp: new Date().toISOString()
  };

  // Add stack trace in development
  if (process.env.NODE_ENV === 'development' && process.env.ENABLE_STACK_TRACE === 'true') {
    errorResponse.stack = error.stack;
  }

  res.status(status).json(errorResponse);
});

// ===============================================
// SERVER STARTUP
// ===============================================
const PORT = process.env.PORT || 5000;
let server;

const startServer = () => {
  if (server) {
    return server;
  }

  server = app.listen(PORT, () => {
    console.log('===============================================');
    console.log('🚀 MediFast Backend Server Started Successfully');
    console.log(`📡 Server running on port ${PORT}`);
    console.log(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`🔗 API URL: http://localhost:${PORT}/api`);
    console.log(`🏥 Health Check: http://localhost:${PORT}/api/health`);
    console.log(`📊 Statistics: http://localhost:${PORT}/api/stats`);
    console.log(`⚡ Status: http://localhost:${PORT}/api/status`);

    if (process.env.NODE_ENV === 'development') {
      console.log(`📚 API Docs: http://localhost:${PORT}/api/docs`);
      console.log(`📈 Metrics: http://localhost:${PORT}/api/metrics`);
    }

    console.log(`🕐 Started at: ${new Date().toISOString()}`);
    console.log('===============================================');
  });

  return server;
};

// ===============================================
// GRACEFUL SHUTDOWN
// ===============================================
const gracefulShutdown = (signal) => {
  if (!server) {
    return;
  }

  console.log(`\n👋 ${signal} received. Shutting down gracefully...`);

  server.close((err) => {
    if (err) {
      console.error('❌ Error during server shutdown:', err);
      process.exit(1);
    }

    console.log('🔌 HTTP server closed');

    mongoose.connection.close(false, (err) => {
      if (err) {
        console.error('❌ Error closing MongoDB connection:', err);
        process.exit(1);
      }

      console.log('📚 MongoDB connection closed');
      console.log('✅ Graceful shutdown completed');
      process.exit(0);
    });
  });

  // Force shutdown after 10 seconds
  setTimeout(() => {
    console.error('⏰ Graceful shutdown timeout, forcing exit');
    process.exit(1);
  }, 10000);
};

if (require.main === module) {
  startServer();

  // Handle shutdown signals
  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));

  // Handle uncaught exceptions
  process.on('uncaughtException', (error) => {
    console.error('💥 Uncaught Exception:', error);
    gracefulShutdown('UNCAUGHT_EXCEPTION');
  });

  // Handle unhandled promise rejections
  process.on('unhandledRejection', (reason, promise) => {
    console.error('🚨 Unhandled Rejection at:', promise, 'reason:', reason);
    gracefulShutdown('UNHANDLED_REJECTION');
  });
}

// Export for testing purposes
module.exports = app;
module.exports.startServer = startServer;

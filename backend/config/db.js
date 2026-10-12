const path = require('path');
const mongoose = require('mongoose');
const dotenv = require('dotenv');

dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

// Connection state tracking for homepage status indicator
let connectionStatus = {
  isConnected: false,
  lastConnected: null,
  reconnectAttempts: 0,
  stats: {
    totalConnections: 0,
    errors: 0,
    lastError: null
  }
};

const connectDB = async () => {
  try {
    // Updated connection options for MongoDB Driver v6+ compatibility
    const connectionOptions = {
      maxPoolSize: 10, // Maximum number of socket connections
      serverSelectionTimeoutMS: 5000, // How long to try connecting before timing out
      socketTimeoutMS: 45000, // Close sockets after 45 seconds of inactivity
      // Removed deprecated options:
      // - bufferCommands (no longer needed)
      // - bufferMaxEntries (deprecated and causing error)
    };

    const conn = await mongoose.connect(process.env.MONGODB_URI, connectionOptions);
    
    // Update connection status
    connectionStatus.isConnected = true;
    connectionStatus.lastConnected = new Date();
    connectionStatus.stats.totalConnections++;
    connectionStatus.reconnectAttempts = 0;
    
    console.log(`✅ MongoDB connected successfully`);
    console.log(`📊 Connection state: ${conn.connection.readyState}`);
    console.log(`🔗 MongoDB host: ${conn.connection.host}`);
    console.log(`📚 Database: ${conn.connection.name}`);
    console.log(`⏰ Connected at: ${connectionStatus.lastConnected.toISOString()}`);
    
    // Setup connection event listeners for real-time monitoring
    setupConnectionListeners(conn);
    
    return conn;
  } catch (error) {
    console.error('❌ Database connection error:', error.message);
    
    // Update error stats
    connectionStatus.isConnected = false;
    connectionStatus.stats.errors++;
    connectionStatus.stats.lastError = {
      message: error.message,
      timestamp: new Date()
    };
    
    process.exit(1);
  }
};

// Setup connection event listeners for monitoring
const setupConnectionListeners = (conn) => {
  // Connection successful
  conn.connection.on('connected', () => {
    console.log('🟢 Mongoose connected to MongoDB');
    connectionStatus.isConnected = true;
    connectionStatus.lastConnected = new Date();
  });

  // Connection error
  conn.connection.on('error', (err) => {
    console.error('🔴 Mongoose connection error:', err);
    connectionStatus.stats.errors++;
    connectionStatus.stats.lastError = {
      message: err.message,
      timestamp: new Date()
    };
  });

  // Connection disconnected
  conn.connection.on('disconnected', () => {
    console.log('🟡 Mongoose disconnected from MongoDB');
    connectionStatus.isConnected = false;
  });

  // Connection reconnected
  conn.connection.on('reconnected', () => {
    console.log('🔄 Mongoose reconnected to MongoDB');
    connectionStatus.isConnected = true;
    connectionStatus.lastConnected = new Date();
    connectionStatus.reconnectAttempts++;
  });

  // Application termination
  process.on('SIGINT', async () => {
    try {
      await conn.connection.close();
      console.log('🛑 MongoDB connection closed through app termination');
      process.exit(0);
    } catch (error) {
      console.error('❌ Error closing MongoDB connection:', error);
      process.exit(1);
    }
  });
};

// Get connection status for homepage backend status indicator
const getConnectionStatus = () => {
  return {
    ...connectionStatus,
    currentState: mongoose.connection.readyState,
    stateDescription: getConnectionStateDescription(mongoose.connection.readyState)
  };
};

// Helper function to describe connection states
const getConnectionStateDescription = (state) => {
  const states = {
    0: 'Disconnected',
    1: 'Connected',
    2: 'Connecting',
    3: 'Disconnecting'
  };
  return states[state] || 'Unknown';
};

// Database health check function for API endpoint
const healthCheck = async () => {
  try {
    const status = getConnectionStatus();
    
    if (!status.isConnected) {
      return {
        healthy: false,
        status: 'disconnected',
        message: 'Database not connected'
      };
    }

    // Perform a simple ping to ensure database is responsive
    await mongoose.connection.db.admin().ping();
    
    // Get database stats
    const dbStats = await mongoose.connection.db.stats();
    
    return {
      healthy: true,
      status: 'connected',
      message: 'Database is healthy',
      connectionStatus: status,
      dbStats: {
        collections: dbStats.collections,
        dataSize: formatBytes(dbStats.dataSize),
        storageSize: formatBytes(dbStats.storageSize),
        indexes: dbStats.indexes
      },
      uptime: status.lastConnected ? 
        Math.floor((new Date() - status.lastConnected) / 1000) : 0
    };
  } catch (error) {
    return {
      healthy: false,
      status: 'error',
      message: error.message,
      connectionStatus: getConnectionStatus()
    };
  }
};

// Format bytes helper function
const formatBytes = (bytes) => {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

// Initialize database indexes for better performance (FIXED)
const createIndexes = async () => {
  try {
    console.log('🔍 Creating database indexes...');
    
    // Get User model
    const User = require('../models/User');
    
    // Create indexes only if they don't exist to avoid duplicates
    const collections = await mongoose.connection.db
  .listCollections({ name: User.collection.name })
  .toArray();

let indexNames = [];

if (collections.length > 0) {
  const existingIndexes = await User.collection.getIndexes();
  indexNames = Object.keys(existingIndexes);
}
    
    // Only create indexes that don't already exist
    if (!indexNames.some(name => name.includes('email_1_isActive_1'))) {
      await User.collection.createIndex({ email: 1, isActive: 1 }, { name: 'email_isActive_compound' });
    }
    
    if (!indexNames.some(name => name.includes('role_1_createdAt_-1'))) {
      await User.collection.createIndex({ role: 1, createdAt: -1 }, { name: 'role_createdAt_compound' });
    }
    
    if (!indexNames.some(name => name.includes('pharmacyDetails.verified_1_role_1'))) {
      await User.collection.createIndex({ 
        'pharmacyDetails.verified': 1, 
        role: 1 
      }, { name: 'pharmacy_verified_role_compound' });
    }
    
    console.log('✅ Database indexes created successfully');
  } catch (error) {
    console.error('❌ Error creating indexes:', error.message);
  }
};

// Database performance monitoring
const getPerformanceMetrics = async () => {
  try {
    const User = require('../models/User');
    
    // Get collection stats
    const userStats = await User.collection.stats();
    
    // Get current operations
    const currentOps = await mongoose.connection.db.admin().command({
      currentOp: true,
      active: true
    });
    
    return {
      collections: {
        users: {
          count: userStats.count,
          size: formatBytes(userStats.size),
          avgObjSize: formatBytes(userStats.avgObjSize),
          storageSize: formatBytes(userStats.storageSize),
          indexes: userStats.nindexes
        }
      },
      activeOperations: currentOps.inprog.length,
      connectionPool: {
        current: mongoose.connection.readyState,
        max: 10 // From our connection options
      }
    };
  } catch (error) {
    console.error('Error getting performance metrics:', error);
    return null;
  }
};

module.exports = {
  connectDB,
  getConnectionStatus,
  healthCheck,
  createIndexes,
  getPerformanceMetrics
};

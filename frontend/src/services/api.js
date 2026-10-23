import axios from 'axios';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';

// Create axios instance with enhanced configuration
const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000, // 30 second timeout for bulk uploads
  headers: {
    'Content-Type': 'application/json',
  },
});

// Enhanced request interceptor
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('authToken') || localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    
    // Add request ID for debugging
    config.headers['X-Request-ID'] = Math.random().toString(36).substr(2, 9);
    
    return config;
  },
  async (error) => {
    console.error('Request interceptor error:', error);
    return Promise.reject(error);
  }
);

// Enhanced response interceptor with error handling
api.interceptors.response.use(
  (response) => {
    return response;
  },
  (error) => {
    console.error('API Error:', error);

    const originalRequest = error.config;

    // If unauthorized, try token refresh flow (once) using promise chain
    if (error.response && error.response.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;

      const refreshClient = axios.create({ baseURL: API_BASE_URL, timeout: 30000 });
      return refreshClient.post('/auth/refresh', {}, { withCredentials: true })
        .then((refreshResp) => {
          if (refreshResp && refreshResp.data && refreshResp.data.success && refreshResp.data.token) {
            const newToken = refreshResp.data.token;
            localStorage.setItem('authToken', newToken);
            api.defaults.headers.common.Authorization = `Bearer ${newToken}`;
            originalRequest.headers = originalRequest.headers || {};
            originalRequest.headers.Authorization = `Bearer ${newToken}`;
            return api(originalRequest);
          }
          // refresh did not provide token
          localStorage.removeItem('authToken');
          localStorage.removeItem('token');
          localStorage.removeItem('userData');
          if (window.location.pathname !== '/') window.location.href = '/';
          return Promise.reject({ message: 'Session expired' });
        })
        .catch((refreshErr) => {
          console.error('Token refresh failed:', refreshErr);
          localStorage.removeItem('authToken');
          localStorage.removeItem('token');
          localStorage.removeItem('userData');
          if (window.location.pathname !== '/') window.location.href = '/';
          return Promise.reject({ message: 'Session expired' });
        });
    }

    if (error.response) {
      // Handle other specific HTTP status codes
      switch (error.response.status) {
        case 403:
          console.error('Access forbidden:', error.response.data?.message);
          break;
        case 429:
          console.error('Rate limit exceeded');
          break;
        case 500:
          console.error('Server error:', error.response.data?.message);
          break;
        default:
          console.error(`HTTP ${error.response.status}:`, error.response.data?.message);
      }

      return Promise.reject({
        message: error.response.data?.message || `HTTP ${error.response.status} Error`,
        status: error.response.status,
        data: error.response.data
      });
    }

    if (error.request) {
      console.error('Network error:', error.message);
      return Promise.reject({ message: 'Network error. Please check your connection.', status: 0, isNetworkError: true });
    }

    return Promise.reject({ message: error.message || 'An unexpected error occurred', status: 0 });
  }
);

// ===============================================
// ENHANCED AUTHENTICATION API
// ===============================================

export const authAPI = {
  /**
   * User login
   */
  login: async (credentials) => {
    try {
      const response = await api.post('/auth/login', {
        email: credentials.email,
        password: credentials.password
      });
      
      // Store auth data on successful login
      if (response.data.success && response.data.token) {
        localStorage.setItem('authToken', response.data.token);
        localStorage.setItem('userData', JSON.stringify(response.data.user));
      }
      
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  /**
   * User registration
   */
  register: async (userData) => {
    try {
      const response = await api.post('/auth/register', {
        fullName: userData.fullName,
        email: userData.email,
        password: userData.password,
        phone: userData.phone,
        userType: userData.userType || 'patient'
      });
      
      // Store auth data on successful registration
      if (response.data.success && response.data.token) {
        localStorage.setItem('authToken', response.data.token);
        localStorage.setItem('userData', JSON.stringify(response.data.user));
      }
      
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  /**
   * Quick registration for modal popup
   */
  quickRegister: async (userData) => {
    try {
      const response = await api.post('/auth/quick-register', userData);
      
      if (response.data.success && response.data.token) {
        localStorage.setItem('authToken', response.data.token);
        localStorage.setItem('userData', JSON.stringify(response.data.user));
      }
      
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  /**
   * Validate authentication token
   */
  validateToken: async () => {
    try {
      const response = await api.post('/auth/validate-token');
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  /**
   * Refresh access token
   */
  refreshToken: async () => {
    try {
      const response = await api.post('/auth/refresh');
      
      if (response.data.success && response.data.token) {
        localStorage.setItem('authToken', response.data.token);
      }
      
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  /**
   * User logout
   */
  logout: async () => {
    try {
      await api.post('/auth/logout');
    } catch (error) {
      console.error('Logout API error:', error);
      // Continue with local cleanup even if API call fails
    } finally {
      // Always clear local storage
      localStorage.removeItem('authToken');
      localStorage.removeItem('token');
      localStorage.removeItem('userData');
    }
  },

  /**
   * Forgot password
   */
  forgotPassword: async (email) => {
    try {
      const response = await api.post('/auth/forgot-password', { email });
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  /**
   * Reset password
   */
  resetPassword: async (token, newPassword) => {
    try {
      const response = await api.post('/auth/reset-password', { 
        token, 
        password: newPassword 
      });
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  /**
   * Get user profile
   */
  getProfile: async () => {
    try {
      const response = await api.get('/auth/profile');
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  /**
   * Update user profile
   */
  updateProfile: async (profileData) => {
    try {
      const response = await api.put('/auth/profile', profileData);
      
      // Update local storage with new user data
      if (response.data.success && response.data.user) {
        localStorage.setItem('userData', JSON.stringify(response.data.user));
      }
      
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  /**
   * Get dashboard data
   */
  getDashboardData: async () => {
    try {
      const response = await api.get('/auth/dashboard-data');
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  /**
   * Update user preferences
   */
  updatePreferences: async (preferences) => {
    try {
      const response = await api.put('/auth/preferences', preferences);
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  /**
   * Verify email
   */
  verifyEmail: async (token) => {
    try {
      const response = await api.post('/auth/verify-email', { token });
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  /**
   * Resend verification email
   */
  resendVerification: async () => {
    try {
      const response = await api.post('/auth/resend-verification');
      return response.data;
    } catch (error) {
      throw error;
    }
  }
};

export const pharmacyOwnerAPI = {
  getMine: async () => {
    const response = await api.get('/pharmacies/mine');
    return response.data;
  },
  getDashboard: async () => {
    const response = await api.get('/pharmacies/mine/dashboard');
    return response.data;
  },
  listReservations: async (status = 'pending') => {
    const response = await api.get('/pharmacies/mine/reservations', { params: { status } });
    return response.data;
  },
  updateProfile: async (pharmacyId, profile) => {
    const response = await api.put(`/pharmacies/${pharmacyId}/profile`, profile);
    return response.data;
  },
  updateLocation: async (pharmacyId, lat, lon) => {
    const response = await api.put(`/pharmacies/${pharmacyId}/location`, { lat, lon });
    return response.data;
  },
  bulkUpsertStock: async (pharmacyId, rows) => {
    // Use extended timeout for bulk operations
    const bulkApi = axios.create({
      baseURL: API_BASE_URL,
      timeout: 120000, // 2 minutes for bulk uploads
      headers: {
        'Content-Type': 'application/json',
      },
    });
    
    // Copy interceptors
    bulkApi.interceptors.request.use(
      (config) => {
        const token = localStorage.getItem('authToken') || localStorage.getItem('token');
        if (token) {
          config.headers.Authorization = `Bearer ${token}`;
        }
        config.headers['X-Request-ID'] = Math.random().toString(36).substr(2, 9);
        return config;
      },
      (error) => Promise.reject(error)
    );
    
    bulkApi.interceptors.response.use(
      (response) => response,
      (error) => {
        if (error.response) {
          return Promise.reject({
            message: error.response.data?.message || `HTTP ${error.response.status} Error`,
            status: error.response.status,
            data: error.response.data
          });
        }
        if (error.request) {
          return Promise.reject({ message: 'Network error. Please check your connection.', status: 0, isNetworkError: true });
        }
        return Promise.reject({ message: error.message || 'An unexpected error occurred', status: 0 });
      }
    );

    const response = await bulkApi.post(`/pharmacies/${pharmacyId}/stock/bulk`, { rows });
    return response.data;
  }
};

export const reservationsAPI = {
  confirm: async (reservationId) => {
    const response = await api.patch(`/reservations/${reservationId}/confirm`);
    return response.data;
  },
  cancel: async (reservationId) => {
    const response = await api.patch(`/reservations/${reservationId}/cancel`);
    return response.data;
  },
  pickup: async (reservationId) => {
    const response = await api.patch(`/reservations/${reservationId}/pickup`);
    return response.data;
  }
};

// ===============================================
// MAPS (Ola) API proxies
// ===============================================

export const mapsAPI = {
  olaAutocomplete: async ({ input, location, radius, strictbounds, language } = {}) => {
    const response = await api.get('/maps/ola/autocomplete', {
      params: { input, location, radius, strictbounds, language }
    });
    return response.data;
  },
  olaGeocode: async ({ address, input, language } = {}) => {
    const response = await api.get('/maps/ola/geocode', { params: { address: address || input, language } });
    return response.data;
  }
};

// ===============================================
// HOMEPAGE & STATISTICS API
// ===============================================

export const statsAPI = {
  /**
   * Get homepage statistics
   */
  getHomeStats: async () => {
    try {
      const response = await api.get('/stats');
      return response.data;
    } catch (error) {
      // Return default stats if API fails
      console.error('Error fetching stats:', error);
      return {
        success: false,
        data: {
          totalUsers: 10000,
          pharmacies: 500,
          medicines: 50000,
          support: '24/7'
        }
      };
    }
  },

  /**
   * Get server status
   */
  getServerStatus: async () => {
    try {
      const response = await api.get('/status');
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  /**
   * Get detailed admin statistics
   */
  getAdminStats: async () => {
    try {
      const response = await api.get('/auth/admin/user-stats');
      return response.data;
    } catch (error) {
      throw error;
    }
  }
};

// ===============================================
// ENHANCED HEALTH CHECK
// ===============================================

export const healthCheck = async () => {
  try {
    const response = await api.get('/health');
    return response.data;
  } catch (error) {
    throw error;
  }
};

// ===============================================
// CONNECTION STATUS API
// ===============================================

export const connectionAPI = {
  /**
   * Check if backend is reachable
   */
  checkConnection: async () => {
    try {
      const response = await axios.get(`${API_BASE_URL}/health`, {
        timeout: 5000
      });
      return response.status === 200;
    } catch (error) {
      return false;
    }
  },

  /**
   * Get connection status for homepage indicator
   */
  getConnectionStatus: async () => {
    try {
      const response = await axios.get(`${API_BASE_URL}/status`, {
        timeout: 3000
      });
      
      return {
        status: 'connected',
        data: response.data
      };
    } catch (error) {
      return {
        status: 'disconnected',
        error: error.response?.status || 'Network Error'
      };
    }
  }
};

// ===============================================
// FUTURE PHARMACY API (PLACEHOLDER)
// ===============================================

export const pharmacyAPI = {
  /**
   * Search pharmacies
   */
  searchPharmacies: async (query, location = null) => {
    try {
      const params = { q: query };
      if (location) {
        params.lat = location.lat;
        params.lng = location.lng;
      }
      
      const response = await api.get('/pharmacies/search', { params });
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  /**
   * Get pharmacy details
   */
  getPharmacyDetails: async (pharmacyId) => {
    try {
      const response = await api.get(`/pharmacies/${pharmacyId}`);
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  /**
   * Get nearby pharmacies
   */
  // radiusKm: search radius in kilometers (converted to meters for backend)
  getNearbyPharmacies: async (location, radiusKm = 3) => {
    try {
      const response = await api.get('/pharmacies/nearby', {
        params: {
          lat: location.lat,
          lon: location.lon ?? location.lng, // support both shapes
          radius: Math.max(100, Math.min(20000, Math.round((radiusKm || 3) * 1000)))
        }
      });
      return response.data;
    } catch (error) {
      throw error;
    }
  },
  getPharmacyDetail: async (pharmacyId, opts = {}) => {
    const response = await api.get(`/pharmacies/${pharmacyId}/detail`, {
      params: {
        lat: opts.lat,
        lon: opts.lon ?? opts.lng,
        medicine: opts.medicine
      }
    });
    return response.data;
  }
};

// ===============================================
// FUTURE MEDICINE API (PLACEHOLDER)
// ===============================================

export const medicineAPI = {
  /**
   * Search medicines
   */
  searchMedicines: async (query, filters = {}) => {
    try {
      const params = { q: query, ...filters };
      const response = await api.get('/medicines/search', { params });
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  /**
   * Get medicine details
   */
  getMedicineDetails: async (medicineId) => {
    try {
      const response = await api.get(`/medicines/${medicineId}`);
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  /**
   * Check medicine availability
   */
  checkAvailability: async (medicineId, location = null) => {
    try {
      const params = { medicineId };
      if (location) {
        params.lat = location.lat;
        params.lng = location.lng;
      }
      
      const response = await api.get('/medicines/availability', { params });
      return response.data;
    } catch (error) {
      throw error;
    }
  }
};

// ===============================================
// UTILITY FUNCTIONS
// ===============================================

/**
 * Check if user is authenticated
 */
export const isAuthenticated = () => {
  const token = localStorage.getItem('authToken') || localStorage.getItem('token');
  const userData = localStorage.getItem('userData');
  return !!(token && userData);
};

/**
 * Get current user data
 */
export const getCurrentUser = () => {
  try {
    const userData = localStorage.getItem('userData');
    return userData ? JSON.parse(userData) : null;
  } catch (error) {
    console.error('Error parsing user data:', error);
    return null;
  }
};

/**
 * Get authentication token
 */
export const getAuthToken = () => {
  return localStorage.getItem('authToken') || localStorage.getItem('token');
};

/**
 * Clear authentication data
 */
export const clearAuthData = () => {
  localStorage.removeItem('authToken');
  localStorage.removeItem('token');
  localStorage.removeItem('userData');
};

/**
 * Set authentication data
 */
export const setAuthData = (token, user) => {
  localStorage.setItem('authToken', token);
  localStorage.setItem('userData', JSON.stringify(user));
};

// ===============================================
// ENHANCED DEFAULT EXPORT
// ===============================================

const enhancedAPI = Object.assign(api, {
  // Original axios instance
  // Preserve Axios instance methods and interceptors.
  
  // Organized API modules
  auth: authAPI,
  stats: statsAPI,
  pharmacy: pharmacyAPI,
  medicine: medicineAPI,
  pharmacyOwner: pharmacyOwnerAPI,
  reservations: reservationsAPI,
  connection: connectionAPI,
  
  // Utility functions
  utils: {
    isAuthenticated,
    getCurrentUser,
    getAuthToken,
    clearAuthData,
    setAuthData
  },
  
  // Direct exports for backward compatibility
  healthCheck
});

export default enhancedAPI;



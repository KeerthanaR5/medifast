import React, { useState, useEffect } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import LoadingSpinner from './LoadingSpinner';

const API_BASE_URL = (
  process.env.REACT_APP_API_URL || 'http://localhost:5000'
).replace(/\/$/, '').replace(/\/api$/, '');

const ProtectedRoute = ({ 
  children, 
  requiredRole = null, 
  requireEmailVerification = false,
  requireCompleteProfile = false,
  fallbackPath = '/',
  showAuthModal = true 
}) => {
  const [authState, setAuthState] = useState({
    isLoading: true,
    isAuthenticated: false,
    user: null,
    token: null
  });
  
  const location = useLocation();

  // Check authentication status
  useEffect(() => {
    const validateAuth = async () => {
      try {
        const token = localStorage.getItem('authToken');
        const userData = localStorage.getItem('userData');

        if (!token || !userData) {
          setAuthState({
            isLoading: false,
            isAuthenticated: false,
            user: null,
            token: null
          });
          return;
        }

        // Parse user data
        let user;
        try {
          user = JSON.parse(userData);
        } catch (error) {
          console.error('Error parsing user data:', error);
          localStorage.removeItem('authToken');
          localStorage.removeItem('userData');
          setAuthState({
            isLoading: false,
            isAuthenticated: false,
            user: null,
            token: null
          });
          return;
        }

        // Validate token with backend
        const response = await fetch(`${API_BASE_URL}/api/auth/validate-token`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          }
        });

        if (response.ok) {
          const data = await response.json();
          setAuthState({
            isLoading: false,
            isAuthenticated: true,
            user: data.user || user,
            token: token
          });
        } else {
          // Token is invalid, clear storage
          localStorage.removeItem('authToken');
          localStorage.removeItem('userData');
          setAuthState({
            isLoading: false,
            isAuthenticated: false,
            user: null,
            token: null
          });
        }
      } catch (error) {
        console.error('Auth validation error:', error);
        // Network error - keep existing auth state but mark as not loading
        const token = localStorage.getItem('authToken');
        const userData = localStorage.getItem('userData');
        
        if (token && userData) {
          try {
            const user = JSON.parse(userData);
            setAuthState({
              isLoading: false,
              isAuthenticated: true,
              user: user,
              token: token
            });
          } catch (parseError) {
            setAuthState({
              isLoading: false,
              isAuthenticated: false,
              user: null,
              token: null
            });
          }
        } else {
          setAuthState({
            isLoading: false,
            isAuthenticated: false,
            user: null,
            token: null
          });
        }
      }
    };

    validateAuth();
  }, []);

  // Show loading spinner while checking auth
  if (authState.isLoading) {
    return (
      <div style={{ 
        display: 'flex', 
        flexDirection: 'column', 
        alignItems: 'center', 
        justifyContent: 'center', 
        minHeight: '50vh',
        gap: '1rem',
        padding: '2rem',
        textAlign: 'center'
      }}>
        <LoadingSpinner size="large" />
        <p style={{ 
          margin: 0, 
          color: '#64748b', 
          fontSize: '1rem',
          fontWeight: '500'
        }}>
          Verifying authentication...
        </p>
      </div>
    );
  }

  // Not authenticated - redirect to home with auth modal trigger
  if (!authState.isAuthenticated) {
    // Store intended destination for redirect after login
    const state = { 
      from: location.pathname,
      showAuthModal: showAuthModal,
      authType: 'login'
    };
    
    return <Navigate to={fallbackPath} state={state} replace />;
  }

  // Check role requirements
  if (requiredRole && authState.user.userType !== requiredRole && authState.user.role !== requiredRole) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '50vh',
        padding: '2rem'
      }}>
        <div style={{
          textAlign: 'center',
          maxWidth: '500px',
          background: 'white',
          borderRadius: '16px',
          padding: '2rem',
          boxShadow: '0 4px 20px rgba(0, 0, 0, 0.08)',
          border: '1px solid #e2e8f0'
        }}>
          <h2 style={{
            marginBottom: '1rem',
            color: '#1e293b',
            fontSize: '1.75rem',
            fontWeight: '700'
          }}>
            🚫 Access Denied
          </h2>
          <p style={{
            color: '#64748b',
            lineHeight: '1.6',
            marginBottom: '1rem'
          }}>
            You don't have permission to access this page.<br />
            Required role: <strong style={{ color: '#1e293b' }}>{requiredRole}</strong>
          </p>
          <p style={{
            color: '#64748b',
            lineHeight: '1.6',
            marginBottom: '1.5rem'
          }}>
            Your role: <strong style={{ color: '#1e293b' }}>
              {authState.user.userType || authState.user.role}
            </strong>
          </p>
          <button 
            style={{
              background: 'linear-gradient(135deg, #667eea, #764ba2)',
              color: 'white',
              border: 'none',
              padding: '0.75rem 1.5rem',
              borderRadius: '8px',
              fontSize: '1rem',
              fontWeight: '600',
              cursor: 'pointer',
              transition: 'all 0.2s ease'
            }}
            onClick={() => window.history.back()}
            onMouseOver={(e) => {
              e.target.style.transform = 'translateY(-1px)';
              e.target.style.boxShadow = '0 4px 15px rgba(102, 126, 234, 0.3)';
            }}
            onMouseOut={(e) => {
              e.target.style.transform = 'translateY(0)';
              e.target.style.boxShadow = 'none';
            }}
          >
            Go Back
          </button>
        </div>
      </div>
    );
  }

  // Check email verification requirement
  if (requireEmailVerification && !authState.user.emailVerified) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '50vh',
        padding: '2rem'
      }}>
        <div style={{
          textAlign: 'center',
          maxWidth: '500px',
          background: 'white',
          borderRadius: '16px',
          padding: '2rem',
          boxShadow: '0 4px 20px rgba(0, 0, 0, 0.08)',
          border: '1px solid #e2e8f0'
        }}>
          <h2 style={{
            marginBottom: '1rem',
            color: '#1e293b',
            fontSize: '1.75rem',
            fontWeight: '700'
          }}>
            📧 Email Verification Required
          </h2>
          <p style={{
            color: '#64748b',
            lineHeight: '1.6',
            marginBottom: '1rem'
          }}>
            Please verify your email address to access this page.
          </p>
          <p style={{
            color: '#64748b',
            lineHeight: '1.6',
            marginBottom: '1.5rem'
          }}>
            Check your inbox for a verification email sent to:<br />
            <strong style={{ color: '#1e293b' }}>{authState.user.email}</strong>
          </p>
          <div style={{
            display: 'flex',
            gap: '1rem',
            justifyContent: 'center',
            flexWrap: 'wrap',
            marginTop: '1.5rem'
          }}>
            <button 
              style={{
                background: 'linear-gradient(135deg, #667eea, #764ba2)',
                color: 'white',
                border: 'none',
                padding: '0.75rem 1.5rem',
                borderRadius: '8px',
                fontSize: '1rem',
                fontWeight: '600',
                cursor: 'pointer',
                transition: 'all 0.2s ease'
              }}
              onClick={async () => {
                try {
                  const response = await fetch(`${API_BASE_URL}/api/auth/resend-verification`, {
                    method: 'POST',
                    headers: {
                      'Content-Type': 'application/json',
                      'Authorization': `Bearer ${authState.token}`
                    }
                  });
                  
                  if (response.ok) {
                    alert('Verification email sent!');
                  } else {
                    alert('Error sending verification email. Please try again.');
                  }
                } catch (error) {
                  alert('Network error. Please try again.');
                }
              }}
              onMouseOver={(e) => {
                e.target.style.transform = 'translateY(-1px)';
                e.target.style.boxShadow = '0 4px 15px rgba(102, 126, 234, 0.3)';
              }}
              onMouseOut={(e) => {
                e.target.style.transform = 'translateY(0)';
                e.target.style.boxShadow = 'none';
              }}
            >
              Resend Verification Email
            </button>
            <button 
              style={{
                background: 'white',
                color: '#64748b',
                border: '1px solid #e2e8f0',
                padding: '0.75rem 1.5rem',
                borderRadius: '8px',
                fontSize: '1rem',
                fontWeight: '600',
                cursor: 'pointer',
                transition: 'all 0.2s ease'
              }}
              onClick={() => {
                localStorage.removeItem('authToken');
                localStorage.removeItem('userData');
                window.location.href = '/';
              }}
              onMouseOver={(e) => {
                e.target.style.background = '#f8fafc';
                e.target.style.color = '#374151';
                e.target.style.transform = 'translateY(-1px)';
              }}
              onMouseOut={(e) => {
                e.target.style.background = 'white';
                e.target.style.color = '#64748b';
                e.target.style.transform = 'translateY(0)';
              }}
            >
              Logout
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Check profile completion requirement
  if (requireCompleteProfile && !authState.user.profileComplete) {
    const missingFields = [];
    if (!authState.user.fullName) missingFields.push('Full Name');
    if (!authState.user.phone) missingFields.push('Phone Number');
    if (!authState.user.address?.city) missingFields.push('City');
    if (!authState.user.address?.state) missingFields.push('State');
    if (authState.user.userType === 'pharmacy' && !authState.user.pharmacyDetails?.pharmacyName) {
      missingFields.push('Pharmacy Name');
    }
    if (authState.user.userType === 'pharmacy' && !authState.user.pharmacyDetails?.licenseNumber) {
      missingFields.push('License Number');
    }

    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '50vh',
        padding: '2rem'
      }}>
        <div style={{
          textAlign: 'center',
          maxWidth: '500px',
          background: 'white',
          borderRadius: '16px',
          padding: '2rem',
          boxShadow: '0 4px 20px rgba(0, 0, 0, 0.08)',
          border: '1px solid #e2e8f0'
        }}>
          <h2 style={{
            marginBottom: '1rem',
            color: '#1e293b',
            fontSize: '1.75rem',
            fontWeight: '700'
          }}>
            📝 Complete Your Profile
          </h2>
          <p style={{
            color: '#64748b',
            lineHeight: '1.6',
            marginBottom: '1rem'
          }}>
            Please complete your profile to access this page.
          </p>
          <div style={{
            margin: '1.5rem 0',
            textAlign: 'left'
          }}>
            <p style={{
              color: '#64748b',
              marginBottom: '0.5rem'
            }}>
              Missing information:
            </p>
            <ul style={{
              paddingLeft: '1.5rem',
              margin: '0'
            }}>
              {missingFields.map((field, index) => (
                <li key={index} style={{
                  color: '#64748b',
                  marginBottom: '0.5rem'
                }}>
                  {field}
                </li>
              ))}
            </ul>
          </div>
          <button 
            style={{
              background: 'linear-gradient(135deg, #667eea, #764ba2)',
              color: 'white',
              border: 'none',
              padding: '0.75rem 1.5rem',
              borderRadius: '8px',
              fontSize: '1rem',
              fontWeight: '600',
              cursor: 'pointer',
              transition: 'all 0.2s ease'
            }}
            onClick={() => window.location.href = '/profile/complete'}
            onMouseOver={(e) => {
              e.target.style.transform = 'translateY(-1px)';
              e.target.style.boxShadow = '0 4px 15px rgba(102, 126, 234, 0.3)';
            }}
            onMouseOut={(e) => {
              e.target.style.transform = 'translateY(0)';
              e.target.style.boxShadow = 'none';
            }}
          >
            Complete Profile
          </button>
        </div>
      </div>
    );
  }

  // All checks passed - render protected content
  return children;
};

// Higher-order components for specific role requirements
export const CustomerOnlyRoute = ({ children, ...props }) => (
  <ProtectedRoute requiredRole="patient" {...props}>
    {children}
  </ProtectedRoute>
);

export const PharmacyOnlyRoute = ({ children, ...props }) => (
  <ProtectedRoute requiredRole="pharmacy" {...props}>
    {children}
  </ProtectedRoute>
);

export const AdminOnlyRoute = ({ children, ...props }) => (
  <ProtectedRoute requiredRole="admin" {...props}>
    {children}
  </ProtectedRoute>
);

// Route that requires email verification
export const VerifiedRoute = ({ children, ...props }) => (
  <ProtectedRoute requireEmailVerification={true} {...props}>
    {children}
  </ProtectedRoute>
);

// Route that requires complete profile
export const CompleteProfileRoute = ({ children, ...props }) => (
  <ProtectedRoute requireCompleteProfile={true} {...props}>
    {children}
  </ProtectedRoute>
);

export default ProtectedRoute;

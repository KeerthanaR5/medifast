import React, { useState, useEffect } from 'react';
import {  Mail, Lock, User, Phone, CheckCircle, AlertCircle, Eye, EyeOff } from 'lucide-react';
import './AuthModalGlass.css';

const API_BASE_URL = (
  process.env.REACT_APP_API_URL || 'http://localhost:5000'
).replace(/\/$/, '').replace(/\/api$/, '');

const AuthModal = ({
  isOpen,
  onClose,
  initialType = 'login',
  onSuccess,
  onSwitchType
}) => {
  const [authType, setAuthType] = useState(initialType);
  const [formData, setFormData] = useState({
    fullName: '',
    email: '',
    password: '',
    phone: '',
    userType: 'patient'
  });
  const [, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [forgotPasswordEmail, setForgotPasswordEmail] = useState('');
  const [forgotPasswordLoading, setForgotPasswordLoading] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setFormData({
        fullName: '',
        email: '',
        password: '',
        phone: '',
        userType: 'patient'
      });
      setError('');
      setSuccess('');
      setShowForgotPassword(false);
      setForgotPasswordEmail('');
      setAuthType(initialType);
    }
  }, [isOpen, initialType]);

  const handleInputChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
    setError('');
    setSuccess('');
  };

  const handleSwitchType = (newType) => {
    setAuthType(newType);
    setError('');
    setSuccess('');
    setShowForgotPassword(false);
    if (onSwitchType) {
      onSwitchType(newType);
    }
  };

  const validateForm = () => {
    if (!formData.email || !formData.password) {
      setError('Email and password are required');
      return false;
    }
    if (authType === 'register') {
      if (!formData.fullName) {
        setError('Full name is required');
        return false;
      }
      if (!formData.phone) {
        setError('Phone number is required');
        return false;
      }
      if (formData.password.length < 6) {
        setError('Password must be at least 6 characters');
        return false;
      }
      if (!/^[0-9]{10}$/.test(formData.phone)) {
        setError('Please enter a valid 10-digit phone number');
        return false;
      }
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(formData.email)) {
      setError('Please enter a valid email address');
      return false;
    }
    return true;
  };

  const handleForgotPassword = async (e) => {
    e.preventDefault();
    if (!forgotPasswordEmail) {
      setError('Please enter your email address');
      return;
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(forgotPasswordEmail)) {
      setError('Please enter a valid email address');
      return;
    }
    setForgotPasswordLoading(true);
    setError('');
    setSuccess('');
    try {
      const response = await fetch(`${API_BASE_URL}/api/auth/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: forgotPasswordEmail }),
      });
      const data = await response.json();
      if (response.ok && data.success) {
        setSuccess('Password reset link has been sent to your email address. Please check your inbox.');
        setForgotPasswordEmail('');
        setTimeout(() => {
          setShowForgotPassword(false);
          setSuccess('');
        }, 3000);
      } else {
        setError(data.message || 'Failed to send password reset email. Please try again.');
      }
    } catch (err) {
      setError('Network error. Please check your connection and try again.');
    } finally {
      setForgotPasswordLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validateForm()) return;
    setLoading(true);
    setError('');
    setSuccess('');
    try {
      const endpoint = authType === 'login' ? '/api/auth/login' : '/api/auth/quick-register';
      const response = await fetch(`${API_BASE_URL}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });
      const data = await response.json();
      if (response.ok && data.success) {
        const token = data.token || data.data?.accessToken;
        const user = data.user || data.data?.user;
        if (token && user) {
          sessionStorage.setItem('token', token);
          sessionStorage.setItem('authToken', token);
          sessionStorage.setItem('user', JSON.stringify(user));
          sessionStorage.setItem('userData', JSON.stringify(user));
          localStorage.removeItem('token');
          localStorage.removeItem('authToken');
          localStorage.removeItem('user');
          localStorage.removeItem('userData');
          setSuccess(authType === 'login' ? 'Welcome back! Redirecting to dashboard...' : 'Account created successfully! Redirecting to dashboard...');
          if (onSuccess) {
            onSuccess(user, token);
          }
          setTimeout(() => {
            onClose();
          }, 1500);
        } else {
          setError('Authentication successful but missing data. Please try again.');
        }
      } else {
        setError(data.message || `${authType} failed. Please check your credentials.`);
      }
    } catch (err) {
      setError('Network error. Please check your connection and try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleOverlayClick = (e) => {
    if (e.target === e.currentTarget) onClose();
  };

  useEffect(() => {
    const handleEscape = (e) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      document.body.style.overflow = 'hidden';
    }
    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = 'unset';
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  if (showForgotPassword) {
    return (
      <div className="auth-modal-overlay" onClick={handleOverlayClick}>
        <div className="auth-modal-container forgot-password-modal">
          <div className="auth-modal-header">
            <h2>Reset Password</h2>
            <button className="auth-modal-close" onClick={onClose} aria-label="Close modal">×</button>
          </div>
          <div className="auth-modal-body">
            <div className="forgot-password-intro">
              <Mail size={48} />
              <p>Enter your email address and we'll send you a link to reset your password.</p>
            </div>
            <form onSubmit={handleForgotPassword} className="auth-form forgot-password-form">
              <label htmlFor="forgotEmail">
                Email Address
                <input
                  type="email"
                  id="forgotEmail"
                  value={forgotPasswordEmail}
                  onChange={(e) => setForgotPasswordEmail(e.target.value)}
                  placeholder="Enter your email address"
                  required
                  autoComplete="email"
                />
              </label>
              {error && <div className="error-message"><AlertCircle size={20} />{error}</div>}
              {success && <div className="success-message"><CheckCircle size={20} />{success}</div>}
              <button type="submit" className="auth-submit-btn" disabled={forgotPasswordLoading}>
                {forgotPasswordLoading ? 'Sending Email...' : 'Send Reset Link'}
              </button>
            </form>
          </div>
          <div className="auth-modal-footer">
            <p>Remember your password? <button type="button" className="auth-switch-btn" onClick={() => setShowForgotPassword(false)}>Back to Sign In</button></p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-modal-overlay" onClick={handleOverlayClick}>
      <div className={`auth-modal-container ${authType === 'register' ? 'register-modal' : ''}`}>
        <div className="auth-glass-left">
          <div className="auth-modal-header">
            <h2>{authType === 'login' ? 'Welcome Back' : 'Welcome to MediFast'}</h2>
            <button className="auth-modal-close" onClick={onClose} aria-label="Close modal">×</button>
          </div>
          <div className="auth-modal-body">
            <form onSubmit={handleSubmit} className="auth-form">
              {authType === 'register' && (
                <>
                  <div className="form-group">
                    <label htmlFor="fullName">Full Name</label>
                    <div className="input-with-icon">
                      <User className="input-icon" size={20} />
                      <input
                        type="text"
                        id="fullName"
                        name="fullName"
                        value={formData.fullName}
                        onChange={handleInputChange}
                        placeholder="Enter your full name"
                        required
                        autoComplete="name"
                      />
                    </div>
                  </div>
                  <div className="form-group">
                    <label htmlFor="phone">Phone Number</label>
                    <div className="input-with-icon">
                      <Phone className="input-icon" size={20} />
                      <input
                        type="tel"
                        id="phone"
                        name="phone"
                        value={formData.phone}
                        onChange={handleInputChange}
                        placeholder="Enter your 10-digit phone number"
                        required
                        autoComplete="tel"
                      />
                    </div>
                  </div>
                  <div className="form-group">
                    <label htmlFor="userType">Account Type</label>
                    <select
                      id="userType"
                      name="userType"
                      value={formData.userType}
                      onChange={handleInputChange}
                      required
                    >
                      <option value="patient">Patient</option>
                      <option value="pharmacy">Pharmacy Owner</option>
                    </select>
                  </div>
                </>
              )}
              <div className="form-group">
                <label htmlFor="email">Email Address</label>
                <div className="input-with-icon">
                  <Mail className="input-icon" size={20} />
                  <input
                    type="email"
                    id="email"
                    name="email"
                    value={formData.email}
                    onChange={handleInputChange}
                    placeholder="Enter your email"
                    required
                    autoComplete="email"
                  />
                </div>
              </div>
              <div className="input-with-icon">
  <Lock className="input-icon" size={20} />
  <input
    type={showPassword ? 'text' : 'password'}
    id="password"
    name="password"
    value={formData.password}
    onChange={handleInputChange}
    placeholder="Enter your password"
    required
  />
  <button
    type="button"
    className="password-toggle"
    onClick={() => setShowPassword(!showPassword)}
    aria-label={showPassword ? "Hide password" : "Show password"}
  >
    {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
  </button>
</div>


              {error && (
                <div className="error-message" role="alert">
                  <AlertCircle size={20} />
                  {error}
                </div>
              )}
              {success && (
                <div className="success-message" role="alert">
                  <CheckCircle size={20} />
                  {success}
                </div>
              )}
              <button type="submit" className="auth-submit-btn">
  {authType === 'login' ? 'Sign In' : 'Create Account'}
</button>

            </form>
            {authType === 'login' && (
  <div className="auth-links">
    <span 
      role="button" 
      tabIndex={0} 
      className="forgot-password-text" 
      onClick={() => setShowForgotPassword(true)} 
      onKeyDown={(e) => e.key === 'Enter' && setShowForgotPassword(true)}
    >
      Forgot your password?
    </span>
  </div>
)}

          </div>
          <div className="auth-modal-footer">
            <p>
              {authType === 'login' ? "Don't have an account?" : "Already have an account?"}
              <button type="button" className="auth-switch-btn" onClick={() => handleSwitchType(authType === 'login' ? 'register' : 'login')}>
                {authType === 'login' ? 'Sign Up' : 'Sign In'}
              </button>
            </p>
          </div>
        </div>
        <div className="auth-glass-right"
          style={{
            background: `linear-gradient(110deg,rgba(230,244,255,0.63) 17%,rgba(130,158,255,0.05) 110%), url(${process.env.PUBLIC_URL}/images/medical-illustration.png) center center/cover no-repeat`,
            borderRadius: '0 36px 36px 0',
            boxShadow: '0 1px 28px 0 #d5f1fe23',
            position: 'relative',
            opacity: 0.7,
          }}
        >
          <div className="auth-image-bg"></div>
        </div>
      </div>
    </div>
  );
};

export default AuthModal;

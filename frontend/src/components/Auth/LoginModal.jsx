import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Eye, EyeOff, Mail, Lock, ArrowLeft } from 'lucide-react';
import { authAPI } from '../../services/api';
import ForgotPasswordModal from './ForgotPasswordModal';
import './AuthModalGlass.css';

const LoginModal = ({ isOpen, onClose, onSwitchToRegister, onLogin }) => {
  const [formData, setFormData] = useState({
    email: '',
    password: ''
  });
  const [showPassword, setShowPassword] = useState(false);
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState({});

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
    if (errors[name]) {
      setErrors(prev => ({
        ...prev,
        [name]: ''
      }));
    }
  };

  const validateForm = () => {
    const newErrors = {};

    if (!formData.email) {
      newErrors.email = 'Email is required';
    } else if (!/\S+@\S+\.\S+/.test(formData.email)) {
      newErrors.email = 'Email is invalid';
    }

    if (!formData.password) {
      newErrors.password = 'Password is required';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!validateForm()) return;

    setLoading(true);
    setErrors({});

    try {
      const { user, token } = await authAPI.login(formData);
      console.log('[LoginModal] success user:', user);
      console.log('[LoginModal] role fields:', { role: user?.role, userType: user?.userType });
      localStorage.setItem('token', token);
      localStorage.setItem('authToken', token);
      localStorage.setItem('user', JSON.stringify(user));
      localStorage.setItem('userData', JSON.stringify(user));
      onLogin(user, token);
      onClose();
    } catch (error) {
      setErrors({
        general: error.response?.data?.message || 'Login failed. Please try again.'
      });
    } finally {
      setLoading(false);
    }
  };

  if (showForgotPassword) {
    return (
      <ForgotPasswordModal
        isOpen={isOpen}
        onClose={onClose}
        onBack={() => setShowForgotPassword(false)}
      />
    );
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="modal-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <motion.div
            className="modal-content login-modal"
            initial={{ opacity: 0, scale: 0.8, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.8, y: 20 }}
            transition={{ type: "spring", duration: 0.5 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header">
              <h2>Welcome Back to MediFast</h2>
              <button className="close-btn" onClick={onClose}>
                <X />
              </button>
            </div>

            <div className="modal-body">
              <form onSubmit={handleSubmit}>
                <div className="form-group">
                  <label htmlFor="email">Email Address</label>
                  <div className="input-wrapper">
                    <Mail className="input-icon" />
                    <input
                      type="email"
                      id="email"
                      name="email"
                      placeholder="Enter your email"
                      value={formData.email}
                      onChange={handleInputChange}
                      className={errors.email ? 'error' : ''}
                      autoComplete="email"
                    />
                  </div>
                  {errors.email && (
                    <motion.span
                      className="error-message"
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                    >
                      {errors.email}
                    </motion.span>
                  )}
                </div>

                <div className="form-group">
                  <label htmlFor="password">Password</label>
                  <div className="input-wrapper">
                    <Lock className="input-icon" />
                    <input
                      type={showPassword ? "text" : "password"}
                      id="password"
                      name="password"
                      placeholder="Enter your password"
                      value={formData.password}
                      onChange={handleInputChange}
                      className={errors.password ? 'error' : ''}
                      autoComplete="current-password"
                    />
                    <button
                      type="button"
                      className="password-toggle"
                      onClick={() => setShowPassword(!showPassword)}
                    >
                      {showPassword ? <EyeOff /> : <Eye />}
                    </button>
                  </div>
                  {errors.password && (
                    <motion.span
                      className="error-message"
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                    >
                      {errors.password}
                    </motion.span>
                  )}
                </div>

                <div className="form-options">
                  <button
                    type="button"
                    className="forgot-password-link"
                    onClick={() => setShowForgotPassword(true)}
                  >
                    Forgot Password?
                  </button>
                </div>

                {errors.general && (
                  <motion.div
                    className="error-message general-error"
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                  >
                    {errors.general}
                  </motion.div>
                )}

                <motion.button
                  type="submit"
                  className="submit-btn"
                  disabled={loading}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                >
                  {loading ? (
                    <div className="loading-spinner"></div>
                  ) : (
                    'Sign In'
                  )}
                </motion.button>
              </form>

              <div className="switch-auth">
                <p>
                  Don't have an account?{' '}
                  <button
                    type="button"
                    className="switch-link"
                    onClick={onSwitchToRegister}
                  >
                    Create Account
                  </button>
                </p>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default LoginModal;

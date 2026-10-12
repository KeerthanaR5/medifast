import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Eye, EyeOff, Mail, Lock, User, Phone } from 'lucide-react';
import { authAPI } from '../../services/api';

const RegisterModal = ({ isOpen, onClose, onSwitchToLogin, onRegister }) => {
  const [formData, setFormData] = useState({
    fullName: '',
    email: '',
    password: '',
    phone: '',
    role: 'customer'
  });
  const [showPassword, setShowPassword] = useState(false);
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
    
    if (!formData.fullName) {
      newErrors.fullName = 'Full name is required';
    }
    
    if (!formData.email) {
      newErrors.email = 'Email is required';
    } else if (!/\S+@\S+\.\S+/.test(formData.email)) {
      newErrors.email = 'Email is invalid';
    }
    
    if (!formData.password) {
      newErrors.password = 'Password is required';
    } else if (formData.password.length < 6) {
      newErrors.password = 'Password must be at least 6 characters';
    }
    
    if (!formData.phone) {
      newErrors.phone = 'Phone number is required';
    } else if (!/^[0-9]{10}$/.test(formData.phone)) {
      newErrors.phone = 'Please enter a valid 10-digit phone number';
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
      const { user, token } = await authAPI.register(formData);
      
      localStorage.setItem('token', token);
      localStorage.setItem('user', JSON.stringify(user));
      
      onRegister(user, token);
      onClose();
    } catch (error) {
      setErrors({ 
        general: error.response?.data?.message || 'Registration failed. Please try again.' 
      });
    } finally {
      setLoading(false);
    }
  };

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
            className="modal-content register-modal"
            initial={{ opacity: 0, scale: 0.8, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.8, y: 20 }}
            transition={{ type: "spring", duration: 0.5 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header">
              <h2>Join MediFast Today</h2>
              <button className="close-btn" onClick={onClose}>
                <X />
              </button>
            </div>

            <div className="modal-body">
              <form onSubmit={handleSubmit}>
                <div className="form-group">
                  <label htmlFor="fullName">Full Name</label>
                  <div className="input-wrapper">
                    <User className="input-icon" />
                    <input
                      type="text"
                      id="fullName"
                      name="fullName"
                      placeholder="Enter your full name"
                      value={formData.fullName}
                      onChange={handleInputChange}
                      className={errors.fullName ? 'error' : ''}
                      autoComplete="name"
                    />
                  </div>
                  {errors.fullName && (
                    <motion.span
                      className="error-message"
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                    >
                      {errors.fullName}
                    </motion.span>
                  )}
                </div>

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
                      placeholder="Enter your password (min 6 characters)"
                      value={formData.password}
                      onChange={handleInputChange}
                      className={errors.password ? 'error' : ''}
                      autoComplete="new-password"
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

                <div className="form-group">
                  <label htmlFor="phone">Phone Number</label>
                  <div className="input-wrapper">
                    <Phone className="input-icon" />
                    <input
                      type="tel"
                      id="phone"
                      name="phone"
                      placeholder="Enter 10-digit phone number"
                      value={formData.phone}
                      onChange={handleInputChange}
                      className={errors.phone ? 'error' : ''}
                      autoComplete="tel"
                    />
                  </div>
                  {errors.phone && (
                    <motion.span
                      className="error-message"
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                    >
                      {errors.phone}
                    </motion.span>
                  )}
                </div>

                <div className="form-group">
                  <label htmlFor="role">Account Type</label>
                  <div className="input-wrapper">
                    <select 
                      id="role"
                      name="role" 
                      value={formData.role} 
                      onChange={handleInputChange}
                      className="role-select"
                    >
                      <option value="customer">Customer</option>
                      <option value="pharmacy">Pharmacy Owner</option>
                    </select>
                  </div>
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
                    'Create Account'
                  )}
                </motion.button>
              </form>

              <div className="switch-auth">
                <p>
                  Already have an account?{' '}
                  <button
                    type="button"
                    className="switch-link"
                    onClick={onSwitchToLogin}
                  >
                    Sign In
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

export default RegisterModal;

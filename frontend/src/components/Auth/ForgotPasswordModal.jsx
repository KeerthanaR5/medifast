import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { ArrowLeft, Mail, CheckCircle } from 'lucide-react';
import { authAPI } from '../../services/api';

const ForgotPasswordModal = ({ isOpen, onClose, onBack }) => {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!email || !/\S+@\S+\.\S+/.test(email)) {
      setError('Please enter a valid email address');
      return;
    }
    
    setLoading(true);
    setError('');
    
    try {
      const response = await authAPI.forgotPassword({ email });
      setSent(true);
    } catch (error) {
      setError(error.response?.data?.message || 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (sent) {
    return (
      <motion.div
        className="modal-overlay"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        onClick={onClose}
      >
        <motion.div
          className="modal-content forgot-password-modal success"
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="success-content">
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: 0.2, type: "spring" }}
            >
              <CheckCircle className="success-icon" />
            </motion.div>
            <h2>Check Your Email</h2>
            <p>
              We've sent a password reset link to <strong>{email}</strong>
            </p>
            <p className="instruction">
              Click the link in your email to reset your password. 
              If you don't see it, check your spam folder.
            </p>
            <div className="success-actions">
              <button className="btn-primary" onClick={onClose}>
                Got it
              </button>
              <button className="btn-link" onClick={onBack}>
                Back to Login
              </button>
            </div>
          </div>
        </motion.div>
      </motion.div>
    );
  }

  return (
    <motion.div
      className="modal-overlay"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      onClick={onClose}
    >
      <motion.div
        className="modal-content forgot-password-modal"
        initial={{ opacity: 0, scale: 0.8, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ type: "spring", duration: 0.5 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <button 
            className="back-btn" 
            onClick={onBack}
            style={{ 
              cursor: 'pointer',
              userSelect: 'none',
              background: 'none',
              border: 'none',
              padding: '8px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: '50%',
              transition: 'background-color 0.2s ease',
              marginRight: '12px'
            }}
            onMouseOver={(e) => {
              e.currentTarget.style.backgroundColor = 'rgba(0, 0, 0, 0.05)';
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.backgroundColor = 'transparent';
            }}
            aria-label="Go back"
          >
            <ArrowLeft 
              size={20} 
              color="#4f46e5" 
              style={{ 
                flexShrink: 0,
                pointerEvents: 'none' 
              }} 
            />
          </button>
          <h2>Reset Password</h2>
        </div>

        <div className="modal-body">
          <p className="instruction">
            Enter your email address and we'll send you a link to reset your password.
          </p>
          
          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label htmlFor="reset-email">Email Address</label>
              <div className="input-wrapper">
                <Mail className="input-icon" />
                <input
                  type="email"
                  id="reset-email"
                  placeholder="Enter your email"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    setError('');
                  }}
                  className={error ? 'error' : ''}
                  autoComplete="email"
                />
              </div>
              {error && (
                <motion.span
                  className="error-message"
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                >
                  {error}
                </motion.span>
              )}
            </div>

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
                'Send Reset Link'
              )}
            </motion.button>
          </form>
        </div>
      </motion.div>
    </motion.div>
  );
};

export default ForgotPasswordModal;

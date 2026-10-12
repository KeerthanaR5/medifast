import React, { useState } from 'react';
import { authAPI } from '../../services/api';
import ForgotPasswordModal from './ForgotPasswordModal';

const Login = ({ onLogin, switchToRegister }) => {
  const [formData, setFormData] = useState({ email: '', password: '' });
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showForgotPassword, setShowForgotPassword] = useState(false);

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const { user, token } = await authAPI.login(formData);
      localStorage.setItem('token', token);
      localStorage.setItem('user', JSON.stringify(user));
      onLogin(user, token);
    } catch (err) {
      setError(err.response?.data?.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  const styles = {
    container: {
      minHeight: '100vh',
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      background: 'linear-gradient(135deg, #667eea, #764ba2)',
      padding: '20px',
    },
    card: {
      background: '#fff',
      padding: '40px',
      borderRadius: '14px',
      width: '100%',
      maxWidth: '400px',
      boxShadow: '0 20px 40px rgba(0,0,0,0.1)',
    },
    title: {
      textAlign: 'center',
      marginBottom: '25px',
      color: '#333',
    },
    input: {
      width: '100%',
      padding: '14px',
      borderRadius: '8px',
      border: '1px solid #ccc',
      marginBottom: '16px',
    },
    passwordWrapper: {
      position: 'relative',
    },
    toggleBtn: {
      position: 'absolute',
      right: '10px',
      top: '50%',
      transform: 'translateY(-50%)',
      background: 'none',
      border: 'none',
      cursor: 'pointer',
    },
    loginBtn: {
      width: '100%',
      padding: '14px',
      background: '#667eea',
      color: '#fff',
      border: 'none',
      borderRadius: '8px',
      cursor: 'pointer',
      fontWeight: 'bold',
    },
    forgotContainer: {
      textAlign: 'center',
      fontSize: '14px',
      marginBottom: '10px',
      color: '#4b5563',
    },
    forgotBtn: {
      background: 'none',
      border: 'none',
      padding: 0,
      margin: 0,
      color: '#4f46e5',
      cursor: 'pointer',
      fontWeight: 500,
    },
    error: {
      background: '#fee2e2',
      color: '#b91c1c',
      padding: '10px',
      borderRadius: '6px',
      textAlign: 'center',
      marginBottom: '10px',
    },
    switch: {
      textAlign: 'center',
      marginTop: '16px',
      color: '#555',
    },
    linkBtn: {
      background: 'none',
      border: 'none',
      color: '#667eea',
      cursor: 'pointer',
      marginLeft: '5px',
    },
  };

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <h2 style={styles.title}>MediFast Login</h2>

        {showForgotPassword && (
          <ForgotPasswordModal
            onClose={() => setShowForgotPassword(false)}
          />
        )}

        <form onSubmit={handleSubmit}>
          <input
            type="email"
            name="email"
            placeholder="Email"
            style={styles.input}
            value={formData.email}
            onChange={handleChange}
            required
          />

          <div style={styles.passwordWrapper}>
            <input
              type={showPassword ? 'text' : 'password'}
              name="password"
              placeholder="Password"
              style={styles.input}
              value={formData.password}
              onChange={handleChange}
              required
            />
            <button
              type="button"
              style={styles.toggleBtn}
              onClick={() => setShowPassword(!showPassword)}
            >
              {showPassword ? '🙈' : '👁️'}
            </button>
          </div>

          <div style={styles.forgotContainer}>
            Forgot your password?{' '}
            <button
              type="button"
              style={styles.forgotBtn}
              onClick={() => setShowForgotPassword(true)}
            >
              Reset it
            </button>
          </div>

          {error && <div style={styles.error}>{error}</div>}

          <button type="submit" style={styles.loginBtn} disabled={loading}>
            {loading ? 'Logging in…' : 'Login'}
          </button>
        </form>

        <div style={styles.switch}>
          Don’t have an account?
          <button style={styles.linkBtn} onClick={switchToRegister}>
            Register here
          </button>
        </div>
      </div>
    </div>
  );
};

export default Login;


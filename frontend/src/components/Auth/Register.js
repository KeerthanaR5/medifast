import React, { useState } from 'react';
import { authAPI } from '../../services/api';

const Register = ({ onRegister, switchToLogin }) => {
  const [formData, setFormData] = useState({
    fullName: '',
    email: '',
    password: '',
    phone: '',
    role: 'customer'
  });
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const response = await authAPI.register(formData);
      const { user, token } = response.data.data;
      
      localStorage.setItem('token', token);
      localStorage.setItem('user', JSON.stringify(user));
      
      onRegister(user);
      alert('Registration successful!');
    } catch (error) {
      setError(error.response?.data?.message || 'Registration failed');
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
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      padding: '20px'
    },
    card: {
      background: 'white',
      padding: '40px',
      borderRadius: '15px',
      boxShadow: '0 20px 40px rgba(0,0,0,0.1)',
      width: '100%',
      maxWidth: '400px'
    },
    title: {
      textAlign: 'center',
      color: '#333',
      marginBottom: '30px',
      fontSize: '24px'
    },
    formGroup: {
      marginBottom: '20px'
    },
    input: {
      width: '100%',
      padding: '15px',
      border: '2px solid #e1e5e9',
      borderRadius: '8px',
      fontSize: '16px',
      boxSizing: 'border-box'
    },
    inputWrapper: {
      position: 'relative',
      width: '100%'
    },
    passwordInput: {
      width: '100%',
      padding: '15px 50px 15px 15px',
      border: '2px solid #e1e5e9',
      borderRadius: '8px',
      fontSize: '16px',
      boxSizing: 'border-box'
    },
    passwordToggle: {
      position: 'absolute',
      right: '10px',
      top: '50%',
      transform: 'translateY(-50%)',
      background: 'none',
      border: 'none',
      cursor: 'pointer',
      color: '#666',
      fontSize: '18px'
    },
    button: {
      width: '100%',
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      color: 'white',
      padding: '15px',
      border: 'none',
      borderRadius: '8px',
      fontSize: '16px',
      fontWeight: 'bold',
      cursor: 'pointer'
    },
    error: {
      background: '#ffebee',
      color: '#c62828',
      padding: '10px',
      borderRadius: '5px',
      marginBottom: '15px',
      textAlign: 'center'
    },
    switch: {
      textAlign: 'center',
      marginTop: '20px',
      color: '#666'
    },
    link: {
      color: '#667eea',
      cursor: 'pointer',
      textDecoration: 'underline',
      marginLeft: '5px'
    }
  };

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <h2 style={styles.title}>🏥 MediFast Register</h2>
        <form onSubmit={handleSubmit}>
          <div style={styles.formGroup}>
            <input
              style={styles.input}
              type="text"
              name="fullName"
              placeholder="Full Name"
              value={formData.fullName}
              onChange={handleChange}
              required
            />
          </div>

          <div style={styles.formGroup}>
            <input
              style={styles.input}
              type="email"
              name="email"
              placeholder="Email Address"
              value={formData.email}
              onChange={handleChange}
              required
            />
          </div>
          
          <div style={styles.formGroup}>
            <div style={styles.inputWrapper}>
              <input
                style={styles.passwordInput}
                type={showPassword ? "text" : "password"}
                name="password"
                placeholder="Password (min 6 characters)"
                value={formData.password}
                onChange={handleChange}
                required
              />
              <button
                type="button"
                style={styles.passwordToggle}
                onClick={() => setShowPassword(!showPassword)}
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? "🙈" : "👁️"}
              </button>
            </div>
          </div>

          <div style={styles.formGroup}>
            <input
              style={styles.input}
              type="tel"
              name="phone"
              placeholder="Phone Number (10 digits)"
              value={formData.phone}
              onChange={handleChange}
              required
            />
          </div>

          <div style={styles.formGroup}>
            <select style={styles.input} name="role" value={formData.role} onChange={handleChange}>
              <option value="customer">Customer</option>
              <option value="pharmacy">Pharmacy Owner</option>
            </select>
          </div>

          {error && <div style={styles.error}>{error}</div>}

          <button type="submit" disabled={loading} style={styles.button}>
            {loading ? 'Creating Account...' : 'Register'}
          </button>
        </form>

        <p style={styles.switch}>
          Already have an account? 
          <span onClick={switchToLogin} style={styles.link}>Login here</span>
        </p>
      </div>
    </div>
  );
};

export default Register;

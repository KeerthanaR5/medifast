import React, { useEffect, useRef, useState } from 'react';
import { motion, useInView } from 'framer-motion';
import { Typewriter } from 'react-simple-typewriter';

import AuthModal from '../Auth/AuthModal';

import './Homepage.css';

const Homepage = ({ onLogin, onRegister, apiStatus, initialAuthModal, initialAuthType }) => {
  const [mouse, setMouse] = useState({ x: 0, y: 0 });
  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const [authType, setAuthType] = useState('login');

  const heroRef = useRef(null);

  const heroInView = useInView(heroRef, { once: true });

  useEffect(() => {
    const move = e => setMouse({ x: e.clientX, y: e.clientY });
    window.addEventListener('mousemove', move);
    return () => window.removeEventListener('mousemove', move);
  }, []);

  // Removed mock stats to clear placeholder data

  // Respect initial modal open/type coming from App (e.g., when navigating with state)
  useEffect(() => {
    if (typeof initialAuthModal === 'boolean') {
      setIsAuthOpen(initialAuthModal);
    }
    if (initialAuthType) {
      setAuthType(initialAuthType);
    }
  }, [initialAuthModal, initialAuthType]);

  const openLogin = () => {
    setAuthType('login');
    setIsAuthOpen(true);
  };

  const openRegister = () => {
    setAuthType('register');
    setIsAuthOpen(true);
  };

  const closeAuth = () => setIsAuthOpen(false);

  const handleAuthSuccess = (user, token) => {
    // Delegate to App's handlers so role-aware redirect runs there
    if (authType === 'login' && typeof onLogin === 'function') {
      onLogin(user, token);
    } else if (authType === 'register' && typeof onRegister === 'function') {
      onRegister(user, token);
    }
  };

  return (
    <div
      className="homepage"
      style={{
        backgroundImage: "url('/images/generated-image.png')",
        backgroundRepeat: 'no-repeat',
        backgroundPosition: 'center center',
        backgroundSize: 'cover',
        overflowX: 'hidden',
        overflowY: 'auto',
        color: '#1f3a47',
        minHeight: '100vh',
        fontFamily: "'Inter', 'Poppins', -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif"
      }}
    >
      <div className="floating-svg">
        <motion.svg
          className="liquid-path"
          viewBox="0 0 1200 800"
          style={{ transform: `translate(${mouse.x * 0.01}px, ${mouse.y * 0.01}px)` }}
        >
          <defs>
            <radialGradient id="g1" cx="50%" cy="50%" r="80%" fx="50%" fy="50%">
              <stop offset="0%" stopColor="#DADEE1" />
              <stop offset="100%" stopColor="#629BB6" />
            </radialGradient>
          </defs>
          <motion.path
            d="M0,400 C300,200 900,600 1200,400 L1200,800 L0,800 Z"
            fill="url(#g1)"
            animate={{
              d: [
                "M0,400 C300,200 900,600 1200,400 L1200,800 L0,800 Z",
                "M0,410 C340,180 860,620 1200,410 L1200,800 L0,800 Z",
                "M0,400 C300,200 900,600 1200,400 L1200,800 L0,800 Z"
              ]
            }}
            transition={{ duration: 7, repeat: Infinity, ease: "easeInOut" }}
          />
        </motion.svg>
        <motion.div
          className="svg-shape svg1"
          animate={{ x: [0, 60, 0], y: [0, 60, 0], rotate: [0, 30, 0] }}
          transition={{ duration: 9, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.div
          className="svg-shape svg2"
          animate={{ x: [0, -80, 0], y: [0, -40, 0], rotate: [0, -25, 0] }}
          transition={{ duration: 11, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.div
          className="svg-shape svg3"
          animate={{ x: [0, 20, -20, 0], y: [0, 40, -30, 0], rotate: [0, 20, -20, 0] }}
          transition={{ duration: 13, repeat: Infinity, ease: "easeInOut" }}
        />
      </div>

      {/* Login and Signup buttons */}
      <section className="login-signup-section">
        <button className="btn-login" onClick={openLogin}>
          Login
        </button>
        <button className="btn-signup" onClick={openRegister}>
          Sign Up
        </button>
      </section>

      {/* Nearby results list - functionality removed; UI intentionally not rendered */}

      {/* Auth modal component */}
      <AuthModal
        isOpen={isAuthOpen}
        onClose={closeAuth}
        initialType={authType}
        onSuccess={handleAuthSuccess}
      />

      <motion.section
        ref={heroRef}
        className="hero"
        initial={false}
        animate={heroInView ? 'visible' : 'hidden'}
        variants={{ visible: { opacity: 1, y: 0 }, hidden: { opacity: 0, y: 80 } }}
        transition={{ duration: 0.9, ease: 'easeOut' }}
      >
        <motion.div
          className="hero-typewriter Orbitron-font"
          initial={{ opacity: 0, letterSpacing: '0.2em' }}
          animate={heroInView ? { opacity: 1, letterSpacing: '0.11em' } : {}}
          transition={{ duration: 2, ease: 'easeOut' }}
        >
          MediFast
        </motion.div>
        <div className="hero-content">
          <motion.h1
            className="homemade-apple-font"
            initial={{ opacity: 0, y: 20 }}
            animate={heroInView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 1.3, delay: 0.2 }}
          >
            Your Trusted Partner in Healthcare Management
          </motion.h1>
          <div className="sub-typing-row">
            <span className="sub-typing-wrapper league-font">
              <Typewriter
                words={['Find medicines', 'Locate pharmacies', 'Manage your health journey']}
                loop={0}
                cursor
                cursorStyle="|"
                typeSpeed={90}
                deleteSpeed={50}
                delaySpeed={1200}
              />
            </span>
            <motion.button
              className="hero-cta"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={heroInView ? { opacity: 1, scale: 1 } : {}}
              transition={{ duration: 0.6, delay: 1.2 }}
              whileHover={{ scale: 1.07, boxShadow: '0 8px 42px 0 #629BB6a0' }}
              whileTap={{ scale: 0.97 }}
              onClick={() => setIsAuthOpen(true)}
            >
              Get Started <span className="cta-arrow">→</span>
            </motion.button>
          </div>
        </div>
        <motion.div className="scroll-indicator" animate={{ y: [0, 14, 0] }} transition={{ duration: 2, repeat: Infinity }}>
          <div className="scroll-dot" />
          <span>Scroll to explore</span>
        </motion.div>
      </motion.section>

      <section className="quick-actions-section">
        <h2 className="quick-actions-title">Quick Actions</h2>
        <div className="quick-actions-cards">
          <div className="quick-action-card" style={{ alignItems: 'stretch' }}>
            <div className="qa-icon">
              <span className="material-icons">search</span>
            </div>
            <h3>Search Medicines</h3>
            <p>Find available medicines instantly</p>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                className="qa-input"
                type="text"
                placeholder="Search for medicines..."
                onChange={()=>{}}
              />
              <button className="qa-btn qa-grad" onClick={()=>{}}>
                Search
              </button>
            </div>
            {/* Results and errors removed */}
          </div>
          <div className="quick-action-card">
            <div className="qa-icon">
              <span className="material-icons">location_on</span>
            </div>
            <h3>Find Pharmacies</h3>
            <p>Locate nearby trusted pharmacies</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <button className="qa-btn qa-grad" onClick={()=>{}}>
                Use My Location
              </button>
            </div>
          </div>
          <div className="quick-action-card">
            <div className="qa-icon">
              <span className="material-icons">person</span>
            </div>
            <h3>Manage Orders</h3>
            <p>Track orders and prescriptions</p>
            <button className="qa-btn qa-grad">Sign In Required</button>
          </div>
        </div>
      </section>

      {/* Stats section - static content to match visual design */}
      <section className="stats-section stats-glass">
        <div className="stats-cards">
          <div className="stat-card-glass">
            <h3>2+</h3>
            <span>Registered Users</span>
          </div>
          <div className="stat-card-glass">
            <h3>0+</h3>
            <span>Partner Pharmacies</span>
          </div>
          <div className="stat-card-glass">
            <h3>50,000+</h3>
            <span>Medicines Available</span>
          </div>
          <div className="stat-card-glass">
            <h3>24/7</h3>
            <span>Customer Support</span>
          </div>
        </div>
      </section>

      <footer className="footer">
        <p> 2025 MediFast. All rights reserved.</p>
        <nav className="footer-links">
          <a href="#privacy">Privacy Policy</a>
          <a href="#terms">Terms of Service</a>
          <a href="#contact">Contact</a>
        </nav>
      </footer>
    </div>
  );
};

export default Homepage;

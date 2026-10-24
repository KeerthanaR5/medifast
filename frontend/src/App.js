import React, { useState, useEffect, useCallback } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom';
import Homepage from './components/Homepage/Homepage';
import Dashboard from './components/Dashboard/Dashboard';
import StockManager from './components/PharmacyDashboard/StockManager';
import PharmacyDashboard from './components/PharmacyDashboard/PharmacyDashboard';
import MyReservations from './pages/MyReservations';
import PharmacyDetailPage from './pages/PharmacyDetailPage';
import MedicineSearch from './pages/MedicineSearch';
import PharmacyRegister from './pages/PharmacyRegister';
import { LocationProvider } from './contexts/LocationContext';
import { connectionAPI } from './services/api';
import api from './services/api';
import './App.css';
import './index.css';
import AdminPharmacies from './pages/AdminPharmacies';

const AppContent = () => {
  const [user, setUser] = useState(null);
  const [apiStatus, setApiStatus] = useState('checking');
  const [isInitializing, setIsInitializing] = useState(true);
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    const initializeApp = async () => {
      try {
        // Purge legacy persistent localStorage tokens so closing the site forces logout
        localStorage.removeItem('user');
        localStorage.removeItem('userData');
        localStorage.removeItem('token');
        localStorage.removeItem('authToken');

        const savedUser = sessionStorage.getItem('user') || sessionStorage.getItem('userData');
        const savedToken = sessionStorage.getItem('token') || sessionStorage.getItem('authToken');
        if (savedUser && savedToken) {
          setUser(JSON.parse(savedUser));
        }
        await checkBackendHealth();
      } catch (error) {
        console.error('App initialization error:', error);
      } finally {
        setIsInitializing(false);
      }
    };
    initializeApp();
  }, []);

  const checkBackendHealth = async () => {
    try {
      const statusResult = await connectionAPI.getConnectionStatus();
      setApiStatus(statusResult.status === 'connected' ? 'connected' : 'disconnected');
    } catch {
      setApiStatus('disconnected');
    }
  };
  useEffect(() => {
    if (!isInitializing) {
      const interval = setInterval(checkBackendHealth, 30000);
      return () => clearInterval(interval);
    }
  }, [isInitializing]);

  const roleAwareRedirect = async (userData) => {
        // Redirect administrators to the admin pharmacy management page
    const isAdmin =
      userData?.role === 'admin' ||
      userData?.userType === 'admin';

    if (isAdmin) {
      console.log('navigate -> /admin/pharmacies');
      navigate('/admin/pharmacies', { replace: true });
      return;
    }
    try {
      const isPharmacy = userData?.role === 'pharmacy' || userData?.userType === 'pharmacy';
      console.log('roleAwareRedirect:user', { role: userData?.role, userType: userData?.userType, profileComplete: userData?.profileComplete });
      if (isPharmacy) {
        // 1) Prefer authoritative check: does this owner already have a pharmacy?
        try {
          const resp = await api.get('/pharmacies/mine');
          if (resp.data?.success && resp.data?.data?._id) {
            console.log('navigate -> /pharmacy/dashboard (mine exists)');
            navigate('/pharmacy/dashboard', { replace: true });
            return;
          }
        } catch (e) {
          // 404 -> no pharmacy yet
          if (e?.response?.status === 404) {
            console.log('navigate -> /pharmacy/register (no pharmacy yet)');
            navigate('/pharmacy/register', { replace: true });
            return;
          }
        }
        // 2) Fallback: if check failed due to network, prefer dashboard; component guards will redirect if needed
        console.log('navigate -> /pharmacy/register (fallback)');
        navigate('/pharmacy/dashboard', { replace: true });
        return;
      }
    } catch {}
    console.log('navigate -> /dashboard (default)');
    navigate('/dashboard', { replace: true });
  };

  const handleLogin = (userData, token) => {
    setUser(userData);
    if (token) {
      sessionStorage.setItem('authToken', token);
      sessionStorage.setItem('token', token);
    }
    sessionStorage.setItem('userData', JSON.stringify(userData));
    sessionStorage.setItem('user', JSON.stringify(userData));
    localStorage.removeItem('user');
    localStorage.removeItem('userData');
    localStorage.removeItem('token');
    localStorage.removeItem('authToken');
    console.log('handleLogin:user', { role: userData?.role, userType: userData?.userType, profileComplete: userData?.profileComplete });
    roleAwareRedirect(userData);
  };
  const handleRegister = (userData, token) => {
    setUser(userData);
    if (token) {
      sessionStorage.setItem('authToken', token);
      sessionStorage.setItem('token', token);
    }
    sessionStorage.setItem('userData', JSON.stringify(userData));
    sessionStorage.setItem('user', JSON.stringify(userData));
    localStorage.removeItem('user');
    localStorage.removeItem('userData');
    localStorage.removeItem('token');
    localStorage.removeItem('authToken');
    console.log('handleRegister:user', { role: userData?.role, userType: userData?.userType, profileComplete: userData?.profileComplete });
    roleAwareRedirect(userData);
  };

  // ** Main logout handler - ONLY here manages user state! **
  const handleLogout = useCallback(async () => {
    try {
      if (user) {
        await api.auth.logout?.();
      }
    } catch (error) {
      console.error('❌ Logout API error:', error);
    } finally {
      sessionStorage.removeItem('user');
      sessionStorage.removeItem('userData');
      sessionStorage.removeItem('token');
      sessionStorage.removeItem('authToken');
      localStorage.removeItem('user');
      localStorage.removeItem('userData');
      localStorage.removeItem('token');
      localStorage.removeItem('authToken');
      setUser(null); // KEY to switch routes!
      navigate('/', { replace: true });
    }
  }, [user, navigate]);

  if (isInitializing) {
    return (
      <div className="app-loading">
        <div className="loading-container">
          <div className="loading-spinner"></div>
          <h2>🏥 MediFast</h2>
          <p>Initializing application...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="App">
      <Routes>
        <Route
          path="/"
          element={
            user ? (
              (user.role === 'admin' || user.userType === 'admin') ? (
  <Navigate to="/admin/pharmacies" replace />
) : (user.role === 'pharmacy' || user.userType === 'pharmacy') ? (
  <Navigate to="/pharmacy/dashboard" replace />
) : (
  <Navigate to="/dashboard" replace />
)
            ) : (
              <Homepage
                onLogin={handleLogin}
                onRegister={handleRegister}
                apiStatus={apiStatus}
                initialAuthModal={location.state?.showAuthModal}
                initialAuthType={location.state?.authType}
              />
            )
          }
        />
        <Route
          path="/dashboard"
          element={
            user ? (
              (user.role === 'admin' || user.userType === 'admin') ? (
  <Navigate to="/admin/pharmacies" replace />
) : (user.role === 'pharmacy' || user.userType === 'pharmacy') ? (
  <Navigate to="/pharmacy/dashboard" replace />
) : (
  <Dashboard user={user} onLogout={handleLogout} apiStatus={apiStatus} />
)
            ) : (
              <Navigate to="/" replace />
            )
          }
        />
        <Route
          path="/search"
          element={
            user ? (
              <MedicineSearch />
            ) : (
              <Navigate to="/" replace />
            )
          }
        />
        <Route
          path="/pharmacy/stock"
          element={
            user ? (
              (user.role === 'pharmacy' || user.userType === 'pharmacy') ? (
                <StockManager />
              ) : (
                <Navigate to="/dashboard" replace />
              )
            ) : (
              <Navigate to="/" replace />
            )
          }
        />
        <Route
          path="/pharmacy/dashboard"
          element={
            user ? (
              (user.role === 'pharmacy' || user.userType === 'pharmacy') ? (
                <PharmacyDashboard onLogout={handleLogout} />
              ) : (
                <Navigate to="/dashboard" replace />
              )
            ) : (
              <Navigate to="/" replace />
            )
          }
        />
        <Route
          path="/pharmacy/:id"
          element={
            user ? (
              <PharmacyDetailPage />
            ) : (
              <Navigate to="/" replace />
            )
          }
        />
        <Route
          path="/pharmacy/register"
          element={
            user ? (
              <PharmacyRegister onLogout={handleLogout} />
            ) : (
              <Navigate to="/" replace />
            )
          }
        />
        <Route
          path="/reservations"
          element={
            user ? (
              <MyReservations />
            ) : (
              <Navigate to="/" replace />
            )
          }
        />
        <Route
  path="/admin/pharmacies"
  element={
    user && (user.role === 'admin' || user.userType === 'admin') ? (
      <AdminPharmacies onLogout={handleLogout} />
    ) : (
      <Navigate to={user ? "/dashboard" : "/"} replace />
    )
  }
/>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </div>
  );
};

function App() {
  return (
    <Router>
      <LocationProvider>
        <AppContent />
      </LocationProvider>
    </Router>
  );
}

export default App;

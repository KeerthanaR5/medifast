import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Search, MapPin, ShoppingBag, User, LogOut, Heart, Pill,
  TrendingUp, Settings, HelpCircle, Menu, LayoutDashboard,
  ChevronLeft, ChevronRight, Bell, MessageSquare
} from 'lucide-react';
import './Dashboard.css';
import { useLocationContext } from '../../contexts/LocationContext';

// eslint-disable-next-line no-unused-vars
function CalendarCard() {
  const [date, setDate] = useState(new Date());
  const days = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
  const month = date.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  const today = new Date();
  const firstDay = new Date(date.getFullYear(), date.getMonth(), 1).getDay();
  const daysAmt = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();

  function changeMonth(d) {
    const nd = new Date(date);
    nd.setMonth(date.getMonth() + d);
    setDate(nd);
  }

  const mockDays = Array.from({ length: 35 }, (_, i) => {
    const d = i - firstDay + 1;
    return d > 0 && d <= daysAmt ? d : null;
  });

  return (
    <div className="db-card calendar">
      <div className="cal-header">
        <button onClick={() => changeMonth(-1)}><ChevronLeft /></button>
        <span>{month}</span>
        <button onClick={() => changeMonth(1)}><ChevronRight /></button>
      </div>
      <div className="cal-days">{days.map(x => <span key={x}>{x}</span>)}</div>
      <div className="cal-grid">
        {mockDays.map((day, i) =>
          <span key={i} className={
            !day ? "cal-cell empty" :
              (today.getDate() === day &&
                today.getMonth() === date.getMonth() &&
                today.getFullYear() === date.getFullYear())
                ? "cal-cell today"
                : "cal-cell"
          }>
            {day}
          </span>
        )}
      </div>
    </div>
  );
}

function WelcomeCard({ user, onGoToSearch, setActiveTab }) {
  return (
    <div className="db-card welcome">
      <h2>Hello {user.fullName.split(' ')[0]}!</h2>
      <p>Welcome back to your health dashboard.</p>
      <div className="welcome-actions">
        <button className="welcome-action outline" onClick={onGoToSearch}>
          <Search size={18} /> Find Medicine
        </button>
        <button className="welcome-action" onClick={() => setActiveTab('prescriptions')}>
          <Heart size={18} /> View Prescriptions
        </button>
      </div>
    </div>
  );
}

// eslint-disable-next-line no-unused-vars
function StatCard({ title, value, change, icon: Icon, trend, accent }) {
  return (
    <div className="db-card stat">
      <div className="stat-top">
        <div>
          <span className="stat-title">{title}</span>
          <span className="stat-sub">Last 30 Days</span>
        </div>
        <span className={`stat-icon ${accent}`}>{Icon && <Icon size={22} />}</span>
      </div>
      <span className="stat-value">{value}</span>
      <span className={`stat-trend ${trend}`}>{trend === "up" ? <TrendingUp size={14} /> : null}{change}</span>
    </div>
  );
}

// Removed map placeholder card to clear mock data

function QuickActions({ setActiveTab, onGoToSearch, onGoToReservations }) {
  const actions = [
    { name: "Search Medicines", desc: "Find available medicines in nearby pharmacies instantly.", icon: Pill, bg: "#e7fbfa", color: "#22c593", tab: "medicines" },
    { name: "Find Pharmacies", desc: "Locate trusted pharmacies in your area with directions.", icon: MapPin, bg: "#324366", color: "#fff", tab: "pharmacies" },
    { name: "View Orders", desc: "Track your order history and current status.", icon: ShoppingBag, bg: "#f3f1fd", color: "#8c47fa", tab: "orders" },
  ];
  return (
    <section className="quick-actions">
      <h3>Quick Actions</h3>
      <div className="actions-row">
        {actions.map(a =>
          <div className="action-card" style={{ background: a.bg, color: a.color }} key={a.name} onClick={() => {
            if (a.tab === 'medicines') onGoToSearch();
            else if (a.tab === 'orders') onGoToReservations();
            else setActiveTab(a.tab);
          }}>
            <span className="action-icon" style={{ background: a.bg, color: a.color }}><a.icon size={22} /></span>
            <div className="action-name">{a.name}</div>
            <div className="action-desc">{a.desc}</div>
          </div>
        )}
      </div>
    </section>
  );
}

// eslint-disable-next-line no-unused-vars
function PopularMedicinesGallery({ popularMedicines }) {
  return (
    <section className="popmed">
      <h3>Popular Medicines</h3>
      <div className="popmed-row">
        {popularMedicines.map(med => (
          <div className="popmed-card" key={med.name}>
            <div className="popmed-img">{med.name.split(' ')[0]}</div>
            <div className="popmed-title">{med.name}</div>
            <div className="popmed-qty">{'Qty: ' + (med.quantity || '30 Tabs')}</div>
            <div className="popmed-foot">
              <span className="popmed-price">₹{med.price}</span>
              <button className="popmed-add"><ShoppingBag size={16} /></button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function Sidebar({ activeTab, setActiveTab, user, onLogout, onGoToSearch, onGoToReservations }) {
  return (
    <aside className="db-sidebar">
      <div className="sidebar-logo">Medi<span>Fast</span></div>
      <div className="sidebar-user">
        <div className="sidebar-avatar">{user.fullName.charAt(0)}</div>
        <div>
          <div className="sidebar-username">{user.fullName}</div>
          <div className="sidebar-role">{user.role?.toLowerCase()}</div>
        </div>
      </div>
      <nav className="sidebar-nav">
        <button className={activeTab === "overview" ? "active" : ""} onClick={() => setActiveTab('overview')}><LayoutDashboard size={18} /> Overview</button>
        <button className={activeTab === "medicines" ? "active" : ""} onClick={onGoToSearch}><Pill size={18} /> Medicine Search</button>
        <button className={activeTab === "pharmacies" ? "active" : ""} onClick={() => setActiveTab('pharmacies')}><MapPin size={18} /> Pharmacy Locator</button>
        <button className={activeTab === "orders" ? "active" : ""} onClick={onGoToReservations}><ShoppingBag size={18} /> My Reservations</button>
        <button className={activeTab === "prescriptions" ? "active" : ""} onClick={() => setActiveTab('prescriptions')}><Heart size={18} /> Prescriptions</button>
        <button className={activeTab === "profile" ? "active" : ""} onClick={() => setActiveTab('profile')}><User size={18} /> Profile</button>
        <button className={activeTab === "settings" ? "active" : ""} onClick={() => setActiveTab('settings')}><Settings size={18} /> Settings</button>
      </nav>


      <div className="sidebar-bottom">
      <button><HelpCircle size={18} /> Help & Support</button>
        <button onClick={onLogout} className="sidebar-logout"><LogOut size={20} /> Logout</button>
      </div>

    </aside>
  );
}

const Dashboard = ({ user, onLogout }) => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('overview');
  // Centralized location context
  const { lat, lon, accuracy, geoSupported, getHighAccuracy, fetchAreaSuggestions, selectArea } = useLocationContext();
  const [areaQuery, setAreaQuery] = useState('');
  const [areaSuggestions, setAreaSuggestions] = useState([]);
  const [areaLoading, setAreaLoading] = useState(false);

  // Request GPS only when no location has been selected.
  useEffect(() => {
    if (!geoSupported || (lat !== '' && lon !== '')) return;

    getHighAccuracy({
      enableHighAccuracy: true,
      timeout: 15000,
      maximumAge: 0
    });
  }, [geoSupported, lat, lon, getHighAccuracy]);

  const handleUseMyLocation = async () => {
    await getHighAccuracy({ enableHighAccuracy: true, timeout: 15000, maximumAge: 0 });
  };

  // Use fetchAreaSuggestions/selectArea from context; local state only manages UI list

  // Navigate to dedicated search page
  const goToSearch = () => navigate('/search');
  const goToReservations = () => navigate('/reservations');

  return (
    <div className="dashboard-wrap">
      <Sidebar activeTab={activeTab} setActiveTab={setActiveTab} user={user} onLogout={onLogout} onGoToSearch={goToSearch} onGoToReservations={goToReservations} />
      <main className="dashboard-main">
        <header className="dashboard-header">
          <div className="db-toolbar-left">
            <button className="db-menuicon" aria-label="menu"><Menu size={22} /></button>
            <span className="db-title">Welcome</span>
          </div>
          <div className="db-toolbar-right">
            <div className="dashboard-search">
              <input placeholder="Search..." type="text" />
              <Search size={16} className="db-searchicon" />
            </div>
            <button className="db-bell" aria-label="notifications"><Bell size={18} /></button>
            <button className="db-msg" aria-label="messages"><MessageSquare size={18} /></button>
            <details className="db-account-menu">
              <summary className="db-avatar" aria-label="Open account menu">
                {user.fullName.charAt(0).toUpperCase()}
              </summary>
              <div className="db-account-dropdown" role="menu">
                <button type="button" role="menuitem" onClick={onLogout}>
                  <LogOut size={16} /> Logout
                </button>
              </div>
            </details>
          </div>
        </header>
        <div className="dashboard-content">
          {/* Welcome */}
          <div className="grid-row row-1">
            <div className="grid-cell welcome-cell">
              <WelcomeCard user={user} onGoToSearch={goToSearch} setActiveTab={setActiveTab} />
            </div>
          </div>

          {/* Set my location card */}
          <section className="quick-actions" style={{ marginTop: 16 }}>
            <h3>Location</h3>
            <div className="db-card" style={{ padding: 16 }}>
              <button className="welcome-action outline" onClick={handleUseMyLocation} disabled={!geoSupported}><MapPin size={16}/> {geoSupported ? 'Use My Location' : 'Geolocation not supported'}</button>
              {typeof accuracy === 'number' && (
                <div style={{ marginTop: 8, fontSize: 12, color: '#6b7280' }}>
                  Accuracy: ±{Math.round(accuracy)} m {accuracy > 2000 ? '(low accuracy)' : ''}
                </div>
              )}
              <div style={{ marginTop: 10 }}>
                <div style={{ fontSize: 13, color: '#1f3a47', marginBottom: 6 }}>Or enter your area (e.g., Koramangala)</div>
                <input
                  className="qa-input"
                  placeholder="Type locality, area, city..."
                  value={areaQuery}
                  onChange={async (e)=>{ const v = e.target.value; setAreaQuery(v); if (v.trim().length>=3) { setAreaLoading(true); const items = await fetchAreaSuggestions(v); setAreaSuggestions(items); setAreaLoading(false); } else { setAreaSuggestions([]);} }}
                />
                {areaLoading && <div style={{ fontSize: 12, color: '#6b7280', marginTop: 6 }}>Searching…</div>}
                {areaSuggestions.length > 0 && (
                  <div className="db-card" style={{ padding: 8, marginTop: 6 }}>
                    {areaSuggestions.map((s, i) => (
                      <div key={i} style={{ padding: '6px 8px', cursor: 'pointer' }} onClick={()=> { selectArea(s); setAreaQuery(s.label); setAreaSuggestions([]); }}>
                        {s.label}
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div style={{ marginTop: 10, fontSize: 12, color: '#6b7280' }}>
                Current: {lat && lon ? `${lat}, ${lon}` : 'Not set'}
              </div>
            </div>
          </section>

          {/* Keep quick actions for navigation */}
          <QuickActions setActiveTab={setActiveTab} onGoToSearch={goToSearch} onGoToReservations={goToReservations} />
        </div>
      </main>
    </div>
  );
};

export default Dashboard;

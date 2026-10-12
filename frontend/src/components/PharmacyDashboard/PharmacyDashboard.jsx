import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { pharmacyOwnerAPI, reservationsAPI } from '../../services/api';
import { useLocationContext } from '../../contexts/LocationContext';

export default function PharmacyDashboard({ onLogout }) {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [data, setData] = useState(null);
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingLocation, setSavingLocation] = useState(false);

  const { getHighAccuracy } = useLocationContext();

  const pharmacyId = useMemo(() => data?.data?.pharmacy?._id || data?.pharmacy?._id, [data]);

  const loadDashboard = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const resp = await pharmacyOwnerAPI.getDashboard();
      setData(resp);
    } catch (e) {
      if (e?.status === 404) {
        navigate('/pharmacy/register', { replace: true });
        return;
      }
      setError(e?.message || 'Failed to load dashboard');
    } finally {
      setLoading(false);
    }
  }, [navigate]);

  useEffect(() => {
    loadDashboard();
    const t = setInterval(loadDashboard, 30000);
    return () => clearInterval(t);
  }, [loadDashboard]);

  const [profileForm, setProfileForm] = useState({});

  useEffect(() => {
    const ph = data?.data?.pharmacy || data?.pharmacy;
    if (ph) {
      setProfileForm({
        name: ph.name || '',
        contact_info: {
          phone: ph.contact_info?.phone || '',
          email: ph.contact_info?.email || '',
          website: ph.contact_info?.website || ''
        },
        opening_hours: { ...ph.opening_hours },
        address: { ...ph.address }
      });
    }
  }, [data]);

  const onProfileChange = (field, value) => {
    setProfileForm((prev) => ({ ...prev, [field]: value }));
  };
  const onContactChange = (field, value) => {
    setProfileForm((prev) => ({ ...prev, contact_info: { ...prev.contact_info, [field]: value } }));
  };
  const onHoursChange = (day, value) => {
    setProfileForm((prev) => ({ ...prev, opening_hours: { ...prev.opening_hours, [day]: value } }));
  };
  const onAddressChange = (field, value) => {
    setProfileForm((prev) => ({ ...prev, address: { ...prev.address, [field]: value } }));
  };

  const saveProfile = async () => {
    if (!pharmacyId) return;
    setSavingProfile(true); setError('');
    try {
      await pharmacyOwnerAPI.updateProfile(pharmacyId, profileForm);
      await loadDashboard();
      alert('Profile updated');
    } catch (e) {
      setError(e?.message || 'Failed to update profile');
    } finally {
      setSavingProfile(false);
    }
  };

  const useCurrentLocation = async () => {
    if (!pharmacyId) return;
    setSavingLocation(true); setError('');
    try {
      const pos = await getHighAccuracy();
      if (pos?.lat && pos?.lon) {
        await pharmacyOwnerAPI.updateLocation(pharmacyId, pos.lat, pos.lon);
        await loadDashboard();
        alert('Location updated');
      } else {
        setError('Unable to get current location');
      }
    } catch (e) {
      setError(e?.message || 'Failed to update location');
    } finally {
      setSavingLocation(false);
    }
  };

  const confirmReservation = async (id) => {
    try {
      await reservationsAPI.confirm(id);
      await loadDashboard();
    } catch (e) {
      alert(e?.message || 'Failed to confirm reservation');
    }
  };
  const cancelReservation = async (id) => {
    try {
      await reservationsAPI.cancel(id);
      await loadDashboard();
    } catch (e) {
      alert(e?.message || 'Failed to cancel reservation');
    }
  };
  const pickupReservation = async (id) => {
    try {
      await reservationsAPI.pickup(id);
      await loadDashboard();
    } catch (e) {
      alert(e?.message || 'Failed to mark pickup');
    }
  };

  if (loading) {
    return (
      <div className="dashboard-content" style={{ padding: 16 }}>
        <h2>Pharmacy Dashboard</h2>
        <p>Loading…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="dashboard-content" style={{ padding: 16 }}>
        <h2>Pharmacy Dashboard</h2>
        <div style={{ color: '#b00020' }}>{error}</div>
      </div>
    );
  }

  const payload = data?.data || data || {};
  const lowStock = payload.stock?.lowStock || [];
  const recent = payload.reservations?.recent || [];
  const counts = payload.reservations?.counts || {};
  const analytics = payload.analytics || {};
  const pending = recent.filter(r => r.status === 'pending').slice(0, 5);

  return (
    <div className="dashboard-content" style={{ padding: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2>Pharmacy Dashboard</h2>
        <div style={{ display:'flex', gap:8 }}>
          <Link to="/pharmacy/stock" className="welcome-action">Go to Stock Manager</Link>
          {onLogout && (
            <button className="welcome-action outline" onClick={onLogout}>Logout</button>
          )}
        </div>
      </div>

      <div className="db-grid" style={{ display: 'grid', gap: 16, gridTemplateColumns: '1fr 1fr' }}>
        <div className="db-card" style={{ padding: 16 }}>
          <h3>Profile</h3>
          <div style={{ display: 'grid', gap: 8 }}>
            <label>
              Name
              <input className="qa-input" value={profileForm.name || ''} onChange={(e) => onProfileChange('name', e.target.value)} />
            </label>
            <label>
              Phone
              <input className="qa-input" value={profileForm.contact_info?.phone || ''} onChange={(e) => onContactChange('phone', e.target.value)} />
            </label>
            <label>
              Email
              <input className="qa-input" value={profileForm.contact_info?.email || ''} onChange={(e) => onContactChange('email', e.target.value)} />
            </label>
            <label>
              Website
              <input className="qa-input" value={profileForm.contact_info?.website || ''} onChange={(e) => onContactChange('website', e.target.value)} />
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              {Object.keys(profileForm.opening_hours || {}).map((day) => (
                <label key={day}>
                  {day.toUpperCase()}
                  <input className="qa-input" value={profileForm.opening_hours[day] || ''} onChange={(e) => onHoursChange(day, e.target.value)} />
                </label>
              ))}
            </div>
            <h4>Address</h4>
            <label>
              Street
              <input className="qa-input" value={profileForm.address?.street || ''} onChange={(e) => onAddressChange('street', e.target.value)} />
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <label>
                City
                <input className="qa-input" value={profileForm.address?.city || ''} onChange={(e) => onAddressChange('city', e.target.value)} />
              </label>
              <label>
                State
                <input className="qa-input" value={profileForm.address?.state || ''} onChange={(e) => onAddressChange('state', e.target.value)} />
              </label>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <label>
                Zip Code
                <input className="qa-input" value={profileForm.address?.zipCode || ''} onChange={(e) => onAddressChange('zipCode', e.target.value)} />
              </label>
              <label>
                Country
                <input className="qa-input" value={profileForm.address?.country || ''} onChange={(e) => onAddressChange('country', e.target.value)} />
              </label>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="welcome-action" disabled={savingProfile} onClick={saveProfile}>{savingProfile ? 'Saving…' : 'Save Profile'}</button>
              <button className="welcome-action outline" disabled={savingLocation} onClick={useCurrentLocation}>{savingLocation ? 'Updating…' : 'Use Current Location'}</button>
            </div>
          </div>
        </div>

        <div className="db-card" style={{ padding: 16 }}>
          <h3>Overview</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <div className="stat-chip">Total Stock Items: {analytics.totalStockItems ?? '-'}</div>
            <div className="stat-chip">Unique Medicines: {analytics.totalMedicines ?? '-'}</div>
            <div className="stat-chip">Low Stock: {analytics.lowStockCount ?? 0}</div>
            <div className="stat-chip">Pending Reservations: {counts.pending ?? 0}</div>
          </div>
          <h4 style={{ marginTop: 12 }}>Low Stock</h4>
          {lowStock.length === 0 ? (
            <div style={{ color: '#6b7280' }}>No low stock items</div>
          ) : (
            <ul>
              {lowStock.map((i) => (
                <li key={i.id}>
                  {i.name} — {i.quantity} {i.unit}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="db-card" style={{ padding: 16, marginTop: 16 }}>
        <h3>Recent Reservations</h3>
        {recent.length === 0 ? (
          <div style={{ color: '#6b7280' }}>No recent reservations</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="qa-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th align="left">Customer</th>
                  <th align="left">Item</th>
                  <th align="left">Status</th>
                  <th align="left">Created</th>
                  <th align="left">Actions</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((r) => (
                  <tr key={r.id}>
                    <td>{r.user?.name || '-'}</td>
                    <td>{r.item?.name || '-'} {r.item ? `(${r.item.quantity} ${r.item.unit})` : ''}</td>
                    <td>{r.status}</td>
                    <td>{new Date(r.createdAt).toLocaleString()}</td>
                    <td style={{ display: 'flex', gap: 8 }}>
                      {r.status === 'pending' && (
                        <>
                          <button className="welcome-action" onClick={() => confirmReservation(r.id)}>Confirm</button>
                          <button className="welcome-action outline" onClick={() => cancelReservation(r.id)}>Cancel</button>
                        </>
                      )}
                      {r.status === 'confirmed' && (
                        <button className="welcome-action" onClick={() => pickupReservation(r.id)}>Mark Picked Up</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}


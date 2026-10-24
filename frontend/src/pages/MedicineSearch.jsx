import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { Search, MapPin, CheckCircle, AlertCircle, ShieldCheck, X } from 'lucide-react';
import api from '../services/api';
import { useLocationContext } from '../contexts/LocationContext';
import { useNavigate } from 'react-router-dom';

const RADIUS_OPTIONS = [3, 5, 10, 20];

export default function MedicineSearch() {
  const { lat, lon, source, geoSupported, getHighAccuracy, fetchAreaSuggestions, selectArea } = useLocationContext();
  const navigate = useNavigate();
  const [medicine, setMedicine] = useState('');
  const [radiusKm, setRadiusKm] = useState(3);
  const [useDemoLocation, setUseDemoLocation] = useState(true);
  const [customCoordsEnabled, setCustomCoordsEnabled] = useState(false);
  const [customLat, setCustomLat] = useState('12.882625');
  const [customLon, setCustomLon] = useState('77.583950');

  const [search, setSearch] = useState({ loading: false, error: '', results: [] });
  const [areaQuery, setAreaQuery] = useState('');
  const [areaSuggestions, setAreaSuggestions] = useState([]);
  const [areaLoading, setAreaLoading] = useState(false);

  const [suggestions, setSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);

  // Modal reservation state
  const [reserveModal, setReserveModal] = useState({
    open: false,
    pharmacy: null,
    stock: null,
    quantity: 1,
    busy: false,
    error: '',
    success: false
  });

  const hasBrowserLocation = useMemo(
    () => Number.isFinite(parseFloat(lat)) && Number.isFinite(parseFloat(lon)),
    [lat, lon]
  );

  // Active coordinates
  const activeCoordinates = useMemo(() => {
    if (customCoordsEnabled) {
      const parsedLat = parseFloat(customLat);
      const parsedLon = parseFloat(customLon);
      return Number.isFinite(parsedLat) && Number.isFinite(parsedLon)
        ? { lat: parsedLat, lon: parsedLon, label: 'Manual Coordinates' }
        : null;
    }
    if (useDemoLocation) {
      return { lat: 12.882625, lon: 77.583950, label: 'Demo Location (JP Nagar, Bengaluru)' };
    }
    if (hasBrowserLocation) {
      return { lat: parseFloat(lat), lon: parseFloat(lon), label: 'Browser Location' };
    }
    return null;
  }, [customCoordsEnabled, customLat, customLon, useDemoLocation, hasBrowserLocation, lat, lon]);

  // Debounced medicine suggestions
  const fetchSuggestions = useCallback(async (query) => {
    if (!query || query.length < 1) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }

    setSuggestionsLoading(true);
    try {
      const response = await api.get('/medicines/autocomplete', { params: { query } });
      setSuggestions(response.data?.data || []);
      setShowSuggestions(true);
    } catch (error) {
      console.error('Failed to fetch suggestions:', error);
      setSuggestions([]);
    } finally {
      setSuggestionsLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchSuggestions(medicine);
    }, 300);
    return () => clearTimeout(timer);
  }, [medicine, fetchSuggestions]);

  const runSearch = async () => {
    try {
      setSearch({ loading: true, error: '', results: [] });
      if (!medicine.trim()) {
        setSearch({ loading: false, error: 'Please enter a medicine name', results: [] });
        return;
      }
      if (!Number.isFinite(radiusKm) || radiusKm < 1 || radiusKm > 20) {
        setSearch({ loading: false, error: 'Search radius must be between 1 and 20 km', results: [] });
        return;
      }
      if (!activeCoordinates) {
        setSearch({ loading: false, error: 'Please set your location or enable Demo Location', results: [] });
        return;
      }

      const unified = await api.get('/pharmacies/search', {
        params: {
          medicine: medicine.trim(),
          lat: activeCoordinates.lat,
          lon: activeCoordinates.lon,
          radius: Math.round(radiusKm * 1000),
          source: source || 'unknown'
        }
      });

      const rawResults = Array.isArray(unified.data?.data)
        ? unified.data.data
        : Array.isArray(unified.data?.results)
          ? unified.data.results
          : [];

      const results = rawResults.map((r) => ({
        pharmacy_id: r.pharmacy_id ?? r.id ?? null,
        name: r.name,
        verified: !!r.verified,
        demo: r.demo === true,
        distance_m: r.distance ?? r.distance_m ?? null,
        open_now: r.open_now ?? null,
        address: r.address,
        coordinates: r.coordinates,
        stock: r.stock
          ? {
              ...r.stock,
              quantity: r.stock.qty ?? r.stock.quantity ?? 0,
              medicine: r.stock.medicine || null
            }
          : null
      }));

      setSearch({
        loading: false,
        error: '',
        notice: unified.data?.notice || '',
        hasSearched: true,
        results
      });
    } catch (e) {
      setSearch({
        loading: false,
        error: e?.response?.data?.message || e?.message || 'Search failed',
        results: []
      });
    }
  };

  const openDetail = (item) => {
    if (!item?.pharmacy_id) return;
    const q = medicine.trim() ? `?medicine=${encodeURIComponent(medicine.trim())}` : '';
    navigate(`/pharmacy/${item.pharmacy_id}${q}`);
  };

  const openReserveModal = (item) => {
    if (!api.utils.isAuthenticated()) {
      alert('Please log in with a customer account to make a reservation.');
      window.location.href = '/login';
      return;
    }
    const currentUser = api.utils.getCurrentUser();
    if (currentUser && currentUser.role && currentUser.role !== 'customer') {
      alert(`You are logged in as '${currentUser.role}'. Reservations can only be placed by customer accounts. Please log in as a customer.`);
      return;
    }
    if (!item?.verified || !item?.pharmacy_id || !item?.stock?.quantity) return;
    setReserveModal({
      open: true,
      pharmacy: item,
      stock: item.stock,
      quantity: 1,
      busy: false,
      error: '',
      success: false
    });
  };

  const closeReserveModal = () => {
    setReserveModal({
      open: false,
      pharmacy: null,
      stock: null,
      quantity: 1,
      busy: false,
      error: '',
      success: false
    });
  };

  const submitReservation = async () => {
    const { pharmacy, stock, quantity } = reserveModal;
    if (!pharmacy?.pharmacy_id || !stock) return;

    const available = Number(stock.quantity) || 0;
    const qty = Number(quantity);

    if (!Number.isSafeInteger(qty) || qty <= 0) {
      setReserveModal((prev) => ({ ...prev, error: 'Quantity must be a positive whole number' }));
      return;
    }
    if (qty > available) {
      setReserveModal((prev) => ({
        ...prev,
        error: `Requested quantity exceeds available stock (${available} units)`
      }));
      return;
    }

    setReserveModal((prev) => ({ ...prev, busy: true, error: '' }));
    try {
      const payload = {
        pharmacyId: pharmacy.pharmacy_id,
        quantity: qty
      };
      if (stock.medicine) {
        payload.medicineId = stock.medicine;
      }
      if (stock.medicineName || medicine) {
        payload.medicineName = stock.medicineName || medicine.trim();
      }

      await api.post('/reservations', payload);
      setReserveModal((prev) => ({ ...prev, busy: false, success: true }));

      // Refresh search results to reflect decremented stock
      runSearch();
    } catch (e) {
      setReserveModal((prev) => ({
        ...prev,
        busy: false,
        error: e?.data?.message || e?.message || e?.response?.data?.message || 'Failed to create reservation'
      }));
    }
  };

  const handleUseMyLocation = async () => {
    setUseDemoLocation(false);
    setCustomCoordsEnabled(false);
    await getHighAccuracy({ enableHighAccuracy: true, timeout: 10000, maximumAge: 0 });
  };

  const onAreaChange = async (val) => {
    setAreaQuery(val);
    if (val.trim().length < 3) {
      setAreaSuggestions([]);
      return;
    }
    setAreaLoading(true);
    const items = await fetchAreaSuggestions(val);
    setAreaSuggestions(items);
    setAreaLoading(false);
  };

  const selectSuggestion = (suggestion) => {
    setMedicine(suggestion.name);
    setShowSuggestions(false);
  };

  return (
    <div className="dashboard-content" style={{ padding: 16, maxWidth: 1000, margin: '0 auto' }}>
      <section className="quick-actions" style={{ marginTop: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <h2 style={{ margin: 0 }}>Medicine Availability & Pharmacy Search</h2>
          <button className="welcome-action outline" onClick={() => navigate('/reservations')}>
            My Reservations
          </button>
        </div>

        <div className="db-card" style={{ padding: 20 }}>
          {/* Location Controls */}
          <div style={{ background: '#f8fafc', padding: 12, borderRadius: 8, marginBottom: 16, border: '1px solid #e2e8f0' }}>
            <div style={{ fontWeight: 600, fontSize: 13, color: '#334155', marginBottom: 8 }}>
              Location & Coordinates
            </div>

            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 13 }}>
                <input
                  type="checkbox"
                  checked={useDemoLocation}
                  disabled={customCoordsEnabled}
                  onChange={(e) => {
                    setUseDemoLocation(e.target.checked);
                    if (e.target.checked) setCustomCoordsEnabled(false);
                  }}
                />
                Use Demo Location (JP Nagar, Bengaluru)
              </label>

              <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 13 }}>
                <input
                  type="checkbox"
                  checked={customCoordsEnabled}
                  onChange={(e) => {
                    setCustomCoordsEnabled(e.target.checked);
                    if (e.target.checked) setUseDemoLocation(false);
                  }}
                />
                Enter Custom Coordinates
              </label>

              <button
                type="button"
                className="welcome-action outline"
                style={{ padding: '4px 10px', fontSize: 12 }}
                onClick={handleUseMyLocation}
                disabled={!geoSupported}
              >
                <MapPin size={14} /> {geoSupported ? 'Use My Browser Location' : 'Geolocation Not Supported'}
              </button>
            </div>

            {/* Custom Coordinates Inputs */}
            {customCoordsEnabled && (
              <div style={{ display: 'flex', gap: 10, marginTop: 10, alignItems: 'center' }}>
                <input
                  className="qa-input"
                  style={{ width: 140 }}
                  placeholder="Latitude (e.g. 12.8826)"
                  value={customLat}
                  onChange={(e) => setCustomLat(e.target.value)}
                />
                <input
                  className="qa-input"
                  style={{ width: 140 }}
                  placeholder="Longitude (e.g. 77.5839)"
                  value={customLon}
                  onChange={(e) => setCustomLon(e.target.value)}
                />
                <span style={{ fontSize: 12, color: '#64748b' }}>Enter decimal coordinates to search</span>
              </div>
            )}

            {/* Active coordinates status banner */}
            {activeCoordinates && (
              <div style={{ marginTop: 8, fontSize: 12, color: '#475569' }}>
                Active coordinates:{' '}
                <strong>
                  {activeCoordinates.lat.toFixed(6)}, {activeCoordinates.lon.toFixed(6)}
                </strong>{' '}
                ({activeCoordinates.label})
              </div>
            )}

            {!activeCoordinates && !geoSupported && (
              <div style={{ marginTop: 8 }}>
                <input
                  className="qa-input"
                  placeholder="Type area (e.g. Koramangala, Indiranagar)..."
                  value={areaQuery}
                  onChange={(e) => onAreaChange(e.target.value)}
                />
                {areaLoading && <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>Searching areas...</div>}
                {areaSuggestions.length > 0 && (
                  <div className="db-card" style={{ padding: 8, marginTop: 6 }}>
                    {areaSuggestions.map((s, i) => (
                      <div
                        key={i}
                        style={{ padding: '6px 8px', cursor: 'pointer', fontSize: 13 }}
                        onClick={() => {
                          selectArea(s);
                          setAreaQuery(s.label);
                          setAreaSuggestions([]);
                        }}
                      >
                        {s.label}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Medicine Search Input */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
            <div style={{ position: 'relative', flex: 1 }}>
              <input
                className="qa-input"
                placeholder="Search by brand name or generic name (e.g., Paracetamol, Ibuprofen)..."
                value={medicine}
                onChange={(e) => setMedicine(e.target.value)}
                onKeyDown={(e) => e.key === 'Escape' && setShowSuggestions(false)}
                onFocus={() => medicine.length >= 1 && setShowSuggestions(true)}
                onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
              />
              {suggestionsLoading && (
                <div style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', fontSize: 12, color: '#64748b' }}>
                  Searching...
                </div>
              )}
              {showSuggestions && suggestions.length > 0 && (
                <div
                  style={{
                    position: 'absolute',
                    top: '100%',
                    left: 0,
                    right: 0,
                    background: 'white',
                    border: '1px solid #e2e8f0',
                    borderRadius: 8,
                    boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                    zIndex: 1000,
                    maxHeight: 220,
                    overflowY: 'auto'
                  }}
                >
                  {suggestions.map((suggestion, index) => (
                    <div
                      key={index}
                      style={{
                        padding: '8px 12px',
                        cursor: 'pointer',
                        borderBottom: index < suggestions.length - 1 ? '1px solid #f1f5f9' : 'none'
                      }}
                      onMouseDown={() => selectSuggestion(suggestion)}
                    >
                      <div style={{ fontWeight: 500 }}>{suggestion.name}</div>
                      {suggestion.generic_name && suggestion.generic_name !== suggestion.name && (
                        <div style={{ fontSize: 12, color: '#64748b' }}>Generic: {suggestion.generic_name}</div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <button className="welcome-action" onClick={runSearch} disabled={search.loading}>
              <Search size={16} /> {search.loading ? 'Searching...' : 'Search'}
            </button>
          </div>

          {/* Search Radius Controls */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 13, fontWeight: 500, color: '#475569' }}>Search Radius:</span>
            <div style={{ display: 'flex', gap: 6 }}>
              {RADIUS_OPTIONS.map((opt) => (
                <button
                  key={opt}
                  type="button"
                  onClick={() => setRadiusKm(opt)}
                  className={`btn ${radiusKm === opt ? 'active' : ''}`}
                  style={{
                    padding: '4px 12px',
                    fontSize: 12,
                    borderRadius: 6,
                    border: '1px solid #cbd5e1',
                    background: radiusKm === opt ? '#2563eb' : '#ffffff',
                    color: radiusKm === opt ? '#ffffff' : '#334155',
                    cursor: 'pointer'
                  }}
                >
                  {opt} km
                </button>
              ))}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#64748b' }}>
              <span>Custom:</span>
              <input
                className="qa-input"
                type="number"
                min={1}
                max={20}
                style={{ width: 70, padding: '4px 8px' }}
                value={radiusKm}
                onChange={(e) => setRadiusKm(Math.max(1, Math.min(20, Number(e.target.value))))}
              />
              <span>km (max 20)</span>
            </div>
          </div>

          {/* Notifications and Errors */}
          {search.notice && (
            <div style={{ color: '#92400e', background: '#fef3c7', padding: '8px 12px', borderRadius: 6, fontSize: 13, marginTop: 8 }}>
              {search.notice}
            </div>
          )}
          {search.error && (
            <div style={{ color: '#b91c1c', background: '#fee2e2', padding: '8px 12px', borderRadius: 6, fontSize: 13, marginTop: 8 }}>
              {search.error}
            </div>
          )}

          {/* Empty Search Result */}
          {!search.loading && !search.error && search.hasSearched && search.results.length === 0 && (
            <div style={{ color: '#64748b', fontSize: 14, textAlign: 'center', padding: '24px 0' }}>
              No pharmacies found with &quot;{medicine}&quot; within {radiusKm} km. Try increasing the search radius to 5 km, 10 km, or 20 km.
            </div>
          )}

          {/* Search Results List */}
          {search.results.length > 0 && (
            <div style={{ marginTop: 16, display: 'grid', gap: 12 }}>
              <div style={{ fontSize: 13, color: '#64748b', fontWeight: 500 }}>
                Found {search.results.length} {search.results.length === 1 ? 'pharmacy' : 'pharmacies'} within {radiusKm} km:
              </div>

              {search.results.map((r, idx) => (
                <div
                  key={(r.pharmacy_id || 'ext') + idx}
                  className="db-card"
                  style={{
                    padding: 16,
                    borderLeft: r.verified
                      ? '4px solid #10b981'
                      : r.demo
                        ? '4px solid #f59e0b'
                        : '4px solid #94a3b8'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 8 }}>
                    <div>
                      <h4 style={{ margin: '0 0 4px 0', fontSize: 16 }}>{r.name}</h4>
                      <div style={{ fontSize: 13, color: '#64748b' }}>
                        {r.address?.street ? `${r.address.street}, ` : ''}
                        {r.address?.city || ''} {r.address?.postcode || ''}
                      </div>
                    </div>

                    {/* Badge */}
                    <div>
                      {r.verified ? (
                        <span
                          style={{
                            background: '#dcfce7',
                            color: '#15803d',
                            fontSize: 12,
                            fontWeight: 600,
                            padding: '3px 8px',
                            borderRadius: 12,
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 4
                          }}
                        >
                          <ShieldCheck size={14} /> Verified Pharmacy
                        </span>
                      ) : r.demo ? (
                        <span
                          style={{
                            background: '#fef3c7',
                            color: '#b45309',
                            fontSize: 12,
                            fontWeight: 600,
                            padding: '3px 8px',
                            borderRadius: 12,
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 4
                          }}
                        >
                          <AlertCircle size={14} /> Demo Pharmacy
                        </span>
                      ) : (
                        <span
                          style={{
                            background: '#f1f5f9',
                            color: '#475569',
                            fontSize: 12,
                            fontWeight: 500,
                            padding: '3px 8px',
                            borderRadius: 12
                          }}
                        >
                          Unverified (OSM)
                        </span>
                      )}
                    </div>
                  </div>

                  <div style={{ fontSize: 13, color: '#475569', marginTop: 8 }}>
                    Distance: <strong>{Number.isFinite(r.distance_m) ? (r.distance_m < 1000 ? `${Math.round(r.distance_m)} m` : `${(r.distance_m / 1000).toFixed(2)} km`) : 'Unknown'}</strong>
                    {r.open_now !== null && (
                      <span style={{ marginLeft: 12 }}>
                        Status: <strong style={{ color: r.open_now ? '#15803d' : '#b91c1c' }}>{r.open_now ? 'Open Now' : 'Closed'}</strong>
                      </span>
                    )}
                  </div>

                  {/* Stock Information */}
                  {r.stock && (
                    <div
                      style={{
                        marginTop: 10,
                        padding: '10px 12px',
                        background: r.demo ? '#fffbeb' : '#f0fdf4',
                        borderRadius: 6,
                        border: r.demo ? '1px solid #fde68a' : '1px solid #bbf7d0'
                      }}
                    >
                      <div style={{ fontSize: 13, color: '#1e293b' }}>
                        <strong>{r.demo ? 'Simulated Inventory:' : 'Available Inventory:'}</strong>{' '}
                        <span style={{ color: r.stock.quantity > 0 ? '#15803d' : '#b91c1c', fontWeight: 600 }}>
                          {r.stock.quantity > 0 ? `${r.stock.quantity} units available` : 'Out of stock'}
                        </span>
                        {' | '}
                        <strong>Unit Price:</strong> ₹{Number(r.stock.unitPrice ?? 0).toFixed(2)}
                      </div>

                      {r.demo && (
                        <div style={{ fontSize: 11, color: '#92400e', marginTop: 4 }}>
                          ⚠️ Demonstration inventory only — not verified real-world availability. Reservations are restricted to verified pharmacies.
                        </div>
                      )}
                    </div>
                  )}

                  {/* Action Buttons */}
                  <div style={{ marginTop: 12, display: 'flex', gap: 8, alignItems: 'center' }}>
                    {r.verified && r.pharmacy_id && r.stock?.quantity > 0 && (
                      <button className="welcome-action" onClick={() => openReserveModal(r)}>
                        Reserve for Pickup
                      </button>
                    )}

                    {r.verified && r.pharmacy_id && (
                      <button className="welcome-action outline" onClick={() => openDetail(r)}>
                        View Pharmacy Details
                      </button>
                    )}

                    {r.demo && (
                      <div style={{ fontSize: 12, color: '#64748b', fontStyle: 'italic' }}>
                        Demo pharmacy — reservations disabled per safety verification policy.
                      </div>
                    )}

                    {!r.verified && !r.demo && (
                      <div style={{ fontSize: 12, color: '#64748b', fontStyle: 'italic' }}>
                        Discovered via OpenStreetMap — inventory unknown until pharmacy registers.
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Reservation Modal */}
      {reserveModal.open && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            padding: 16
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget && !reserveModal.busy) closeReserveModal();
          }}
        >
          <div
            style={{
              background: 'white',
              borderRadius: 12,
              width: '100%',
              maxWidth: 480,
              padding: 24,
              boxShadow: '0 20px 25px -5px rgba(0,0,0,0.2)'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3 style={{ margin: 0, fontSize: 18 }}>Reserve Medicine</h3>
              <button
                onClick={closeReserveModal}
                disabled={reserveModal.busy}
                style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 4 }}
              >
                <X size={20} />
              </button>
            </div>

            {reserveModal.success ? (
              <div>
                <div style={{ textAlign: 'center', padding: '16px 0' }}>
                  <CheckCircle size={48} color="#10b981" style={{ margin: '0 auto 12px auto' }} />
                  <h4 style={{ margin: '0 0 8px 0', fontSize: 18, color: '#065f46' }}>Reservation Confirmed!</h4>
                  <p style={{ fontSize: 13, color: '#475569', margin: '0 0 16px 0' }}>
                    Your reservation has been created with status <strong>Pending</strong>. You can view reservation details, countdown timer, and manage it in My Reservations.
                  </p>
                </div>

                <div style={{ display: 'flex', gap: 10 }}>
                  <button
                    className="welcome-action"
                    style={{ flex: 1 }}
                    onClick={() => {
                      closeReserveModal();
                      navigate('/reservations');
                    }}
                  >
                    Go to My Reservations
                  </button>
                  <button
                    className="welcome-action outline"
                    style={{ flex: 1 }}
                    onClick={closeReserveModal}
                  >
                    Continue Searching
                  </button>
                </div>
              </div>
            ) : (
              <div>
                <div style={{ background: '#f8fafc', padding: 12, borderRadius: 8, marginBottom: 16, border: '1px solid #e2e8f0' }}>
                  <div style={{ fontSize: 13, color: '#64748b' }}>Pharmacy</div>
                  <div style={{ fontWeight: 600, fontSize: 15, color: '#1e293b' }}>{reserveModal.pharmacy?.name}</div>

                  <div style={{ fontSize: 13, color: '#64748b', marginTop: 8 }}>Medicine</div>
                  <div style={{ fontWeight: 600, fontSize: 15, color: '#1e293b' }}>{medicine}</div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, fontSize: 13 }}>
                    <span>Available Stock: <strong>{reserveModal.stock?.quantity ?? 0} units</strong></span>
                    <span>Unit Price: <strong>₹{Number(reserveModal.stock?.unitPrice ?? 0).toFixed(2)}</strong></span>
                  </div>
                </div>

                <div style={{ marginBottom: 16 }}>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: '#334155', marginBottom: 6 }}>
                    Quantity to Reserve
                  </label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <input
                      className="qa-input"
                      type="number"
                      min={1}
                      max={reserveModal.stock?.quantity || 1}
                      step={1}
                      value={reserveModal.quantity}
                      onChange={(e) => {
                        const val = parseInt(e.target.value, 10);
                        setReserveModal((prev) => ({
                          ...prev,
                          quantity: isNaN(val) ? '' : val,
                          error: ''
                        }));
                      }}
                      style={{ width: 100 }}
                    />
                    <span style={{ fontSize: 13, color: '#64748b' }}>
                      (Max {reserveModal.stock?.quantity || 1} units)
                    </span>
                  </div>
                </div>

                {/* Estimated Total */}
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '10px 12px',
                    background: '#f1f5f9',
                    borderRadius: 6,
                    marginBottom: 16,
                    fontSize: 14
                  }}
                >
                  <span style={{ fontWeight: 500 }}>Estimated Total:</span>
                  <span style={{ fontWeight: 700, fontSize: 16, color: '#0f172a' }}>
                    ₹
                    {(
                      (Number(reserveModal.quantity) || 0) *
                      Number(reserveModal.stock?.unitPrice ?? 0)
                    ).toFixed(2)}
                  </span>
                </div>

                {reserveModal.error && (
                  <div style={{ color: '#b91c1c', background: '#fee2e2', padding: '8px 12px', borderRadius: 6, fontSize: 13, marginBottom: 12 }}>
                    {reserveModal.error}
                  </div>
                )}

                <div style={{ display: 'flex', gap: 10 }}>
                  <button
                    className="welcome-action outline"
                    style={{ flex: 1 }}
                    onClick={closeReserveModal}
                    disabled={reserveModal.busy}
                  >
                    Cancel
                  </button>
                  <button
                    className="welcome-action"
                    style={{ flex: 1 }}
                    onClick={submitReservation}
                    disabled={reserveModal.busy}
                  >
                    {reserveModal.busy ? 'Submitting...' : 'Confirm Reservation'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

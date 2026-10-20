import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { Search, MapPin } from 'lucide-react';
import api from '../services/api';
import { useLocationContext } from '../contexts/LocationContext';
import { useNavigate } from 'react-router-dom';

export default function MedicineSearch() {
  const { lat, lon, accuracy, source, geoSupported, getHighAccuracy, fetchAreaSuggestions, selectArea } = useLocationContext();
  const navigate = useNavigate();
  const [medicine, setMedicine] = useState('');
  const [radiusKm, setRadiusKm] = useState(3);
  const [useDemoLocation, setUseDemoLocation] = useState(false);
  const [search, setSearch] = useState({ loading: false, error: '', results: [] });
  const [areaQuery, setAreaQuery] = useState('');
  const [areaSuggestions, setAreaSuggestions] = useState([]);
  const [areaLoading, setAreaLoading] = useState(false);
  const [reserveBusyId, setReserveBusyId] = useState(null);
  const [suggestions, setSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);

  const hasLocation = useMemo(() => Number.isFinite(parseFloat(lat)) && Number.isFinite(parseFloat(lon)), [lat, lon]);

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

  // Debounce suggestions
  useEffect(() => {
    const timer = setTimeout(() => {
      fetchSuggestions(medicine);
    }, 300);
    return () => clearTimeout(timer);
  }, [medicine, fetchSuggestions]);

  const runSearch = async () => {
    try {
      setSearch({ loading: true, error: '', results: [] });
      const la = useDemoLocation ? 12.882625 : parseFloat(lat);
      const lo = useDemoLocation ? 77.583950 : parseFloat(lon);
      if (!medicine.trim()) { setSearch({ loading: false, error: 'Please enter a medicine name', results: [] }); return; }
      if (!Number.isFinite(la) || !Number.isFinite(lo)) { setSearch({ loading: false, error: 'Please set your location first', results: [] }); return; }

      const unified = await api.get('/pharmacies/search', { params: { medicine: medicine.trim(), lat: la, lon: lo, radius: Math.round(radiusKm * 1000), source: source || 'unknown' } });
      // Backend returns merged, deduped list with verified flag and optional stock for verified ones
      const results = Array.isArray(unified.data?.data) ? unified.data.data.map(r => ({
        pharmacy_id: r.pharmacy_id ?? null,
        name: r.name,
        verified: !!r.verified,
        demo: r.demo === true,
        distance_m: r.distance ?? r.distance_m ?? null,
        open_now: r.open_now ?? null,
        address: r.address,
        coordinates: r.coordinates,
        stock: r.stock ? { ...r.stock, quantity: r.stock.qty ?? r.stock.quantity ?? 0 } : null
      })) : [];
      setSearch({ loading: false, error: '', results });
    } catch (e) {
      setSearch({ loading: false, error: e?.message || 'Search failed', results: [] });
    }
  };

  const openDetail = (item) => {
    if (!item?.verified || !item?.pharmacy_id) return;
    const q = medicine.trim() ? `?medicine=${encodeURIComponent(medicine.trim())}` : '';
    navigate(`/pharmacy/${item.pharmacy_id}${q}`);
  };

  const handleReserve = async (item) => {
    try {
      if (!item?.verified || !item?.pharmacy_id || !item?.stock?.quantity || !item?.stock?.medicine) return;
      const max = Number(item.stock.quantity) || 1;
      const maxWholeQuantity = Math.floor(max);
      if (maxWholeQuantity < 1) {
        alert('No whole units are available to reserve');
        return;
      }
      const qtyStr = window.prompt(`Reserve quantity (max ${maxWholeQuantity})`, Math.min(1, maxWholeQuantity));
      if (!qtyStr) return;
      const qty = Number(qtyStr);
      if (!/^\d+$/.test(qtyStr.trim()) || !Number.isSafeInteger(qty) || qty <= 0 || qty > maxWholeQuantity) {
        alert('Enter a whole-number quantity within the available stock');
        return;
      }
      setReserveBusyId(item.pharmacy_id);
      await api.post('/reservations', {
        pharmacyId: item.pharmacy_id,
        medicineId: item.stock.medicine,
        quantity: qty
      });
      alert('Reservation created. Check My Reservations page.');
    } catch (e) {
      alert(e?.response?.data?.message || 'Failed to create reservation');
    } finally {
      setReserveBusyId(null);
    }
  };

  const handleUseMyLocation = async () => {
    await getHighAccuracy({ enableHighAccuracy: true, timeout: 10000, maximumAge: 0 });
  };

  const onAreaChange = async (val) => {
    setAreaQuery(val);
    if (val.trim().length < 3) { setAreaSuggestions([]); return; }
    setAreaLoading(true);
    const items = await fetchAreaSuggestions(val);
    setAreaSuggestions(items);
    setAreaLoading(false);
  };

  const handleMedicineChange = (e) => {
    setMedicine(e.target.value);
  };

  const selectSuggestion = (suggestion) => {
    setMedicine(suggestion.name);
    setShowSuggestions(false);
    // Optionally trigger search immediately
    // runSearch();
  };

  const handleMedicineKeyDown = (e) => {
    if (e.key === 'Escape') {
      setShowSuggestions(false);
    }
  };

  return (
    <div className="dashboard-content" style={{ padding: 16 }}>
      <section className="quick-actions" style={{ marginTop: 16 }}>
        <h3>Medicine Search</h3>
        <div className="db-card" style={{ padding: 16 }}>
          {!hasLocation && (
            <div style={{ marginBottom: 12 }}>
              <button className="welcome-action outline" onClick={handleUseMyLocation} disabled={!geoSupported}><MapPin size={16}/> {geoSupported ? 'Use My Location' : 'Geolocation not supported'}</button>
              {(!geoSupported) && <div style={{ fontSize: 12, color: '#6b7280', marginTop: 6 }}>Enter your area (e.g., Koramangala)</div>}
              <input className="qa-input" placeholder="Type locality, area, city..." value={areaQuery} onChange={(e)=> onAreaChange(e.target.value)} />
              {areaLoading && <div style={{ fontSize: 12, color: '#6b7280', marginTop: 6 }}>Searching...</div>}
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
          )}

          {(hasLocation || useDemoLocation) && (
            <div style={{ marginBottom: 8, fontSize: 12, color: '#6b7280' }}>
              Search coordinates: {useDemoLocation ? '12.882625, 77.583950 (Demo Location)' : `${lat}, ${lon}`} {!useDemoLocation && typeof accuracy === 'number' ? `(accuracy: ${Math.round(accuracy)} m)` : ''} {!useDemoLocation && source ? ` | Source: ${source}` : ''}
            </div>
          )}

          <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
            <div style={{ position: 'relative', flex: 1 }}>
              <input
                className="qa-input"
                placeholder="e.g., Paracetamol"
                value={medicine}
                onChange={handleMedicineChange}
                onKeyDown={handleMedicineKeyDown}
                onFocus={() => medicine.length >= 1 && setShowSuggestions(true)}
                onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
              />
              {suggestionsLoading && (
                <div style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', fontSize: '12px', color: '#6b7280' }}>
                  Loading...
                </div>
              )}
              {showSuggestions && suggestions.length > 0 && (
                <div style={{
                  position: 'absolute',
                  top: '100%',
                  left: 0,
                  right: 0,
                  background: 'white',
                  border: '1px solid #e1e5e9',
                  borderRadius: '8px',
                  boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
                  zIndex: 1000,
                  maxHeight: '200px',
                  overflowY: 'auto'
                }}>
                  {suggestions.map((suggestion, index) => (
                    <div
                      key={index}
                      style={{
                        padding: '8px 12px',
                        cursor: 'pointer',
                        borderBottom: index < suggestions.length - 1 ? '1px solid #f3f4f6' : 'none',
                        background: 'white',
                        hover: { background: '#f9fafb' }
                      }}
                      onMouseDown={() => selectSuggestion(suggestion)}
                    >
                      <div style={{ fontWeight: '500' }}>{suggestion.name}</div>
                      {suggestion.generic_name && suggestion.generic_name !== suggestion.name && (
                        <div style={{ fontSize: '12px', color: '#6b7280' }}>{suggestion.generic_name}</div>
                      )}
                    </div>
                  ))}
                </div>
              )}
              {showSuggestions && suggestions.length === 0 && medicine.length >= 1 && !suggestionsLoading && (
                <div style={{
                  position: 'absolute',
                  top: '100%',
                  left: 0,
                  right: 0,
                  background: 'white',
                  border: '1px solid #e1e5e9',
                  borderRadius: '8px',
                  boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
                  zIndex: 1000,
                  padding: '12px',
                  textAlign: 'center',
                  color: '#6b7280'
                }}>
                  No medicines found
                </div>
              )}
            </div>
            <button className="welcome-action" onClick={runSearch} disabled={search.loading}><Search size={16}/> {search.loading ? 'Searching...' : 'Search'}</button>
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap: 8, marginBottom: 8 }}>
            <input className="qa-input" type="number" min={1} max={20} step={1} placeholder="Radius (km)" value={radiusKm} onChange={(e)=> setRadiusKm(Number(e.target.value))} />
          </div>

          <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <input
              type="checkbox"
              checked={useDemoLocation}
              onChange={(e) => setUseDemoLocation(e.target.checked)}
            />
            Use Demo Location (JP Nagar, Bengaluru)
          </label>

          {search.error && <div style={{ color:'#b00020', fontSize:13, marginTop:6 }}>{search.error}</div>}
          {search.results.length > 0 && (
            <div style={{ marginTop: 12, display: 'grid', gap: 10 }}>
              {search.results.map((r, idx) => (
                <div key={(r.pharmacy_id||'ext')+idx} className="db-card" style={{ padding: 12 }}>
                  <div style={{ display:'flex', justifyContent:'space-between' }}>
                    <strong>{r.name}</strong>
                    <span title={r.demo ? 'Demo Pharmacy' : r.verified ? 'Verified' : 'Unverified'}>{r.demo ? 'Demo' : r.verified ? 'Verified' : 'Unverified'}</span>
                  </div>
                  <div style={{ fontSize: 13, color:'#6b7280' }}>
                    {Number.isFinite(r.distance_m) ? `${Math.round(r.distance_m)} m` : ''}
                    {r.demo ? ' | Demo Pharmacy' : r.verified ? ' | Verified' : ' | Unverified'}
                  </div>
                  <div style={{ fontSize: 12, color:'#6b7280', marginTop: 4 }}>
                    {r.address?.street ? `${r.address.street}, ` : ''}{r.address?.city || ''} {r.address?.postcode || ''}
                  </div>
                  {r.stock && (
                    <div style={{ marginTop: 8, fontSize: 13, color: '#374151' }}>
                      <strong>{r.demo ? 'Demo Medicine Stock:' : 'Medicine Stock:'}</strong>{' '}
                      {r.stock.quantity ?? 0} tablets
                      {' | '}
                      <strong>Unit Price:</strong>{' '}
                      ₹{Number(r.stock.unitPrice ?? 0).toFixed(2)}
                      {r.demo && (
                        <div style={{ fontSize: 11, color: '#6b7280', marginTop: 4 }}>
                          Demonstration inventory only — not verified real-world availability.
                        </div>
                      )}
                    </div>
                  )}
                  {r.verified && r.pharmacy_id && (
                    <div style={{ marginTop: 8, display:'flex', gap:8 }}>
                      {r.stock?.quantity > 0 && r.stock?.medicine && (
                        <button className="welcome-action" onClick={() => handleReserve(r)} disabled={reserveBusyId === r.pharmacy_id}>
                          {reserveBusyId === r.pharmacy_id ? 'Reserving...' : 'Reserve for Pickup'}
                        </button>
                      )}
                      <button className="welcome-action outline" onClick={() => openDetail(r)}>Details</button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
      {/* Details handled by /pharmacy/:id page */}
    </div>
  );
}

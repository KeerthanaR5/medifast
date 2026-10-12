import React, { useEffect, useMemo, useRef, useState } from 'react';
import api from '../services/api';
import { useNavigate } from 'react-router-dom';
import MapPicker from '../components/common/MapPicker';
import { mapsAPI } from '../services/api';

export default function PharmacyRegister({ onLogout }) {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    name: '',
    licenseNumber: '',
    contactPhone: '',
    contactEmail: '',
    fullAddress: '', // autocomplete input (Step 2)
    finalAddress: '', // confirmed display address (after map confirm)
    lat: '',
    lon: ''
  });
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [mapOpen, setMapOpen] = useState(false);
  const [mapInit, setMapInit] = useState({ lat: 12.9716, lon: 77.5946 });
  const [addrSuggestions, setAddrSuggestions] = useState([]);
  const [addrLoading, setAddrLoading] = useState(false);
  const debTimer = useRef(null);
  const [locationConfirmed, setLocationConfirmed] = useState(false);
  const [isManual, setIsManual] = useState(null); // null=unknown, false=autocomplete, true=manual
  const [manualArea, setManualArea] = useState('');
  const [areaFindLoading, setAreaFindLoading] = useState(false);

  // Guard: if owner already has a pharmacy, redirect to dashboard
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const resp = await api.get('/pharmacies/mine');
        if (mounted && resp?.data?.success && resp.data.data?._id) {
          navigate('/pharmacy/dashboard', { replace: true });
        }
      } catch (e) {
        // 404 means no pharmacy yet; allow registration
      }
    })();
    return () => { mounted = false; };
  }, [navigate]);

  const onChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const licenseOk = useMemo(() => {
    const a = /^(?:[A-Z]{2,3}-?PH-?\d{4,})$/i.test(form.licenseNumber.trim());
    const b = /^[A-Z0-9-]{5,}$/i.test(form.licenseNumber.trim());
    return a || b;
  }, [form.licenseNumber]);

  const canSubmit = useMemo(() => (
    form.name.trim() &&
    licenseOk &&
    form.finalAddress.trim() &&
    Number.isFinite(parseFloat(form.lat)) &&
    Number.isFinite(parseFloat(form.lon))
  ), [form, licenseOk]);

  // Removed old locateOnMap; geocoding happens via suggestion select or manual Show Map

  const onConfirmLocation = (pos) => {
    setForm(f => ({ ...f, lat: String(pos.lat), lon: String(pos.lon) }));
    setIsManual(true);
    setLocationConfirmed(true);
    setMapOpen(false);
  };

  const findManualArea = async () => {
    try {
      setAreaFindLoading(true);
      const q = manualArea?.trim(); if (!q) return;
      const geo = await mapsAPI.olaGeocode({ address: q, language: 'en' });
      // Try both response formats: results array or geocodingResults
      const results = geo?.results || geo?.data?.geocodingResults || [];
      const g = results?.[0]?.geometry?.location;
      if (g && Number.isFinite(g.lat) && Number.isFinite(g.lng)) {
        setMapInit({ lat: g.lat, lon: g.lng });
        // Also reflect in form state so any map driven by form coords reacts
        setForm(f => ({ ...f, lat: String(g.lat), lon: String(g.lng) }));
      } else {
        alert('Could not find coordinates for this location. Please try a different address or use the map manually.');
      }
    } finally { setAreaFindLoading(false); }
  };

  // Debounced Ola autocomplete on fullAddress input
  useEffect(() => {
    const q = form.fullAddress.trim();
    if (debTimer.current) clearTimeout(debTimer.current);
    if (q.length < 3) { setAddrSuggestions([]); return; }
    debTimer.current = setTimeout(async () => {
      try {
        setAddrLoading(true);
        const loc = (Number.isFinite(parseFloat(form.lat)) && Number.isFinite(parseFloat(form.lon))) ? `${form.lat},${form.lon}` : undefined;
        const res = await mapsAPI.olaAutocomplete({ input: q, location: loc, language: 'en' });
        const preds = res?.data?.predictions || [];
        setAddrSuggestions(preds);
      } catch {
        setAddrSuggestions([]);
      } finally { setAddrLoading(false); }
    }, 350);
    return () => { if (debTimer.current) clearTimeout(debTimer.current); };
  }, [form.fullAddress, form.lat, form.lon]);

  const applySuggestion = (p) => {
    try {
      const desc = p?.description || '';
      const lat = p?.geometry?.location?.lat;
      const lon = p?.geometry?.location?.lng;
      setForm(f => ({ ...f, fullAddress: desc, finalAddress: desc, lat: lat!=null?String(lat):f.lat, lon: lon!=null?String(lon):f.lon }));
      if (Number.isFinite(lat) && Number.isFinite(lon)) {
        setMapInit({ lat, lon });
      }
      setLocationConfirmed(false);
      setIsManual(false);
      setAddrSuggestions([]);
      setShowDetectedMap(true);
    } catch { /* ignore */ }
  };

  const [showDetectedMap, setShowDetectedMap] = useState(false);

  const onSubmit = async (e) => {
    e.preventDefault(); setLoading(true); setError('');
    try {
      const payload = {
        pharmacyName: form.name.trim(),
        licenseNumber: form.licenseNumber.trim(),
        address: form.finalAddress.trim(),
        // Preferred: GeoJSON location
        location: { type: 'Point', coordinates: [Number(form.lon), Number(form.lat)] },
        // Back-compat fields (can be removed later)
        lat: Number(form.lat),
        lng: Number(form.lon),
        isManual: Boolean(isManual)
      };
      // Client-side guard: require coords and confirmation if using Ola
      const coordsOk = Number.isFinite(payload.lat) && Number.isFinite(payload.lng);
      if (!coordsOk) {
        setError('Please select and confirm a valid location.');
        setLoading(false);
        return;
      }
      if (!payload.address || !payload.address.trim()) {
        setError('Please provide a complete address.');
        setLoading(false);
        return;
      }
      if (isManual === false && !locationConfirmed) {
        setError('Please confirm the selected location or use manual fallback.');
        setLoading(false);
        return;
      }
      const res = await api.post('/pharmacies/register', payload);
      if (res.data?.success) {
        alert('Pharmacy submitted. Pending verification or auto-match.');
        navigate('/pharmacy/dashboard');
      }
    } catch (e2) {
      const msg = e2?.response?.data?.message || 'Registration failed';
      setError(msg);
      if (e2?.response?.status === 409) {
        // Already linked or near-duplicate; send owner to dashboard
        setTimeout(() => navigate('/pharmacy/dashboard', { replace: true }), 1000);
      }
    } finally { setLoading(false); }
  };

  // Handlers for detected vs manual confirmation
  const onConfirmDetected = (pos) => {
    setForm(f => ({
      ...f,
      lat: String(pos.lat),
      lon: String(pos.lon),
      finalAddress: f.finalAddress || f.fullAddress // Use existing finalAddress or fallback to fullAddress
    }));
    setIsManual(false);
    setLocationConfirmed(true);
  };

  return (
    <div className="dashboard-content" style={{ padding: 16 }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
        <h2>Register Your Pharmacy</h2>
        {onLogout && (
          <button className="welcome-action outline" onClick={onLogout}>Logout</button>
        )}
      </div>
      <div className="db-card" style={{ padding: 16, maxWidth: 720 }}>
        {error && <div style={{ color:'#b00020', marginBottom: 8 }}>{error}</div>}
        {step === 1 && (
          <div style={{ display:'grid', gap: 10 }}>
            <h3>Step 1 — Basic Details</h3>
            <input className="qa-input" name="name" placeholder="Pharmacy Name" value={form.name} onChange={onChange} required />
            <input className="qa-input" name="contactPhone" placeholder="Contact Phone (optional)" value={form.contactPhone} onChange={onChange} />
            <input className="qa-input" name="contactEmail" placeholder="Contact Email (optional)" value={form.contactEmail} onChange={onChange} />
            <input className="qa-input" name="licenseNumber" placeholder="License Number" value={form.licenseNumber} onChange={onChange} required />
            {!licenseOk && form.licenseNumber && (
              <div style={{ fontSize: 12, color: '#b00020' }}>License format looks unusual. Example: KA-PH-123456</div>
            )}
            <div style={{ display:'flex', justifyContent:'flex-end' }}>
              <button className="welcome-action" onClick={() => setStep(2)}>Next →</button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div style={{ display:'grid', gap: 12 }}>
            <h3>Step 2 — Location & Map</h3>
            <label>Enter your pharmacy address</label>
            <textarea className="qa-input" name="fullAddress" placeholder="Start typing address…" rows={2} value={form.fullAddress} onChange={onChange} />
            {addrLoading && <div style={{ fontSize: 12, color: '#6b7280' }}>Searching…</div>}
            {addrSuggestions.length > 0 && (
              <div className="db-card" style={{ padding: 8 }}>
                {addrSuggestions.map((p, i) => (
                  <div key={i} style={{ padding: '6px 8px', cursor: 'pointer' }} onClick={() => applySuggestion(p)}>
                    {p.description}
                  </div>
                ))}
              </div>
            )}
            <div>
              <button type="button" className="welcome-action outline" onClick={() => setMapOpen(true)} style={{ padding: 0, background: 'transparent', border: 'none', color: '#1f3a47', textDecoration: 'underline' }}>Can’t find your location? Mark on map manually</button>
            </div>

            {showDetectedMap && Number.isFinite(parseFloat(form.lat)) && Number.isFinite(parseFloat(form.lon)) && (
              <div className="db-card" style={{ padding: 8 }}>
                <div style={{ marginBottom: 6 }}>✅ Location detected</div>
                <MapPicker key={`det-${form.lat},${form.lon}`} initial={{ lat: Number(form.lat), lon: Number(form.lon) }} onConfirm={onConfirmDetected} onCancel={() => setShowDetectedMap(false)} />
                <div style={{ fontSize:12, color:'#6b7280' }}>📍 Drag the pin to adjust your exact pharmacy location.</div>
              </div>
            )}

            {mapOpen && (
              <div className="db-card" style={{ padding: 8, display:'grid', gap:8 }}>
                <div style={{ display:'grid', gap:6 }}>
                  <label style={{ fontSize:13 }}>Nearest area / locality</label>
                  <div style={{ display:'grid', gridTemplateColumns:'1fr 120px', gap:8 }}>
                    <input className="qa-input" placeholder="Locality, City, Pincode" value={manualArea} onChange={(e)=> setManualArea(e.target.value)} />
                    <button type="button" className="welcome-action outline" disabled={areaFindLoading} onClick={findManualArea}>{areaFindLoading ? 'Finding…' : 'Show Map'}</button>
                  </div>
                </div>
                <MapPicker key={`man-${mapInit.lat},${mapInit.lon}`} initial={mapInit} onConfirm={onConfirmLocation} onCancel={() => setMapOpen(false)} />
                <div style={{ fontSize:12, color:'#6b7280' }}>📍 Drag the pin to adjust, then Confirm.</div>
              </div>
            )}

            {locationConfirmed && (
              <div style={{ display:'grid', gap:8 }}>
                <label>Enter your complete pharmacy address exactly as it should appear to customers:</label>
                <textarea className="qa-input" rows={3} value={form.finalAddress} onChange={(e)=> setForm(f=>({ ...f, finalAddress: e.target.value }))} />
                <div style={{ display:'flex', justifyContent:'flex-end' }}>
                  <button className="welcome-action" onClick={() => setStep(3)} disabled={!form.finalAddress.trim()}>Continue →</button>
                </div>
              </div>
            )}
          </div>
        )}

        {step === 3 && (
          <div style={{ display:'grid', gap: 12 }}>
            <h3>Step 3 — Review & Submit</h3>
            <div className="db-card" style={{ padding: 12 }}>
              <div><b>Name:</b> {form.name}</div>
              <div><b>License:</b> {form.licenseNumber}</div>
              {form.contactPhone && <div><b>Phone:</b> {form.contactPhone}</div>}
              {form.contactEmail && <div><b>Email:</b> {form.contactEmail}</div>}
              <div><b>Address:</b> {form.finalAddress}</div>
              <div><b>Coordinates:</b> {Number(form.lat).toFixed(6)}, {Number(form.lon).toFixed(6)} {isManual ? '(manual)' : '(autocomplete)'}
              </div>
              {Number.isFinite(parseFloat(form.lat)) && Number.isFinite(parseFloat(form.lon)) && (
                <div style={{ marginTop: 8 }}>
                  <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 4 }}>Map preview</div>
                  <div style={{ height: 160, borderRadius: 8, overflow: 'hidden', border: '1px solid #e5e7eb' }}>
                    <iframe
                      title="map-preview-review"
                      src={`https://www.openstreetmap.org/export/embed.html?bbox=${encodeURIComponent(`${Number(form.lon)-0.003},${Number(form.lat)-0.003},${Number(form.lon)+0.003},${Number(form.lat)+0.003}`)}&layer=mapnik&marker=${encodeURIComponent(`${Number(form.lat)},${Number(form.lon)}`)}&zoom=16`}
                      style={{ width: '100%', height: '100%', border: '0' }}
                      loading="lazy"
                      referrerPolicy="no-referrer-when-downgrade"
                    />
                  </div>
                </div>
              )}
            </div>
            <form onSubmit={onSubmit}>
              <div style={{ display:'flex', justifyContent:'space-between' }}>
                <button type="button" className="welcome-action outline" onClick={() => setStep(2)}>← Back</button>
                <button className="welcome-action" type="submit" disabled={loading || !canSubmit}>{loading ? 'Submitting…' : 'Submit'}</button>
              </div>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}

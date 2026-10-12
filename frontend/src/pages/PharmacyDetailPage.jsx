import React, { useEffect, useRef, useState } from 'react';
import { useParams, useLocation } from 'react-router-dom';
import api, { pharmacyAPI } from '../services/api';

export default function PharmacyDetailPage() {
  const { id } = useParams();
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  const medicine = params.get('medicine') || '';
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [uploading, setUploading] = useState(false);
  const [reserveQty, setReserveQty] = useState(1);
  const [reserveBusy, setReserveBusy] = useState(false);
  const fileRef = useRef(null);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        setLoading(true); setError('');
        const lat = parseFloat(localStorage.getItem('last_lat'));
        const lon = parseFloat(localStorage.getItem('last_lon'));
        const resp = await pharmacyAPI.getPharmacyDetail(id, { lat, lon, medicine });
        if (!active) return;
        setData(resp?.data || null);
      } catch (e) {
        if (!active) return;
        setError(e?.response?.data?.message || 'Failed to load pharmacy details');
      } finally { if (active) setLoading(false); }
    })();
    return () => { active = false; };
  }, [id, medicine]);

  if (loading) return <div style={{ padding: 16 }}>Loading…</div>;
  if (error) return <div style={{ padding: 16, color: '#dc2626' }}>{error}</div>;
  if (!data) return <div style={{ padding: 16 }}>No data</div>;

  const ph = data.pharmacy || {};
  const stock = data.stock || null;
  const sampleStocks = data.sampleStocks || [];

  const onPickFile = () => {
    if (fileRef.current) fileRef.current.click();
  };

  const onReserve = async () => {
    if (!stock || !ph?._id) return;
    const max = Number(stock.quantity) || 0;
    const qty = Number(reserveQty);
    if (!Number.isSafeInteger(qty) || qty <= 0 || qty > max) {
      alert(`Please enter a whole-number quantity (1 - ${max}).`);
      return;
    }
    try {
      setReserveBusy(true);
      const body = { pharmacyId: ph._id, quantity: qty };
      if (stock.medicine?._id || typeof stock.medicine === 'string') {
        body.medicineId = stock.medicine._id || stock.medicine;
      } else if (stock.medicineName) {
        body.medicineName = stock.medicineName;
      } else if (medicine) {
        body.medicineName = medicine;
      }
      await api.post('/reservations', body);
      alert('Reservation created successfully! You can track it in My Reservations.');
    } catch (e) {
      alert(e?.response?.data?.message || 'Failed to create reservation');
    } finally { setReserveBusy(false); }
  };
  const onFileChange = (e) => {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    setUploading(true);
    // Simulate upload/processing delay (demo only)
    setTimeout(() => {
      setUploading(false);
      e.target.value = '';
      alert('Prescription Uploaded Successfully!');
    }, 1200);
  };

  return (
    <div style={{ padding: 16 }}>
      <h2>{ph.name}</h2>
      <div style={{ color: '#6b7280', marginBottom: 10 }}>
        {ph.verified ? 'Verified Pharmacy' : 'Unverified'}
        {Number.isFinite(ph.distance_m) ? ` • ${Math.round(ph.distance_m)} m away` : ''}
      </div>
      <div className="db-card" style={{ padding: 12, marginBottom: 12 }}>
        <div><b>Address:</b> {ph.address?.street ? `${ph.address.street}, ` : ''}{ph.address?.city || ''} {ph.address?.postcode || ''}</div>
        <div><b>Phone:</b> {ph.contact_info?.phone || '-'}</div>
        <div><b>Email:</b> {ph.contact_info?.email || '-'}</div>
        <div><b>Website:</b> {ph.contact_info?.website || '-'}</div>
        <div><b>Hours:</b> {ph.opening_hours ? Object.entries(ph.opening_hours).map(([d,h])=>`${d}:${h}`).join(' | ') : '-'}</div>
      </div>
      <div className="db-card" style={{ padding: 12 }}>
        <h3>Medicine Availability</h3>
        {stock ? (
          <div>
            <div><b>Medicine:</b> {stock.medicineName || 'Linked medicine'}</div>
            <div><b>Quantity:</b> {stock.quantity ?? '-'}</div>
            <div><b>Price:</b> {stock.unitPrice ?? '-'}</div>
            <div><b>Last Updated:</b> {stock.lastUpdated ? new Date(stock.lastUpdated).toLocaleString() : '-'}</div>
            <div style={{ fontSize: '12px', color: '#6b7280', marginTop: 8, marginBottom: 8 }}>
              💊 Reserve now and pick up from this pharmacy location
            </div>
            <div style={{ display:'flex', gap:8, alignItems:'center', marginTop: 10 }}>
              <input type="number" min={1} max={Number(stock.quantity)||1} step={1} value={reserveQty}
                     onChange={(e)=> setReserveQty(Number(e.target.value))}
                     className="qa-input" style={{ width: 90 }} />
              <button className="welcome-action" onClick={onReserve} disabled={reserveBusy || (Number(stock.quantity)||0)===0}>
                {reserveBusy ? 'Reserving…' : 'Reserve for Pickup'}
              </button>
            </div>
          </div>
        ) : (
          <div style={{ color: '#6b7280' }}>No specific medicine selected.</div>
        )}

        {!stock && sampleStocks.length > 0 && (
          <div style={{ marginTop: 8 }}>
            <ul>
              {sampleStocks.map(s => (
                <li key={s._id}>{s.medicineName || 'Linked medicine'} — Qty: {s.quantity}{s.unit ? ` ${s.unit}` : ''}</li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {ph.verified && (
        <div className="db-card" style={{ padding: 12, marginTop: 12 }}>
          <h3>Upload Prescription</h3>
          <p style={{ color: '#6b7280', fontSize: 13, marginTop: 4 }}>Attach a photo of your prescription to share with this pharmacy.</p>
          <div style={{ marginTop: 8 }}>
            <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={onFileChange} />
            <button className="welcome-action" onClick={onPickFile} disabled={uploading}>
              {uploading ? 'Uploading…' : 'Upload Prescription'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

import React, { useEffect, useMemo, useState } from 'react';
import api, { pharmacyAPI } from '../../services/api';

export default function PharmacyDetail({
  open,
  pharmacyId,
  userLat,
  userLon,
  medicineQuery,
  onClose
}) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [data, setData] = useState(null);
  const [reserveQty, setReserveQty] = useState('1');
  const [reserveBusy, setReserveBusy] = useState(false);
  const [selectedStockId, setSelectedStockId] = useState(null);

  useEffect(() => {
    let active = true;
    async function load() {
      if (!open || !pharmacyId) return;
      setLoading(true); setError('');
      try {
        const resp = await pharmacyAPI.getPharmacyDetail(pharmacyId, {
          lat: userLat,
          lon: userLon,
          medicine: medicineQuery
        });
        if (!active) return;
        setData(resp?.data || null);
        // Preselect stock (searched medicine if present; else first sample)
        const st = resp?.data?.stock;
        if (st?._id) {
          setSelectedStockId(st._id);
        } else if (Array.isArray(resp?.data?.sampleStocks) && resp.data.sampleStocks.length > 0) {
          setSelectedStockId(resp.data.sampleStocks[0]._id);
        } else {
          setSelectedStockId(null);
        }
      } catch (e) {
        if (!active) return;
        setError(e?.response?.data?.message || 'Failed to load details');
      } finally {
        if (active) setLoading(false);
      }
    }
    load();
    return () => { active = false; };
  }, [open, pharmacyId, userLat, userLon, medicineQuery]);

  const pharmacy = data?.pharmacy || {};
  const stock = data?.stock || null;
  const sampleStocks = data?.sampleStocks || [];

  const selectedStock = useMemo(() => {
    if (!selectedStockId) return null;
    if (stock && stock._id === selectedStockId) return stock;
    return sampleStocks.find(s => s._id === selectedStockId) || null;
  }, [selectedStockId, stock, sampleStocks]);

  async function onReserve() {
    try {
      if (!pharmacyId || !selectedStock) return;
      const qty = Number(reserveQty);
      if (!Number.isSafeInteger(qty) || qty <= 0) { alert('Enter a positive whole-number quantity'); return; }
      if (selectedStock.quantity != null && qty > selectedStock.quantity) { alert('Quantity exceeds available stock'); return; }
      setReserveBusy(true);
      const payload = {
        pharmacyId,
      };
      if (selectedStock.medicine) payload.medicineId = selectedStock.medicine;
      else if (selectedStock.medicineName) payload.medicineName = selectedStock.medicineName;
      else { alert('No medicine identifier found for reservation'); setReserveBusy(false); return; }
      payload.quantity = qty;
      await api.post('/reservations', payload);
      alert('Reservation created. Check My Reservations page.');
      onClose?.();
    } catch (e) {
      alert(e?.response?.data?.message || e?.message || 'Failed to create reservation');
    } finally {
      setReserveBusy(false);
    }
  }

  if (!open) return null;

  return (
    <div style={overlayStyle} onClick={(e) => { if (e.target === e.currentTarget) onClose?.(); }}>
      <div style={modalStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ margin: 0 }}>Pharmacy Details</h3>
          <button onClick={() => onClose?.()} style={closeBtn}>✕</button>
        </div>
        {loading && <div style={{ padding: 12 }}>Loading…</div>}
        {error && <div style={{ color: '#dc2626', padding: 12 }}>{error}</div>}
        {!loading && !error && (
          <div style={{ display: 'grid', gap: 12 }}>
            <section className="db-card" style={{ padding: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <div>
                  <h4 style={{ margin: '0 0 4px 0' }}>{pharmacy.name}</h4>
                  <div style={{ fontSize: 13, color: '#6b7280' }}>
                    {pharmacy.verified ? 'Verified Pharmacy' : 'Unverified'}
                    {Number.isFinite(pharmacy.distance_m) ? ` • ${Math.round(pharmacy.distance_m)} m away` : ''}
                  </div>
                </div>
              </div>
              <div style={{ marginTop: 8, fontSize: 14 }}>
                <div>
                  <b>Address:</b> {pharmacy.address?.street ? `${pharmacy.address.street}, ` : ''}{pharmacy.address?.city || ''} {pharmacy.address?.postcode || ''}
                </div>
                <div><b>Phone:</b> {pharmacy.contact_info?.phone || '-'}</div>
                <div><b>Email:</b> {pharmacy.contact_info?.email || '-'}</div>
                <div><b>Website:</b> {pharmacy.contact_info?.website || '-'}</div>
                <div><b>Hours:</b> {pharmacy.opening_hours ? Object.entries(pharmacy.opening_hours).map(([d,h])=>`${d}:${h}`).join(' | ') : '-'}</div>
              </div>
            </section>

            <section className="db-card" style={{ padding: 12 }}>
              <h4 style={{ margin: '0 0 8px 0' }}>Medicine Availability</h4>
              {selectedStock ? (
                <div>
                  <div><b>Medicine:</b> {selectedStock.medicineName || 'Linked medicine'}</div>
                  <div><b>Quantity:</b> {selectedStock.quantity ?? '-'}</div>
                  <div><b>Price:</b> {selectedStock.unitPrice ?? '-'}</div>
                  <div><b>Last Updated:</b> {selectedStock.lastUpdated ? new Date(selectedStock.lastUpdated).toLocaleString() : '-'}</div>
                </div>
              ) : (
                <div style={{ color: '#6b7280' }}>No specific medicine selected. Recent items:</div>
              )}

              {!selectedStock && sampleStocks.length > 0 && (
                <div style={{ marginTop: 8 }}>
                  <select value={selectedStockId || ''} onChange={(e)=> setSelectedStockId(e.target.value)}>
                    {sampleStocks.map(s => (
                      <option key={s._id} value={s._id}>
                        {s.medicineName || 'Linked medicine'} — Qty: {s.quantity}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </section>

            {pharmacy.verified && selectedStock && (
              <section className="db-card" style={{ padding: 12 }}>
                <h4 style={{ margin: '0 0 8px 0' }}>Reserve</h4>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <input type="number" min={1} max={selectedStock.quantity} step={1} value={reserveQty} onChange={(e)=> setReserveQty(e.target.value)} style={{ width: 100 }} />
                  <button className="welcome-action" onClick={onReserve} disabled={reserveBusy}>
                    {reserveBusy ? 'Reserving…' : 'Reserve'}
                  </button>
                </div>
              </section>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

const overlayStyle = {
  position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000
};
const modalStyle = {
  background: 'white', borderRadius: 8, width: 'min(640px, 96vw)', maxHeight: '90vh', overflow: 'auto', boxShadow: '0 10px 30px rgba(0,0,0,0.3)', padding: 12
};
const closeBtn = {
  background: 'transparent', border: 'none', fontSize: 18, cursor: 'pointer'
};

import React, { useEffect, useMemo, useState } from 'react';
import api from '../services/api';
import { MapContainer, TileLayer, Marker } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

import markerIcon2xUrl from 'leaflet/dist/images/marker-icon-2x.png';
import markerIconUrl from 'leaflet/dist/images/marker-icon.png';
import markerShadowUrl from 'leaflet/dist/images/marker-shadow.png';

const DefaultIcon = L.icon({ iconRetinaUrl: markerIcon2xUrl, iconUrl: markerIconUrl, shadowUrl: markerShadowUrl, iconSize: [25, 41], iconAnchor: [12, 41] });
L.Marker.prototype.options.icon = DefaultIcon;

export default function AdminPharmacies() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [detail, setDetail] = useState(null); // { pharmacy, candidate }
  const [detailLoading, setDetailLoading] = useState(false);
  const [approveBusy, setApproveBusy] = useState(false);
  const [rejectBusy, setRejectBusy] = useState(false);
  const [externalIdInput, setExternalIdInput] = useState('');
  const [reviewNote, setReviewNote] = useState('');

  useEffect(() => {
    (async () => {
      setLoading(true); setError('');
      try {
        const res = await api.get('/admin/pharmacies/pending');
        setRows(res.data?.data || []);
      } catch (e) {
        setError(e?.response?.data?.message || 'Failed to load pending pharmacies');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function openDetail(id) {
    setDetailLoading(true); setDetail(null); setExternalIdInput(''); setReviewNote('');
    try {
      const res = await api.get(`/admin/pharmacies/${id}`);
      const d = res.data?.data;
      setDetail(d || null);
      if (d?.pharmacy?.externalId) setExternalIdInput(String(d.pharmacy.externalId));
    } catch (e) {
      alert(e?.response?.data?.message || 'Failed to load details');
    } finally { setDetailLoading(false); }
  }

  async function approve(id) {
    setApproveBusy(true);
    try {
      const body = externalIdInput ? { externalId: externalIdInput.trim() } : {};
      await api.patch(`/admin/pharmacies/${id}/approve`, body);
      setDetail(null);
      // refresh list
      const res = await api.get('/admin/pharmacies/pending');
      setRows(res.data?.data || []);
    } catch (e) {
      alert(e?.response?.data?.message || 'Approve failed');
    } finally { setApproveBusy(false); }
  }

  async function reject(id) {
    if (!window.confirm('Reject this pharmacy?')) return;
    setRejectBusy(true);
    try {
      await api.patch(`/admin/pharmacies/${id}/reject`, { reviewNote });
      setDetail(null);
      // refresh list
      const res = await api.get('/admin/pharmacies/pending');
      setRows(res.data?.data || []);
    } catch (e) {
      alert(e?.response?.data?.message || 'Reject failed');
    } finally { setRejectBusy(false); }
  }

  const table = useMemo(() => (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', fontSize: 14 }}>
        <thead>
          <tr>
            <th align="left">Name</th>
            <th align="left">Address</th>
            <th align="left">Verified</th>
            <th align="right">Score</th>
            <th align="left">ExternalId</th>
            <th align="left">Owner</th>
            <th align="left"></th>
          </tr>
        </thead>
        <tbody>
          {rows.map(r => (
            <tr key={r._id}>
              <td>{r.name}</td>
              <td>{r.addressNormalized}</td>
              <td>{r.verified}</td>
              <td align="right">{r.autoMatchScore?.toFixed?.(3) || ''}</td>
              <td>{r.externalId || ''}</td>
              <td>{r.owner || ''}</td>
              <td><button onClick={() => openDetail(r._id)}>View</button></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  ), [rows]);

  const mapView = (pharmacy, candidate) => {
    const coords = pharmacy?.location?.coordinates;
    const pos = coords && coords.length === 2 ? [coords[1], coords[0]] : [12.9716, 77.5946];
    const candPos = candidate?.coordinates ? [candidate.coordinates.lat, candidate.coordinates.lon] : null;
    return (
      <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 8 }}>
        <div style={{ height: 300, border: '1px solid #e5e7eb', borderRadius: 8, overflow: 'hidden' }}>
          <MapContainer center={pos} zoom={17} style={{ height: '100%', width: '100%' }}>
            <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="&copy; OpenStreetMap contributors" />
            <Marker position={pos} />
            {candPos && <Marker position={candPos} />}
          </MapContainer>
        </div>
      </div>
    );
  };

  return (
    <div className="dashboard-content" style={{ padding: 16 }}>
      <h2>Admin — Pending Pharmacies</h2>
      {loading && <div>Loading…</div>}
      {error && <div style={{ color: '#dc2626' }}>{error}</div>}
      {!loading && !error && (
        <div className="db-card" style={{ padding: 12 }}>
          {table}
        </div>
      )}

      {detail && (
        <div className="db-card" style={{ padding: 12, marginTop: 12 }}>
          <div style={{ display: 'grid', gap: 8 }}>
            <h3 style={{ margin: 0 }}>{detail.pharmacy?.name}</h3>
            <div style={{ color: '#6b7280' }}>{detail.pharmacy?.addressNormalized}</div>
            <div><b>Verified:</b> {detail.pharmacy?.verified} {detail.pharmacy?.externalId ? `(extId ${detail.pharmacy.externalId})` : ''}</div>
            <div><b>License:</b> {detail.pharmacy?.licenseNumber || '—'}</div>
            {detail.candidateLookupUnavailable && (
  <div
    role="alert"
    style={{
      padding: '12px 16px',
      backgroundColor: '#fff7ed',
      border: '1px solid #fdba74',
      borderRadius: '8px',
      color: '#9a3412',
      fontSize: '14px',
      lineHeight: '1.5'
    }}
  >
    <strong>External verification unavailable</strong>
    <div>
      The external pharmacy matching service could not be reached.
      This pharmacy has not been independently verified.
      Verify its license and ownership before approving.
    </div>
  </div>
)}
            {mapView(detail.pharmacy, detail.candidate)}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto auto', gap: 8, alignItems: 'end' }}>
              <div>
                <label style={{ display:'block', fontSize: 12, color:'#6b7280' }}>External Id (optional)</label>
                <input value={externalIdInput} onChange={e=>setExternalIdInput(e.target.value)} placeholder="OSM element id" />
              </div>
              <div>
                <label style={{ display:'block', fontSize: 12, color:'#6b7280' }}>Reject reason</label>
                <input value={reviewNote} onChange={e=>setReviewNote(e.target.value)} placeholder="Reason / comment" />
              </div>
              <button onClick={() => approve(detail.pharmacy._id)} disabled={approveBusy}>Approve</button>
              <button onClick={() => reject(detail.pharmacy._id)} disabled={rejectBusy}>Reject</button>
            </div>
            <div style={{ fontSize: 12, color: '#6b7280' }}>Approving sets verified=manual. Rejecting sets verified=rejected and stores the reason.</div>
          </div>
        </div>
      )}

      {detailLoading && <div>Loading details…</div>}
    </div>
  );
}

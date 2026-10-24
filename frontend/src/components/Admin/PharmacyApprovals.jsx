import React, { useEffect, useState } from 'react';
import api from '../../services/api';

function Candidate({ candidate }) {
  if (!candidate) return <div style={{ color: '#6b7280' }}>No candidate found within 100m.</div>;
  return (
    <div style={{ fontSize: 14, lineHeight: 1.6 }}>
      <div><b>Name:</b> {candidate.name || candidate.pharmacy_name || '—'}</div>
      {candidate.coordinates && (
        <div><b>Coords:</b> {candidate.coordinates.lat?.toFixed(6)}, {candidate.coordinates.lon?.toFixed(6)}</div>
      )}
      {typeof candidate.distance_m === 'number' && (
        <div><b>Distance:</b> ~{Math.round(candidate.distance_m)} m</div>
      )}
      {typeof candidate.score === 'number' && (
        <div><b>Score:</b> {candidate.score.toFixed(3)}</div>
      )}
      {candidate.osm_id && (
        <div><b>OSM ID:</b> {candidate.osm_id}</div>
      )}
    </div>
  );
}

export default function PharmacyApprovals() {
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState([]);
  const [selected, setSelected] = useState(null);
  const [detail, setDetail] = useState(null);
  const [actionBusy, setActionBusy] = useState(false);
  const [error, setError] = useState(null);

  async function loadPending() {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get('/admin/pharmacies/pending');
      setItems(res.data?.data || []);
    } catch (e) {
      setError(e?.response?.data?.message || 'Failed to load pending');
    } finally {
      setLoading(false);
    }
  }

  async function loadDetail(id) {
    setSelected(id);
    setDetail(null);
    try {
      const res = await api.get(`/admin/pharmacies/${id}`);
      setDetail(res.data?.data || null);
    } catch (e) {
      setDetail(null);
    }
  }

  async function approve(id) {
    const confirmed = window.confirm(
      'Have you independently verified this pharmacy license and ownership? Click OK to proceed.'
    );
    if (!confirmed) return;

    const verificationNote = window.prompt(
      'Enter an independent verification note (minimum 20 characters):',
      'Verified physical pharmacy premises and valid state drug retail license.'
    );
    if (!verificationNote || verificationNote.trim().length < 20) {
      alert('A verification note of at least 20 characters is required for approval.');
      return;
    }

    setActionBusy(true);
    try {
      await api.patch(`/admin/pharmacies/${id}/approve`, {
        verificationConfirmed: true,
        verificationNote: verificationNote.trim()
      });
      await loadPending();
      if (selected === id) setDetail(null);
      alert('Pharmacy approved successfully.');
    } catch (e) {
      alert(e?.response?.data?.message || 'Approve failed');
    } finally {
      setActionBusy(false);
    }
  }

  async function reject(id) {
    const reviewNote = window.prompt('Reason for rejection (optional):');
    setActionBusy(true);
    try {
      await api.patch(`/admin/pharmacies/${id}/reject`, { reviewNote: reviewNote || '' });
      await loadPending();
      if (selected === id) setDetail(null);
      alert('Pharmacy rejected.');
    } catch (e) {
      alert(e?.response?.data?.message || 'Reject failed');
    } finally {
      setActionBusy(false);
    }
  }

  useEffect(() => { loadPending(); }, []);

  return (
    <div style={{ padding: 16 }}>
      <h2>Pharmacy Approvals</h2>
      <p style={{ color: '#6b7280' }}>Pending or low-confidence registrations. Approve or reject.
      </p>

      {loading && <div>Loading…</div>}
      {error && <div style={{ color: '#dc2626' }}>{error}</div>}

      {!loading && !error && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <div>
            <h3 style={{ marginTop: 0 }}>Pending</h3>
            {items.length === 0 && <div style={{ color: '#6b7280' }}>No pending items.</div>}
            <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              {items.map((it) => (
                <li key={it._id} style={{ border: '1px solid #e5e7eb', borderRadius: 8, padding: 12, marginBottom: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div style={{ fontWeight: 600 }}>{it.name}</div>
                      <div style={{ color: '#6b7280', fontSize: 12 }}>
                        {it.addressNormalized || '—'}
                      </div>
                      <div style={{ color: '#6b7280', fontSize: 12 }}>
                        verified: {it.verified} {typeof it.autoMatchScore === 'number' ? `(score ${it.autoMatchScore.toFixed(3)})` : ''}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button onClick={() => loadDetail(it._id)} className="btn" style={{ padding: '6px 10px' }}>View</button>
                      <button onClick={() => approve(it._id)} disabled={actionBusy} className="btn" style={{ padding: '6px 10px', background: '#10b981', color: 'white', border: 0, borderRadius: 6 }}>Approve</button>
                      <button onClick={() => reject(it._id)} disabled={actionBusy} className="btn" style={{ padding: '6px 10px', background: '#ef4444', color: 'white', border: 0, borderRadius: 6 }}>Reject</button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h3 style={{ marginTop: 0 }}>Details</h3>
            {!detail && <div style={{ color: '#6b7280' }}>Select a pending pharmacy to view details.</div>}
            {detail && (
              <div style={{ border: '1px solid #e5e7eb', borderRadius: 8, padding: 12 }}>
                <div style={{ marginBottom: 8 }}>
                  <div style={{ fontWeight: 600, fontSize: 16 }}>{detail.pharmacy?.name}</div>
                  <div style={{ color: '#6b7280', fontSize: 12 }}>{detail.pharmacy?.addressNormalized}</div>
                  <div style={{ color: '#6b7280', fontSize: 12 }}>verified: {detail.pharmacy?.verified} {typeof detail.pharmacy?.autoMatchScore === 'number' ? `(score ${detail.pharmacy.autoMatchScore.toFixed(3)})` : ''}</div>
                </div>
                <div>
                  <div style={{ fontWeight: 600, marginBottom: 6 }}>Candidate (Overpass)</div>
                  <Candidate candidate={detail.candidate} />
                </div>
                <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
                  <button onClick={() => approve(detail.pharmacy?._id)} disabled={actionBusy} style={{ padding: '6px 10px', background: '#10b981', color: 'white', border: 0, borderRadius: 6 }}>Approve</button>
                  <button onClick={() => reject(detail.pharmacy?._id)} disabled={actionBusy} style={{ padding: '6px 10px', background: '#ef4444', color: 'white', border: 0, borderRadius: 6 }}>Reject</button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

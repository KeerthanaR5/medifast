import React, { useEffect, useMemo, useState } from 'react';
import api from '../services/api';

function fmt(d) { try { return new Date(d).toLocaleString(); } catch { return '-'; } }
function pad(n){ return n<10?`0${n}`:`${n}`; }
function timeLeft(expiresAt, now){
  try{
    const t = new Date(expiresAt).getTime() - now;
    if (!Number.isFinite(t)) return null;
    if (t <= 0) return 'expired';
    const s = Math.floor(t/1000);
    const h = Math.floor(s/3600), m = Math.floor((s%3600)/60), sec = s%60;
    return h>0?`${h}:${pad(m)}:${pad(sec)}`:`${m}:${pad(sec)}`;
  }catch{ return null; }
}

export default function MyReservations() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState(null);
  const [nowMs, setNowMs] = useState(Date.now());

  async function load() {
    setLoading(true); setError('');
    try {
      const res = await api.get('/reservations');
      setItems(res.data?.data || []);
    } catch (e) {
      setError(e?.response?.data?.message || 'Failed to load reservations');
    } finally { setLoading(false); }
  }

  async function cancel(id) {
    setBusyId(id);
    try {
      await api.patch(`/reservations/${id}/cancel`);
      await load();
    } catch (e) {
      alert(e?.response?.data?.message || 'Failed to cancel reservation');
    } finally { setBusyId(null); }
  }

  useEffect(() => {
    load();
    const p = setInterval(load, 30000);
    const t = setInterval(() => setNowMs(Date.now()), 1000);
    return () => { clearInterval(p); clearInterval(t); };
  }, []);

  const rows = useMemo(() => items.map(r => ({
    ...r,
    _left: r.status === 'pending' ? timeLeft(r.expiresAt, nowMs) : null
  })), [items, nowMs]);

  return (
    <div style={{ padding: 16 }}>
      <h2>My Reservations</h2>
      {loading && <div>Loading…</div>}
      {error && <div style={{ color: '#dc2626' }}>{error}</div>}
      {!loading && !error && (
        <div className="db-card" style={{ padding: 12 }}>
          {items.length === 0 && <div style={{ color: '#6b7280' }}>No reservations yet.</div>}
          {items.length > 0 && (
            <table style={{ width: '100%', fontSize: 14 }}>
              <thead>
                <tr>
                  <th align="left">Pharmacy</th>
                  <th align="left">Medicine</th>
                  <th align="right">Qty</th>
                  <th align="left">Status</th>
                  <th align="left">Reserved</th>
                  <th align="left">Expires</th>
                  <th align="left">Time Left</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {rows.map(r => (
                  <tr key={r._id}>
                    <td>{r.pharmacy?.name || '-'}</td>
                    <td>{r.medicine?.name || '-'}</td>
                    <td align="right">{r.quantity}</td>
                    <td>
                      <span className={`stat-chip ${r.status}`}>{r.status}</span>
                    </td>
                    <td>{fmt(r.reservedAt)}</td>
                    <td>{fmt(r.expiresAt)}</td>
                    <td>{r._left || (r.status==='pending'?'—':'')}</td>
                    <td align="right">
                      {r.status === 'pending' && (
                        <button onClick={() => cancel(r._id)} disabled={busyId === r._id}>Cancel</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}

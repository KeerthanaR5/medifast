import React, { useCallback, useEffect, useState } from 'react';
import api from '../../services/api';
import { pharmacyOwnerAPI } from '../../services/api';
import { useLocationContext } from '../../contexts/LocationContext';
import { Link } from 'react-router-dom';

function fmtDate(d) {
  try { return new Date(d).toLocaleString(); } catch { return '-'; }
}

function parseCsv(text) {
  // Robust CSV/TSV parser: auto-detect delimiter, handle headers
  // Supports: comma, tab, semicolon, pipe
  // Expected columns: medicineName/medicine/name, quantity/qty, unit, unitPrice/price
  const lines = text.split(/\r?\n/).filter(l => l.trim().length);
  if (lines.length === 0) return [];

  // Detect delimiter by counting occurrences
  const delimiters = [',', '\t', ';', '|'];
  let bestDelim = ',';
  let maxCount = 0;
  for (const delim of delimiters) {
    const count = (lines[0].match(new RegExp(`\\${delim}`, 'g')) || []).length;
    if (count > maxCount) {
      maxCount = count;
      bestDelim = delim;
    }
  }

  const clean = (s) => s.replace(/^["\s]+|["\s]+$/g, '').trim();

  // Check if first line looks like header
  const firstLine = lines[0].toLowerCase();
  const headerLike = /\b(medicine|name|qty|quantity|unit|price)\b/.test(firstLine);
  const start = headerLike ? 1 : 0;

  const rows = [];
  for (let i = start; i < lines.length; i++) {
    const cols = lines[i].split(bestDelim).map(clean);
    if (cols.length < 2) continue; // Need at least name and quantity

    // Flexible column mapping
    let medicineName = '', quantity = '', unit = 'unit', unitPrice = '';

    if (cols.length >= 4) {
      [medicineName, quantity, unit, unitPrice] = cols;
    } else if (cols.length === 3) {
      [medicineName, quantity, unit] = cols;
    } else if (cols.length === 2) {
      [medicineName, quantity] = cols;
    }

    // Handle alternative column orders or names
    if (!medicineName && cols.length > 1) {
      // Try to find medicine name in any column
      for (const col of cols) {
        if (col && !/^\d/.test(col) && col.toLowerCase() !== 'unit') {
          medicineName = col;
          break;
        }
      }
    }

    rows.push({ medicineName, quantity, unit, unitPrice });
  }
  return rows;
}

export default function StockManager({ pharmacyId: propPharmacyId }) {
  const { lat, lon, geoSupported, getHighAccuracy } = useLocationContext();

  const [pharmacy, setPharmacy] = useState(null);
  const [pharmacyId, setPharmacyId] = useState(propPharmacyId || null);
  const [stock, setStock] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [form, setForm] = useState({ medicineName: '', quantity: '', unit: 'unit', unitPrice: '' });
  const [saving, setSaving] = useState(false);

  const [csvPreview, setCsvPreview] = useState([]);
  const [csvErrors, setCsvErrors] = useState([]);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkProgress, setBulkProgress] = useState({ done: 0, total: 0 });

  useEffect(() => {
    let cancelled = false;

    async function ensurePharmacy() {
      if (pharmacyId && pharmacy?._id === pharmacyId) return;

      setLoading(true);
      setError(null);

      try {
        if (!pharmacyId) {
          try {
            const res = await api.get('/pharmacies/mine');
            if (cancelled) return;

            const ph = res.data?.data || null;

            if (ph) {
              setPharmacyId(ph._id);
              setPharmacy(ph);
            } else {
              setError('No pharmacy found. Please register your pharmacy first.');
            }
          } catch (e) {
            if (cancelled) return;

            if (e?.response?.status === 404) {
              setError(
                <div>
                  You haven't registered a pharmacy yet. Please <Link to="/pharmacy/register" style={{ color: '#2563eb' }}>register your pharmacy</Link> first.
                </div>
              );
            } else {
              setError(e?.response?.data?.message || 'Failed to load pharmacy information');
            }
          }
        } else if (pharmacy?._id !== pharmacyId) {
          try {
            const res = await api.get(`/pharmacies/${pharmacyId}`);
            if (cancelled) return;

            setPharmacy(res.data?.data || null);
          } catch (e) {
            if (cancelled) return;

            setError(e?.response?.data?.message || 'Failed to load pharmacy details');
          }
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    ensurePharmacy();

    return () => {
      cancelled = true;
    };
  }, [pharmacyId, pharmacy]);
  const refreshStock = useCallback(async () => {
    if (!pharmacyId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await api.get(`/pharmacies/${pharmacyId}/stock`);
      setStock(res.data?.data || []);
    } catch (e) {
      setError(e?.response?.data?.message || 'Failed to load stock');
    } finally {
      setLoading(false);
    }
  }, [pharmacyId]);

  useEffect(() => { if (pharmacyId) refreshStock(); }, [pharmacyId, refreshStock]);

  async function onSaveItem() {
    if (!pharmacyId) return;
    const payload = {
      medicineName: form.medicineName?.trim() || undefined,
      quantity: Number(form.quantity),
      unit: form.unit || 'unit',
      unitPrice: form.unitPrice !== '' ? Number(form.unitPrice) : undefined,
    };
    if (!payload.medicineName || !Number.isSafeInteger(payload.quantity) || payload.quantity < 0) {
      alert('Enter a medicine name and a non-negative whole-number quantity.');
      return;
    }
    setSaving(true);
    try {
      await api.post(`/pharmacies/${pharmacyId}/stock`, payload);
      setForm({ medicineName: '', quantity: '', unit: 'unit', unitPrice: '' });
      await refreshStock();
    } catch (e) {
      alert(e?.response?.data?.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  async function onDeleteItem(id) {
    if (!pharmacyId) return;
    if (!window.confirm('Delete this stock item?')) return;
    try {
      await api.delete(`/pharmacies/${pharmacyId}/stock/${id}`);
      await refreshStock();
    } catch (e) {
      alert(e?.response?.data?.message || 'Delete failed');
    }
  }

  function onCsvFile(e) {
    const f = e.target.files?.[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result || '');
      const rows = parseCsv(text);

      // Validate and clean data
      const errs = [];
      const clean = rows.map((r, idx) => {
        const medicineName = (r.medicineName || '').trim();
        const quantity = r.quantity?.toString().replace(/[^\d.]/g, '') || '';
        const unit = (r.unit || 'unit').trim().toLowerCase();
        const unitPrice = r.unitPrice?.toString().replace(/[^\d.]/g, '') || '';

        const obj = {
          medicineName,
          quantity: quantity ? Number(quantity) : '',
          unit: unit || 'unit',
          unitPrice: unitPrice ? Number(unitPrice) : undefined,
        };

        // Validation
        if (!obj.medicineName) {
          errs.push({ row: idx + 1, error: 'Medicine name is required' });
        }
        if (!Number.isSafeInteger(obj.quantity) || obj.quantity <= 0) {
          errs.push({ row: idx + 1, error: 'Quantity must be a positive whole number' });
        }
        if (obj.unitPrice !== undefined && (!Number.isFinite(obj.unitPrice) || obj.unitPrice < 0)) {
          errs.push({ row: idx + 1, error: 'Unit price must be a non-negative number or empty' });
        }

        return obj;
      }).filter(obj => obj.medicineName || Number.isFinite(obj.quantity)); // Filter out completely empty rows

      setCsvPreview(clean);
      setCsvErrors(errs);
    };
    reader.readAsText(f);
  }

  async function onBulkUpload() {
    if (!pharmacyId) {
      alert('No pharmacy found. Please register your pharmacy first.');
      return;
    }
    if (csvErrors.length > 0) {
      alert('Fix CSV errors before uploading');
      return;
    }
    // Upload in batches to avoid long-running requests/timeouts
    const chunkSize = 500; // increased for better performance with optimized backend
    setBulkBusy(true);
    setBulkProgress({ done: 0, total: csvPreview.length });
    try {
      let totalSuccess = 0;
      let totalFailed = 0;
      const allReports = [];
      for (let i = 0; i < csvPreview.length; i += chunkSize) {
        const chunk = csvPreview.slice(i, i + chunkSize);
        // send chunk to backend
        // backend accepts { rows: [...] }
        const resp = await pharmacyOwnerAPI.bulkUpsertStock(pharmacyId, chunk);
        const summary = resp?.summary || {};
        const report = resp?.report || [];
        totalSuccess += summary.success || 0;
        totalFailed += summary.failed || 0;
        allReports.push(...report.map((r, idx) => ({ chunkIndex: Math.floor(i / chunkSize), rowIndex: i + idx, ...r })));
        setBulkProgress(prev => ({ done: Math.min(prev.total, prev.done + chunk.length), total: prev.total }));
      }

      if (totalFailed > 0) {
        const lines = allReports
          .map((r) => r.ok ? null : `Row ${r.rowIndex + 1}: ${r.error || 'Unknown error'}`)
          .filter(Boolean)
          .slice(0, 50)
          .join('\n');
        alert(`Upload finished with some failures.\nSuccess: ${totalSuccess}\nFailed: ${totalFailed}\n\nFirst errors:\n${lines}`);
        // Keep preview so user can fix failed rows
      } else {
        alert(`Successfully uploaded ${totalSuccess} items`);
        setCsvPreview([]);
        setCsvErrors([]);
      }
      await refreshStock();
    } catch (e) {
      alert(e?.response?.data?.message || e?.message || 'Bulk upload failed');
    } finally {
      setBulkBusy(false);
      setBulkProgress({ done: 0, total: 0 });
    }
  }

  async function updateLocationToCurrent() {
    if (!pharmacyId) return;
    try {
      if (geoSupported && (lat == null || lon == null)) {
        await getHighAccuracy({ enableHighAccuracy: true, timeout: 10000, maximumAge: 0 });
      }
      if (lat == null || lon == null) {
        alert('No current location available. Use the Location card to set it.');
        return;
      }
      await api.put(`/pharmacies/${pharmacyId}/location`, { lat, lon });
      alert('Location updated');
    } catch (e) {
      alert(e?.response?.data?.message || 'Failed to update location');
    }
  }

  return (
    <div style={{ padding: 16 }}>
      <h2>Stock Manager</h2>
      {error && (
        <div style={{ color: '#dc2626', marginBottom: 16, padding: 12, backgroundColor: '#fef2f2', borderRadius: 6 }}>
          {error}
        </div>
      )}
      {!pharmacyId && !error && (
        <div style={{ color: '#6b7280', marginBottom: 8 }}>Loading pharmacy information...</div>
      )}

      {/* Add/Edit form */}
      <div className="db-card" style={{ padding: 12, marginBottom: 16 }}>
        <h3 style={{ marginTop: 0 }}>Add or Update Item</h3>
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr auto', gap: 8, alignItems: 'center' }}>
          <input placeholder="Medicine name" value={form.medicineName} onChange={e=>setForm(f=>({...f, medicineName: e.target.value}))} />
          <input type="number" min="0" step="1" placeholder="Qty" value={form.quantity} onChange={e=>setForm(f=>({...f, quantity: e.target.value}))} />
          <select value={form.unit} onChange={e=>setForm(f=>({...f, unit: e.target.value}))}>
            <option value="unit">unit</option>
            <option value="tabs">tabs</option>
            <option value="caps">caps</option>
            <option value="ml">ml</option>
            <option value="bottle">bottle</option>
            <option value="pack">pack</option>
          </select>
          <input type="number" placeholder="Unit price" value={form.unitPrice} onChange={e=>setForm(f=>({...f, unitPrice: e.target.value}))} />
          <button onClick={onSaveItem} disabled={saving || !pharmacyId}>Save</button>
        </div>
      </div>

      {/* CSV Upload */}
      <div className="db-card" style={{ padding: 12, marginBottom: 16 }}>
        <h3 style={{ marginTop: 0 }}>Bulk Upload (CSV/TSV)</h3>
        <div style={{ marginBottom: 8, color: '#6b7280' }}>
          Upload a CSV or TSV file with medicine data. The system will automatically detect the format and match medicines by name.
          <br />
          <strong>Expected columns:</strong> medicineName, quantity, unit (optional), unitPrice (optional)
          <br />
          <strong>Example:</strong>
        </div>
        <div style={{ fontFamily: 'monospace', fontSize: 12, backgroundColor: '#f9fafb', padding: 8, borderRadius: 4, marginBottom: 8 }}>
          medicineName,quantity,unit,unitPrice<br />
          Paracetamol 500mg,100,tabs,5.50<br />
          Ibuprofen 400mg,50,tabs,8.00<br />
          Amoxicillin 500mg,25,caps,12.00
        </div>
        <input type="file" accept=".csv,text/csv,.tsv,text/tab-separated-values" onChange={onCsvFile} />
        {csvErrors.length > 0 && (
          <div style={{ color: '#dc2626', marginTop: 8 }}>
            <b>Errors:</b>
            <ul>
              {csvErrors.map((e, i) => <li key={i}>Row {e.row}: {e.error}</li>)}
            </ul>
          </div>
        )}
        {csvPreview.length > 0 && (
          <div style={{ marginTop: 8 }}>
            <b>Preview ({csvPreview.length} rows)</b>
            <div style={{ maxHeight: 200, overflow: 'auto', border: '1px solid #e5e7eb', borderRadius: 6, padding: 8 }}>
              <table style={{ width: '100%', fontSize: 14 }}>
                <thead>
                  <tr>
                    <th align="left">Medicine Name</th>
                    <th align="right">Quantity</th>
                    <th align="left">Unit</th>
                    <th align="right">Unit Price</th>
                  </tr>
                </thead>
                <tbody>
                  {csvPreview.map((r, i) => (
                    <tr key={i}>
                      <td>{r.medicineName || <span style={{ color: '#dc2626' }}>Missing</span>}</td>
                      <td align="right">{r.quantity || <span style={{ color: '#dc2626' }}>Invalid</span>}</td>
                      <td>{r.unit}</td>
                      <td align="right">{r.unitPrice ?? ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {csvErrors.length === 0 ? (
              <div style={{ color: '#059669', marginTop: 8 }}>
                ✅ Ready to upload. Medicines will be matched automatically.
              </div>
            ) : (
              <div style={{ color: '#dc2626', marginTop: 8 }}>
                ⚠️ Please fix the errors above before uploading.
              </div>
            )}
            <button
              style={{ marginTop: 8 }}
              onClick={onBulkUpload}
              disabled={bulkBusy || !pharmacyId || csvErrors.length > 0}
            >
              {bulkBusy ? `Uploading ${bulkProgress.done}/${bulkProgress.total}` : `Upload ${csvPreview.length} Items`}
            </button>
          </div>
        )}
      </div>

      {/* Stock List */}
      <div className="db-card" style={{ padding: 12 }}>
        <h3 style={{ marginTop: 0 }}>Current Stock</h3>
        {loading && <div>Loading…</div>}
        {error && <div style={{ color: '#dc2626' }}>{error}</div>}
        {!loading && !error && (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', fontSize: 14 }}>
              <thead>
                <tr>
                  <th align="left">Medicine</th>
                  <th align="right">Qty</th>
                  <th align="left">Unit</th>
                  <th align="right">Unit Price</th>
                  <th align="left">Last Updated</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {stock.map(item => (
                  <tr key={item._id}>
                    <td>{item.medicineName}{item.genericName ? ` (${item.genericName})` : ''}</td>
                    <td align="right">{item.quantity}</td>
                    <td>{item.unit}</td>
                    <td align="right">{item.unitPrice}</td>
                    <td>{fmtDate(item.lastUpdated)}</td>
                    <td align="right"><button onClick={() => onDeleteItem(item._id)}>Delete</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Location */}
      <div className="db-card" style={{ padding: 12, marginTop: 16 }}>
        <h3 style={{ marginTop: 0 }}>Pharmacy Location</h3>
        <div style={{ color: '#6b7280' }}>Use your current pin to update the pharmacy's location.</div>
        <div style={{ marginTop: 8 }}>
          <button onClick={updateLocationToCurrent} disabled={!pharmacyId}>Update to my current pin</button>
        </div>
      </div>
    </div>
  );
}

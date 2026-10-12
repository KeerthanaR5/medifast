const Pharmacy = require('../models/Pharmacy');
const Stock = require('../models/Stock');
const Medicine = require('../models/Medicine');
const Reservation = require('../models/Reservation');

function isOwnerOrAdmin(user, pharmacy) {
  if (!user || !pharmacy) return false;
  return String(pharmacy.owner) === String(user._id) || user.role === 'admin';
}

// GET /api/pharmacies/mine -> returns the first pharmacy owned by the requester (if any)
async function getMine(req, res) {
  try {
    const ph = await Pharmacy.findOne({ owner: req.user?._id }).lean();
    if (!ph) return res.status(404).json({ success: false, message: 'No pharmacy owned by this user' });
    res.json({ success: true, data: ph });
  } catch (e) {
    console.error('getMine error', e);
    res.status(500).json({ success: false, message: 'Failed to load pharmacy' });
  }
}

// GET /api/pharmacies/:id -> return pharmacy info (owner or admin only)
async function getPharmacyInfo(req, res) {
  try {
    const ph = await getPharmacyOr403(req, res); if (!ph) return;
    res.json({ success: true, data: ph });
  } catch (e) {
    console.error('getPharmacyInfo error', e);
    res.status(500).json({ success: false, message: 'Failed to load pharmacy info' });
  }
}

async function getPharmacyOr403(req, res) {
  const ph = await Pharmacy.findById(req.params.id);
  if (!ph) {
    res.status(404).json({ success: false, message: 'Pharmacy not found' });
    return null;
  }
  if (!isOwnerOrAdmin(req.user, ph)) {
    res.status(403).json({ success: false, message: 'Not authorized for this pharmacy' });
    return null;
  }
  return ph;
}

// GET /api/pharmacies/:id/stock
async function getStock(req, res) {
  try {
    const ph = await getPharmacyOr403(req, res); if (!ph) return;

    const items = await Stock.find({ pharmacy: ph._id })
      .populate({ path: 'medicine', select: 'name generic_name' })
      .lean();

    const data = items.map(s => ({
      _id: s._id,
      medicineId: s.medicine?._id || null,
      medicineName: s.medicine?.name || s.medicineName || null,
      genericName: s.medicine?.generic_name || null,
      quantity: s.quantity,
      unit: s.unit,
      unitPrice: s.unitPrice,
      lastUpdated: s.lastUpdated
    }));

    // Disable caching to ensure UI sees updates immediately after bulk uploads
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');
    res.json({ success: true, count: data.length, data });
  } catch (e) {
    console.error('getStock error', e);
    res.status(500).json({ success: false, message: 'Failed to get stock' });
  }
}

// POST /api/pharmacies/:id/stock  (create/update single)
// Body: { medicineId? , medicineName?, quantity, unit?, unitPrice }
async function upsertStock(req, res) {
  try {
    const ph = await getPharmacyOr403(req, res); if (!ph) return;
    const { medicineId, medicineName, quantity, unit, unitPrice } = req.body || {};

    if (!medicineId && !medicineName) {
      return res.status(400).json({ success: false, message: 'medicineId or medicineName is required' });
    }
    if (quantity == null || !Number.isSafeInteger(Number(quantity)) || Number(quantity) < 0) {
      return res.status(400).json({ success: false, message: 'quantity must be a non-negative whole number' });
    }

    let filter;
    const update = {
      quantity: Number(quantity),
      unit: unit || 'unit',
      unitPrice: unitPrice != null ? Number(unitPrice) : 0,
      lastUpdated: new Date(),
    };

    if (medicineId) {
      filter = { pharmacy: ph._id, medicine: medicineId };
      update.medicine = medicineId;
      update.medicineName = undefined;
    } else {
      filter = { pharmacy: ph._id, medicineName: medicineName.trim() };
      update.medicine = undefined;
      update.medicineName = medicineName.trim();
    }

    const result = await Stock.findOneAndUpdate(filter, { $set: update }, { upsert: true, new: true, setDefaultsOnInsert: true, runValidators: true });
    res.status(200).json({ success: true, data: { id: result._id } });
  } catch (e) {
    console.error('upsertStock error', e);
    if (e.code === 11000) {
      return res.status(409).json({ success: false, message: 'Duplicate stock entry' });
    }
    res.status(500).json({ success: false, message: 'Failed to upsert stock' });
  }
}

// POST /api/pharmacies/:id/stock/bulk
// Body: { rows: [{ medicineId?, medicineName?, quantity, unit?, unitPrice? }, ...] }
async function bulkUpsertStock(req, res) {
  try {
    const ph = await getPharmacyOr403(req, res); if (!ph) return;
    const rows = Array.isArray(req.body?.rows) ? req.body.rows : [];
    if (rows.length === 0) {
      return res.status(400).json({ success: false, message: 'rows[] is required' });
    }

    console.log(`[bulkUpsertStock] pharmacy=${ph._id} rows_in=${rows.length}`);

    // Pre-process rows and collect medicine names to resolve
    const processedRows = [];
    const medicineNamesToResolve = new Set();
    const report = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      try {
        let medId = row.medicineId;
        let medName = (row.medicineName ?? row.name ?? '').toString().trim();

        const toNumber = (v, def = 0) => {
          if (v == null || v === '') return def;
          const n = Number(String(v).replace(/[^0-9.\-]/g, ''));
          return Number.isFinite(n) ? n : def;
        };
        const qty = toNumber(row.quantity, NaN);

        const unitMap = {
          tab: 'tabs', tabs: 'tabs', tablet: 'tabs', tablets: 'tabs',
          cap: 'caps', caps: 'caps', capsule: 'caps', capsules: 'caps',
          ml: 'ml', milliliter: 'ml', millilitre: 'ml',
          bottle: 'bottle', bottles: 'bottle',
          pack: 'pack', packs: 'pack', pkt: 'pack', packet: 'pack',
          unit: 'unit', units: 'unit'
        };
        const uNorm = String(row.unit || 'unit').toLowerCase().trim();
        const u = unitMap[uNorm] || 'unit';
        const price = toNumber(row.unitPrice, 0);

        if (!medId && !medName) {
          report.push({ ok: false, error: 'Missing medicineId/medicineName', row });
          continue;
        }
        if (!(Number.isSafeInteger(qty) && qty >= 0)) {
          report.push({ ok: false, error: `Quantity must be a non-negative whole number: ${row.quantity}`, row });
          continue;
        }

        if (!medId && medName) {
          medicineNamesToResolve.add(medName);
        }

        processedRows.push({
          index: i,
          medId,
          medName,
          qty,
          u,
          price,
          row
        });
      } catch (err) {
        report.push({ ok: false, error: err.message, row });
      }
    }

    // Batch resolve medicine names
    const medicineMap = new Map();
    if (medicineNamesToResolve.size > 0) {
      const names = Array.from(medicineNamesToResolve);

      // First, try exact matches on name
      const exactMatches = await Medicine.find({
        name: { $in: names.map(n => new RegExp(`^${n.trim()}$`, 'i')) }
      }).lean();
      exactMatches.forEach(med => medicineMap.set(med.name.toLowerCase(), med._id));

      // Then try generic name exact matches for remaining
      const remainingNames = names.filter(n => !medicineMap.has(n.toLowerCase()));
      if (remainingNames.length > 0) {
        const genericMatches = await Medicine.find({
          generic_name: { $in: remainingNames.map(n => new RegExp(`^${n.trim()}$`, 'i')) }
        }).lean();
        genericMatches.forEach(med => {
          if (med.generic_name) {
            medicineMap.set(med.generic_name.toLowerCase(), med._id);
          }
        });
      }

      // Finally, try partial matches for remaining
      const stillRemaining = names.filter(n => !medicineMap.has(n.toLowerCase()));
      if (stillRemaining.length > 0) {
        const partialMatches = await Medicine.find({
          name: { $in: stillRemaining.map(n => new RegExp(n.trim(), 'i')) }
        }).lean();
        partialMatches.forEach(med => {
          if (!medicineMap.has(med.name.toLowerCase())) {
            medicineMap.set(med.name.toLowerCase(), med._id);
          }
        });
      }
    }

    // Prepare bulk operations
    const bulkOps = [];
    processedRows.forEach(({ index, medId, medName, qty, u, price, row }) => {
      let resolvedMedId = medId;
      if (!resolvedMedId && medName) {
        resolvedMedId = medicineMap.get(medName.toLowerCase());
      }

      let filter, update;
      if (resolvedMedId) {
        filter = { pharmacy: ph._id, medicine: resolvedMedId };
        update = { medicine: resolvedMedId, quantity: qty, unit: u, unitPrice: price, lastUpdated: new Date(), medicineName: undefined };
      } else {
        filter = { pharmacy: ph._id, medicineName: medName.trim() };
        update = { medicineName: medName.trim(), quantity: qty, unit: u, unitPrice: price, lastUpdated: new Date(), medicine: undefined };
      }

      bulkOps.push({
        updateOne: {
          filter,
          update: { $set: update },
          upsert: true,
          setDefaultsOnInsert: true
        }
      });

      report.push({ ok: true, ref: resolvedMedId || medName.trim() });
    });

    // Execute bulk write
    if (bulkOps.length > 0) {
      await Stock.bulkWrite(bulkOps, { ordered: false });
    }

    const summary = { total: report.length, success: report.filter(r=>r.ok).length, failed: report.filter(r=>!r.ok).length };
    console.log(`[bulkUpsertStock] pharmacy=${ph._id} total=${summary.total} success=${summary.success} failed=${summary.failed}`);
    res.json({ success: true, summary, report });
  } catch (e) {
    console.error('bulkUpsertStock error', e);
    res.status(500).json({ success: false, message: 'Failed to bulk upsert stock' });
  }
}

// DELETE /api/pharmacies/:id/stock/:stockId
async function deleteStock(req, res) {
  try {
    const ph = await getPharmacyOr403(req, res); if (!ph) return;
    const stock = await Stock.findById(req.params.stockId);
    if (!stock || String(stock.pharmacy) !== String(ph._id)) {
      return res.status(404).json({ success: false, message: 'Stock not found' });
    }
    await stock.deleteOne();
    res.json({ success: true });
  } catch (e) {
    console.error('deleteStock error', e);
    res.status(500).json({ success: false, message: 'Failed to delete stock' });
  }
}

// PUT /api/pharmacies/:id/location  Body: { lat, lon }
async function updateLocation(req, res) {
  try {
    const ph = await getPharmacyOr403(req, res); if (!ph) return;
    const { lat, lon } = req.body || {};
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      return res.status(400).json({ success: false, message: 'lat and lon are required numbers' });
    }
    ph.location = { type: 'Point', coordinates: [Number(lon), Number(lat)] };
    ph.address = ph.address || {};
    ph.address.coordinates = [Number(lon), Number(lat)];
    await ph.save();
    res.json({ success: true });
  } catch (e) {
    console.error('updateLocation error', e);
    res.status(500).json({ success: false, message: 'Failed to update location' });
  }
}

module.exports = { getMine, getPharmacyInfo, getStock, upsertStock, bulkUpsertStock, deleteStock, updateLocation };

// GET /api/pharmacies/mine/dashboard
async function ownerDashboard(req, res) {
  try {
    const ph = await Pharmacy.findOne({ owner: req.user?._id }).lean();
    if (!ph) return res.status(404).json({ success: false, message: 'No pharmacy owned by this user' });

    const pharmacyId = ph._id;

    const [
      totalStockItems,
      distinctMedIds,
      lowStockItems,
      stockIds
    ] = await Promise.all([
      Stock.countDocuments({ pharmacy: pharmacyId }),
      Stock.distinct('medicine', { pharmacy: pharmacyId, medicine: { $ne: null } }),
      Stock.find({ pharmacy: pharmacyId, quantity: { $lte: 5 } })
        .select('medicine medicineName quantity unit')
        .limit(5)
        .populate({ path: 'medicine', select: 'name' })
        .lean(),
      Stock.find({ pharmacy: pharmacyId }).distinct('_id')
    ]);

    const reservationsAgg = await Reservation.aggregate([
      { $match: { stock: { $in: stockIds } } },
      { $group: { _id: '$status', count: { $sum: 1 } } }
    ]);

    const statusCounts = reservationsAgg.reduce((acc, it) => {
      acc[it._id] = it.count; return acc;
    }, { pending: 0, confirmed: 0, picked_up: 0, canceled: 0, expired: 0 });

    const recentReservations = await Reservation.find({ stock: { $in: stockIds } })
      .sort({ createdAt: -1 })
      .limit(10)
      .populate('user', 'fullName email')
      .populate({ path: 'stock', select: 'medicine medicineName quantity unit', populate: { path: 'medicine', select: 'name' } })
      .lean();

    const analytics = {
      totalStockItems,
      totalMedicines: (distinctMedIds?.length || 0),
      lowStockCount: lowStockItems.length,
      reservations: statusCounts
    };

    res.json({
      success: true,
      data: {
        pharmacy: ph,
        stock: {
          lowStock: lowStockItems.map(i => ({
            id: i._id,
            name: i.medicine?.name || i.medicineName,
            quantity: i.quantity,
            unit: i.unit
          }))
        },
        reservations: {
          recent: recentReservations.map(r => ({
            id: r._id,
            user: r.user ? { id: r.user._id, name: r.user.fullName, email: r.user.email } : null,
            item: r.stock ? { name: r.stock.medicine?.name || r.stock.medicineName, quantity: r.stock.quantity, unit: r.stock.unit } : null,
            status: r.status,
            createdAt: r.createdAt
          })),
          counts: statusCounts
        },
        analytics
      }
    });
  } catch (e) {
    console.error('ownerDashboard error', e);
    res.status(500).json({ success: false, message: 'Failed to load dashboard' });
  }
}

// PUT /api/pharmacies/:id/profile
async function updateProfile(req, res) {
  try {
    const ph = await getPharmacyOr403(req, res); if (!ph) return;
    const { name, contact_info, opening_hours, address } = req.body || {};

    if (name != null) ph.name = String(name).trim();
    if (contact_info && typeof contact_info === 'object') {
      ph.contact_info = ph.contact_info || {};
      if (contact_info.phone != null) ph.contact_info.phone = String(contact_info.phone).trim();
      if (contact_info.email != null) ph.contact_info.email = String(contact_info.email).trim();
      if (contact_info.website != null) ph.contact_info.website = String(contact_info.website).trim();
    }
    if (opening_hours && typeof opening_hours === 'object') {
      ph.opening_hours = { ...ph.opening_hours, ...opening_hours };
    }
    if (address && typeof address === 'object') {
      ph.address = { ...ph.address, ...address };
    }

    await ph.save();
    res.json({ success: true, data: ph.toJSON ? ph.toJSON() : ph });
  } catch (e) {
    console.error('updateProfile error', e);
    res.status(500).json({ success: false, message: 'Failed to update profile' });
  }
}

module.exports.ownerDashboard = ownerDashboard;
module.exports.updateProfile = updateProfile;

// GET /api/pharmacies/mine/reservations?status=pending|confirmed|canceled|expired|picked_up|all
async function listMineReservations(req, res) {
  try {
    const ph = await Pharmacy.findOne({ owner: req.user?._id }).lean();
    if (!ph) return res.status(404).json({ success: false, message: 'No pharmacy owned by this user' });
    const status = (req.query.status || 'pending').toLowerCase();
    const stockIds = await Stock.find({ pharmacy: ph._id }).distinct('_id');
    const q = { stock: { $in: stockIds } };
    if (status !== 'all') q.status = status;
    const items = await Reservation.find(q)
      .sort({ createdAt: -1 })
      .limit(50)
      .populate('user', 'fullName email')
      .populate({ path: 'stock', select: 'medicine medicineName quantity unit', populate: { path: 'medicine', select: 'name' } })
      .lean();

    const data = items.map(r => ({
      id: r._id,
      status: r.status,
      quantity: r.quantity,
      reservedAt: r.reservedAt || r.createdAt,
      expiresAt: r.expiresAt,
      user: r.user ? { id: r.user._id, name: r.user.fullName, email: r.user.email } : null,
      item: r.stock ? { name: r.stock.medicine?.name || r.stock.medicineName, unit: r.stock.unit } : null
    }));

    res.json({ success: true, count: data.length, data });
  } catch (e) {
    console.error('listMineReservations error', e);
    res.status(500).json({ success: false, message: 'Failed to list reservations' });
  }
}

module.exports.listMineReservations = listMineReservations;

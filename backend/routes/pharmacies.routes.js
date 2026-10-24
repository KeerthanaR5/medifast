const express = require('express');
const mongoose = require('mongoose');

// Allow fictional demo pharmacies only in the isolated demo database.
const searchablePharmacyFilter = () =>
  isDemoDatabase()
    ? { verified: { $in: ['manual', 'demo'] } }
    : { verified: 'manual' };

const isDemoDatabase = () =>
  process.env.NODE_ENV !== 'production' &&
  mongoose.connection.name === 'medifast_demo';
const router = express.Router();
const { queryPharmacies, queryNearbyCached } = require('../services/overpassService');
const rateLimit = require('express-rate-limit');
const Pharmacy = require('../models/Pharmacy');
const Medicine = require('../models/Medicine');
const { authenticateToken } = require('../middlewares/authenticateToken');
const { requireRoles } = require('../middlewares/roleAuth');
const { registerPharmacy } = require('../controllers/pharmacyController');

// GET /api/pharmacies/nearby?lat=..&lon=..&radius=..
const overpassLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: parseInt(process.env.OVERPASS_PUBLIC_RATE_LIMIT || '30', 10),
  standardHeaders: true,
  legacyHeaders: false
});

// GET /api/pharmacies/:id/detail?lat=&lon=&medicine=
// Public endpoint returning detailed pharmacy info with optional distance and stock for a given medicine
router.get('/:id/detail', async (req, res) => {
  try {
    const id = String(req.params.id || '').trim();
    if (!id || id.length < 10) {
      return res.status(400).json({ success: false, message: 'Invalid pharmacy id' });
    }

    const lat = parseFloat(req.query.lat);
    const lon = parseFloat(req.query.lon ?? req.query.lng);
    const medicineQ = (req.query.medicine || '').trim();

    const ph = await Pharmacy.findById(id).lean();
    if (!ph) return res.status(404).json({ success: false, message: 'Pharmacy not found' });

    const coords = Array.isArray(ph.address?.coordinates) && ph.address.coordinates.length >= 2
      ? { lat: ph.address.coordinates[1], lon: ph.address.coordinates[0] }
      : (Array.isArray(ph.location?.coordinates) && ph.location.coordinates.length >= 2
        ? { lat: ph.location.coordinates[1], lon: ph.location.coordinates[0] }
        : null);

    const toRad = (v)=> (v*Math.PI)/180;
    const haversineMeters = (a,b)=>{ const R=6371000; const dLat=toRad(b.lat-a.lat), dLon=toRad(b.lon-a.lon); const lat1=toRad(a.lat), lat2=toRad(b.lat); const h=Math.sin(dLat/2)**2 + Math.cos(lat1)*Math.cos(lat2)*Math.sin(dLon/2)**2; return 2*R*Math.asin(Math.sqrt(h)); };
    let distance = null;
    if (coords && Number.isFinite(lat) && Number.isFinite(lon)) {
      distance = haversineMeters({ lat, lon }, coords);
    }

    // Resolve requested medicine if provided
    let selectedStock = null;
    let medDoc = null;
    if (medicineQ) {
      medDoc = await Medicine.findOne({
        $or: [
          { _id: medicineQ.match(/^[0-9a-fA-F]{24}$/) ? medicineQ : undefined },
          { name: new RegExp(`^${medicineQ}$`, 'i') },
          { generic_name: new RegExp(`^${medicineQ}$`, 'i') }
        ].filter(Boolean)
      }).lean();
      if (medDoc) {
        selectedStock = await require('../models/Stock').findOne({ pharmacy: ph._id, medicine: medDoc._id }).lean();
      }
      if (!selectedStock) {
        // fallback by name string if user searched by name not in Medicine collection
        selectedStock = await require('../models/Stock').findOne({ pharmacy: ph._id, medicineName: new RegExp(`^${medicineQ}$`, 'i') }).lean();
      }
    }

    // If no specific medicine requested/found, return a small sample of stocks (up to 10) for the view
    let sampleStocks = null;
    if (!selectedStock) {
      sampleStocks = await require('../models/Stock').find({ pharmacy: ph._id })
        .sort({ updatedAt: -1 })
        .limit(10)
        .select('medicine medicineName quantity unit unitPrice lastUpdated')
        .populate({ path: 'medicine', select: 'name generic_name' })
        .lean();
    }

    return res.json({
      success: true,
      data: {
        pharmacy: {
          _id: ph._id,
          name: ph.name,
          verified: ph.verified === 'manual',
          demo: ph.verified === 'demo',
          contact_info: ph.contact_info || {},
          opening_hours: ph.opening_hours || null,
          address: ph.address || {},
          coordinates: coords,
          distance_m: distance,
        },
        stock: selectedStock ? {
          _id: selectedStock._id,
          medicine: selectedStock.medicine || null,
          medicineName: selectedStock.medicineName || null,
          quantity: selectedStock.quantity,
          unit: selectedStock.unit,
          unitPrice: selectedStock.unitPrice,
          lastUpdated: selectedStock.lastUpdated
        } : null,
        sampleStocks: selectedStock ? null : (sampleStocks || []).map(s => ({
          _id: s._id,
          medicine: s.medicine?._id || null,
          medicineName: s.medicine?.name || s.medicineName || null,
          quantity: s.quantity,
          unit: s.unit,
          unitPrice: s.unitPrice,
          lastUpdated: s.lastUpdated
        }))
      }
    });
  } catch (err) {
    console.error('Pharmacy detail error:', err);
    return res.status(500).json({ success: false, message: 'Failed to load pharmacy detail' });
  }
});

// POST /api/pharmacies/register - registration with auto-match
router.post('/register', authenticateToken, requireRoles('pharmacy', 'admin'), registerPharmacy);

router.get('/nearby', overpassLimiter, async (req, res) => {
  try {
    const lat = parseFloat(req.query.lat);
    const lon = parseFloat(req.query.lon ?? req.query.lng);
    const radius = parseInt(req.query.radius, 10) || 3000; // default 3km

    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      return res.status(400).json({ success: false, message: 'lat and lon are required numeric query params' });
    }

    // Clamp radius to a sane range 100m .. 20000m
    const radiusMeters = Math.min(20000, Math.max(100, radius));

    const results = await queryPharmacies(lat, lon, radiusMeters);

    // Transient results only, do not persist here.
    return res.status(200).json({ success: true, count: results.length, data: results });
  } catch (err) {
    console.error('Overpass nearby error:', err);
    return res.status(502).json({ success: false, message: 'Failed to query Overpass API', error: process.env.NODE_ENV === 'development' ? err.message : undefined });
  }
});

// GET /api/pharmacies/search-external?lat=..&lon=..&radius=..&demo=1
// Returns unverified pharmacies from Overpass, de-duplicated against verified DB entries
router.get('/search-external', overpassLimiter, async (req, res) => {
  try {
    const lat = parseFloat(req.query.lat);
    const lon = parseFloat(req.query.lon ?? req.query.lng);
    const radius = parseInt(req.query.radius, 10) || 3000; // meters
    const demo = req.query.demo === '1' || req.query.demo === 'true';

    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      return res.status(400).json({ success: false, message: 'lat and lon are required numeric query params' });
    }

    const radiusMeters = Math.min(20000, Math.max(100, radius));

    // 1) Fetch Overpass pharmacies (transient)
    const overpassItems = await queryPharmacies(lat, lon, radiusMeters);

    // 2) Fetch verified internal pharmacies within the same radius (for de-duplication)
    const verifiedInArea = await Pharmacy.aggregate([
      {
        $geoNear: {
          near: { type: 'Point', coordinates: [lon, lat] },
          distanceField: 'distance',
          spherical: true,
          maxDistance: radiusMeters,
          key: 'location'
        }
      },
      { $match: { verified: 'manual' } },
      { $project: { _id: 1, name: 1, coords: '$address.coordinates' } }
    ]);

    // Helper: Haversine distance (meters)
    const toRad = (v) => (v * Math.PI) / 180;
    const haversineMeters = (a, b) => {
      const R = 6371000; // meters
      const dLat = toRad(b.lat - a.lat);
      const dLon = toRad(b.lon - a.lon);
      const lat1 = toRad(a.lat);
      const lat2 = toRad(b.lat);
      const sinDLat = Math.sin(dLat / 2);
      const sinDLon = Math.sin(dLon / 2);
      const h = sinDLat * sinDLat + Math.cos(lat1) * Math.cos(lat2) * sinDLon * sinDLon;
      return 2 * R * Math.asin(Math.sqrt(h));
    };

    // Normalize name for fuzzy equality
    const normalize = (s) => (s || '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    const COORD_THRESHOLD_M = 50; // 50 meters

    // Build a quick index of verified pharmacies (coords + normalized name)
    const verifiedIndex = verifiedInArea.map(v => ({
      nameN: normalize(v.name),
      // Stored as [lon, lat]
      lon: Array.isArray(v.coords) ? v.coords[0] : null,
      lat: Array.isArray(v.coords) ? v.coords[1] : null
    }));

    // 3) Filter out Overpass results that are likely the same as a verified internal pharmacy
    const filtered = overpassItems.filter(item => {
      if (!item || !item.coordinates) return false; // require coords
      const itemPoint = { lat: item.coordinates.lat, lon: item.coordinates.lon };
      const nameN = normalize(item.pharmacy_name);
      for (const v of verifiedIndex) {
        if (v.lat == null || v.lon == null) continue;
        const dist = haversineMeters(itemPoint, { lat: v.lat, lon: v.lon });
        if (dist < COORD_THRESHOLD_M) return false; // duplicate by coords
        if (nameN && v.nameN && nameN === v.nameN) return false; // duplicate by name
      }
      return true;
    });

    // 4) Map to response shape and mark as unverified with unknown stock
    let responseItems = filtered.map(p => ({
      verified: false,
      pharmacy_name: p.pharmacy_name || null,
      coordinates: p.coordinates,
      address: p.address,
      opening_hours: p.opening_hours || null,
      stock: null,
      source: 'overpass',
      osm_type: p.osm_type,
      osm_id: p.osm_id
    }));

    // 5) Optional: inject 1-2 demo stock entries to make UI look uniform (MVP)
    if (demo && responseItems.length > 0) {
      const injectCount = Math.min(2, responseItems.length);
      for (let i = 0; i < injectCount; i++) {
        responseItems[i].stock = { quantity: Math.floor(Math.random() * 5) + 1, demo: true };
      }
    }

    return res.status(200).json({ success: true, count: responseItems.length, data: responseItems });
  } catch (err) {
    console.error('External Overpass search error:', err);
    return res.status(502).json({ success: false, message: 'Failed to query external pharmacies', error: process.env.NODE_ENV === 'development' ? err.message : undefined });
  }
});

// GET /api/pharmacies/search-unified?lat=..&lon=..&radius=..&medicine=..&demo=0
// Tiered ranking:
// 1) Verified with stock > 0 by distance
// 2) Verified without stock by distance
// 3) Unverified (Overpass) by distance
router.get('/search-unified', async (req, res) => {
  try {
    const lat = parseFloat(req.query.lat);
    const lon = parseFloat(req.query.lon ?? req.query.lng);
    const radius = parseInt(req.query.radius, 10) || 3000; // meters
    const medicineQuery = (req.query.medicine || req.query.q || '').trim();
    const showAll = req.query.showAll === '1' || req.query.showAll === 'true';
    const demo = req.query.demo === '1' || req.query.demo === 'true';

    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      return res.status(400).json({ success: false, message: 'lat and lon are required numeric query params' });
    }
    if (!medicineQuery) {
      return res.status(400).json({ success: false, message: 'medicine query is required' });
    }

    // Find medicine (strict then fuzzy)
    const med = await Medicine.findOne({
      $or: [
        { name: new RegExp(`^${medicineQuery}$`, 'i') },
        { generic_name: new RegExp(`^${medicineQuery}$`, 'i') }
      ]
    }) || await Medicine.findOne({
      $or: [
        { name: new RegExp(medicineQuery, 'i') },
        { generic_name: new RegExp(medicineQuery, 'i') }
      ]
    });

    if (!med) {
      return res.status(200).json({ success: true, medicine: medicineQuery, results: [] });
    }

    const radiusMeters = Math.min(20000, Math.max(100, radius));

    // Aggregation for all verified within radius + attach stock item if any for this medicine
    const escapedMedName = (med.name || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const escapedMedGen = (med.generic_name || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const verifiedAll = await Pharmacy.aggregate([
      {
        $geoNear: {
          near: { type: 'Point', coordinates: [lon, lat] },
          distanceField: 'distance',
          spherical: true,
          maxDistance: radiusMeters,
          key: 'location'
        }
      },
      { $match: searchablePharmacyFilter() },
      {
        $lookup: {
          from: 'stocks',
          let: { pharmacyId: '$_id' },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ['$pharmacy', '$$pharmacyId'] },
                    {
                      $or: [
                        { $eq: ['$medicine', med._id] },
                        {
                          $regexMatch: {
                            input: { $ifNull: ['$medicineName', ''] },
                            regex: new RegExp(`^${escapedMedName}$`, 'i')
                          }
                        },
                        {
                          $regexMatch: {
                            input: { $ifNull: ['$medicineName', ''] },
                            regex: new RegExp(`^${escapedMedGen}$`, 'i')
                          }
                        }
                      ]
                    }
                  ]
                }
              }
            },
            {
              $project: {
                _id: 0,
                medicine: { $ifNull: ['$medicine', med._id] },
                quantity: 1,
                unitPrice: 1
              }
            }
          ],
          as: 'stockItems'
        }
      },
      {
        $project: {
          _id: 0,
          pharmacy_id: '$_id',
          name: 1,
          verified: 1,
          opening_hours: 1,
          address: 1,
          coordinates: {
            $cond: [
              { $isArray: '$address.coordinates' },
              { lat: { $arrayElemAt: ['$address.coordinates', 1] }, lon: { $arrayElemAt: ['$address.coordinates', 0] } },
              {
                $cond: [
                  { $isArray: '$location.coordinates' },
                  { lat: { $arrayElemAt: ['$location.coordinates', 1] }, lon: { $arrayElemAt: ['$location.coordinates', 0] } },
                  null
                ]
              }
            ]
          },
          distance: 1,
          stock: { $arrayElemAt: ['$stockItems', 0] }
        }
      }
    ]);

    // Helper: determine open_now for verified using simple HH:MM-HH:MM strings or 'closed'
    const isOpenNow = (opening_hours) => {
      try {
        if (!opening_hours || typeof opening_hours !== 'object') return null;
        const days = ['sun','mon','tue','wed','thu','fri','sat'];
        const now = new Date();
        const dayKey = days[now.getDay()];
        const rule = opening_hours[dayKey];
        if (!rule) return null;
        if (typeof rule === 'string' && rule.toLowerCase() === 'closed') return false;
        const m = /^([0-2]?\d):([0-5]\d)-([0-2]?\d):([0-5]\d)$/.exec(rule);
        if (!m) return null;
        const toMinutes = (h, mi) => parseInt(h,10)*60 + parseInt(mi,10);
        const nowMin = now.getHours()*60 + now.getMinutes();
        const start = toMinutes(m[1], m[2]);
        const end = toMinutes(m[3], m[4]);
        return nowMin >= start && nowMin <= end;
      } catch { return null; }
    };

    // Split tiers
    const tier1 = []; // verified with stock > 0
    const tier2 = []; // verified without stock or quantity <= 0
    for (const p of verifiedAll) {
      const quantity = p?.stock?.quantity ?? 0;
      const open_now = isOpenNow(p.opening_hours);
      const base = {
        pharmacy_id: p.pharmacy_id,
        name: p.name,
        verified: p.verified === 'manual',
        demo: p.verified === 'demo',
        distance_m: p.distance,
        open_now,
        address: p.address,
        coordinates: p.coordinates,
        stock: p.stock ? { quantity: p.stock.quantity, unitPrice: p.stock.unitPrice } : null
      };
      if (quantity > 0) tier1.push(base); else tier2.push(base);
    }

    // Sort tiers by distance
    tier1.sort((a,b)=>a.distance_m-b.distance_m);
    tier2.sort((a,b)=>a.distance_m-b.distance_m);

    // Fetch external unverified pharmacies without blocking verified results
    let overpassItems = [];

    try {
      overpassItems = await queryPharmacies(lat, lon, radiusMeters);
    } catch (error) {
      console.warn(
        '[Unified Search] Overpass unavailable; continuing with verified pharmacies:',
        error.message
      );
    }
    const normalize = (s) => (s || '').toLowerCase().replace(/[^a-z0-9]+/g,' ').replace(/\s+/g,' ').trim();
    const verifiedIndex = verifiedAll.map(v => ({
      nameN: normalize(v.name),
      lat: v.coordinates?.lat ?? null,
      lon: v.coordinates?.lon ?? null
    }));
    const toRad = (v)=> (v*Math.PI)/180;
    const haversineMeters = (a,b)=>{ const R=6371000; const dLat=toRad(b.lat-a.lat), dLon=toRad(b.lon-a.lon); const lat1=toRad(a.lat), lat2=toRad(b.lat); const h=Math.sin(dLat/2)**2 + Math.cos(lat1)*Math.cos(lat2)*Math.sin(dLon/2)**2; return 2*R*Math.asin(Math.sqrt(h)); };
    const COORD_THRESHOLD_M = 50;

    const unverified = overpassItems.filter(item => {
      if (!item.coordinates) return false;
      const ipt = { lat: item.coordinates.lat, lon: item.coordinates.lon };
      const nameN = normalize(item.pharmacy_name);
      for (const v of verifiedIndex) {
        if (v.lat!=null && v.lon!=null) {
          const d = haversineMeters(ipt, { lat: v.lat, lon: v.lon });
          if (d < COORD_THRESHOLD_M) return false;
        }
        if (nameN && v.nameN && nameN === v.nameN) return false;
      }
      return true;
    }).map(p => ({
      pharmacy_id: null,
      name: p.pharmacy_name || 'Unnamed Pharmacy',
      verified: false,
      distance_m: null, // client can compute if needed; or estimate later
      open_now: p.opening_hours ? !/closed/i.test(p.opening_hours) : null,
      address: p.address,
      coordinates: p.coordinates,
      stock: null,
      source: 'overpass',
      osm_type: p.osm_type,
      osm_id: p.osm_id
    }));

    // Estimate distance for unverified using simple haversine from center
    for (const u of unverified) {
      if (u.coordinates?.lat != null && u.coordinates?.lon != null) {
        u.distance_m = haversineMeters({ lat, lon }, u.coordinates);
      }
    }
    unverified.sort((a,b)=> (a.distance_m??Infinity) - (b.distance_m??Infinity));

    // Optional demo stock to make UI uniform
    if (demo && unverified.length > 0) {
      const inject = Math.min(2, unverified.length);
      for (let i=0;i<inject;i++) {
        unverified[i].stock = { quantity: Math.floor(Math.random()*5)+1, demo: true };
      }
    }

    const results = [...tier1, ...tier2, ...unverified];
    return res.status(200).json({ success: true, medicine: med.generic_name || med.name, results });
  } catch (err) {
    console.error('Unified pharmacy search error:', err);
    return res.status(500).json({ success: false, message: 'Failed to run unified search', error: process.env.NODE_ENV === 'development' ? err.message : undefined });
  }
});


// GET /api/pharmacies/search?lat=..&lon=..&radius=..&medicine=...
router.get('/search', overpassLimiter, async (req, res) => {
  try {
    const lat = parseFloat(req.query.lat);
    const lon = parseFloat(req.query.lon ?? req.query.lng);
    const radius = parseInt(req.query.radius, 10) || 3000; // meters
    const radiusMeters = Math.min(20000, Math.max(100, radius));
    const medicineQuery = (req.query.medicine || req.query.q || '').trim();
    const showAll = req.query.showAll === '1' || req.query.showAll === 'true';

    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      return res.status(400).json({ success: false, message: 'lat and lon are required numeric query params' });
    }
    if (!medicineQuery) {
      return res.status(400).json({ success: false, message: 'medicine query is required' });
    }

    // Find medicine (strict then fuzzy)
    const med = await Medicine.findOne({
      $or: [
        { name: new RegExp(`^${medicineQuery}$`, 'i') },
        { generic_name: new RegExp(`^${medicineQuery}$`, 'i') }
      ]
    }) || await Medicine.findOne({
      $or: [
        { name: new RegExp(medicineQuery, 'i') },
        { generic_name: new RegExp(medicineQuery, 'i') }
      ]
    });

    if (!med) {
      // No medicine match: still return all nearby pharmacies (verified + overpass)
      const verifiedNearby = await Pharmacy.aggregate([
        {
          $geoNear: {
            near: { type: 'Point', coordinates: [lon, lat] },
            distanceField: 'distance',
            spherical: true,
            maxDistance: radiusMeters,
            key: 'location'
          }
        },
        { $match: searchablePharmacyFilter() },
        {
          $project: {
            _id: 1,
            name: 1,
            verified: 1,
            opening_hours: 1,
            address: 1,
            coordinates: {
              $cond: [
                { $isArray: '$address.coordinates' },
                { lat: { $arrayElemAt: ['$address.coordinates', 1] }, lon: { $arrayElemAt: ['$address.coordinates', 0] } },
                {
                  $cond: [
                    { $isArray: '$location.coordinates' },
                    { lat: { $arrayElemAt: ['$location.coordinates', 1] }, lon: { $arrayElemAt: ['$location.coordinates', 0] } },
                    null
                  ]
                }
              ]
            },
            distance: 1
          }
        }
      ]);

      // Map verified
      const vEntries = verifiedNearby.map(v => ({
        id: v._id,
        name: v.name,
        lat: v.coordinates?.lat ?? null,
        lon: v.coordinates?.lon ?? null,
        verified: v.verified === 'manual',
        demo: v.verified === 'demo',
        distance_m: v.distance,
        open_now: null,
        stock: null,
        pharmacy_id: v._id,
        coordinates: v.coordinates,
        distance: v.distance,
        address: v.address
      }));

      // Overpass
      let overpassItems = [];
      try { overpassItems = await queryNearbyCached(lat, lon, radiusMeters); } catch { overpassItems = []; }
      const uEntries = overpassItems.map(p => ({
        id: null,
        name: p.pharmacy_name || 'Unnamed Pharmacy',
        lat: p.coordinates?.lat ?? null,
        lon: p.coordinates?.lon ?? null,
        verified: false,
        distance_m: (p.coordinates?.lat != null && p.coordinates?.lon != null) ? (function(){ const toRad=(v)=> (v*Math.PI)/180; const R=6371000; const dLat=toRad(p.coordinates.lat-lat), dLon=toRad(p.coordinates.lon-lon); const lat1=toRad(lat), lat2=toRad(p.coordinates.lat); const h=Math.sin(dLat/2)**2 + Math.cos(lat1)*Math.cos(lat2)*Math.sin(dLon/2)**2; return 2*R*Math.asin(Math.sqrt(h)); })() : null,
        open_now: p.opening_hours ? !/closed/i.test(p.opening_hours) : null,
        stock: null,
        pharmacy_id: null,
        coordinates: p.coordinates,
        distance: null,
        address: p.address
      }));
      vEntries.sort((a,b)=>a.distance_m-b.distance_m);
      uEntries.sort((a,b)=> (a.distance_m??Infinity) - (b.distance_m??Infinity));
      const results = [...vEntries, ...uEntries];
      return res.status(200).json({ success: true, medicine: medicineQuery, count: results.length, results, data: results, notice: 'No matching medicine found; showing nearby pharmacies' });
    }

    // Helper: determine open_now for verified using simple HH:MM-HH:MM strings or 'closed'
    const isOpenNow = (opening_hours) => {
      try {
        if (!opening_hours || typeof opening_hours !== 'object') return null;
        const days = ['sun','mon','tue','wed','thu','fri','sat'];
        const now = new Date();
        const dayKey = days[now.getDay()];
        const rule = opening_hours[dayKey];
        if (!rule) return null;
        if (typeof rule === 'string' && rule.toLowerCase() === 'closed') return false;
        const m = /^([0-2]?\d):([0-5]\d)-([0-2]?\d):([0-5]\d)$/.exec(rule);
        if (!m) return null;
        const toMinutes = (h, mi) => parseInt(h,10)*60 + parseInt(mi,10);
        const nowMin = now.getHours()*60 + now.getMinutes();
        const start = toMinutes(m[1], m[2]);
        const end = toMinutes(m[3], m[4]);
        return nowMin >= start && nowMin <= end;
      } catch { return null; }
    };

    // Step 1: verified pharmacies within radius and optional stock for the medicine
    const escapedMedName = (med.name || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const escapedMedGen = (med.generic_name || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const verifiedAll = await Pharmacy.aggregate([
      {
        $geoNear: {
          near: { type: 'Point', coordinates: [lon, lat] },
          distanceField: 'distance',
          spherical: true,
          maxDistance: radiusMeters,
          key: 'location'
        }
      },
      { $match: searchablePharmacyFilter() },
      {
        $lookup: {
          from: 'stocks',
          let: { pharmacyId: '$_id' },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ['$pharmacy', '$$pharmacyId'] },
                    {
                      $or: [
                        { $eq: ['$medicine', med._id] },
                        {
                          $regexMatch: {
                            input: { $ifNull: ['$medicineName', ''] },
                            regex: new RegExp(`^${escapedMedName}$`, 'i')
                          }
                        },
                        {
                          $regexMatch: {
                            input: { $ifNull: ['$medicineName', ''] },
                            regex: new RegExp(`^${escapedMedGen}$`, 'i')
                          }
                        }
                      ]
                    }
                  ]
                }
              }
            },
            {
              $project: {
                _id: 0,
                medicine: { $ifNull: ['$medicine', med._id] },
                quantity: 1,
                unitPrice: 1
              }
            }
          ],
          as: 'stockItems'
        }
      },
      {
        $project: {
          _id: 1,
          name: 1,
          verified: 1,
          opening_hours: 1,
          address: 1,
          externalId: 1,
          coordinates: {
            $cond: [
              { $isArray: '$address.coordinates' },
              { lat: { $arrayElemAt: ['$address.coordinates', 1] }, lon: { $arrayElemAt: ['$address.coordinates', 0] } },
              {
                $cond: [
                  { $isArray: '$location.coordinates' },
                  { lat: { $arrayElemAt: ['$location.coordinates', 1] }, lon: { $arrayElemAt: ['$location.coordinates', 0] } },
                  null
                ]
              }
            ]
          },
          distance: 1,
          stock: { $arrayElemAt: ['$stockItems', 0] }
        }
      }
    ]);

    // Step 2: Overpass nearby (cached) for resilience
    let overpassItems = [];
    try {
      overpassItems = await queryNearbyCached(lat, lon, radiusMeters);
    } catch (e) {
      if (process.env.NODE_ENV === 'development') {
        console.warn('Overpass fetch failed, continuing with verified only:', e.message);
      }
      overpassItems = [];
    }

    // Dedupe: externalId match first, then proximity+name similarity
    const normalize = (s) => (s || '').toLowerCase().replace(/[^a-z0-9]+/g,' ').replace(/\s+/g,' ').trim();
    const jaroWinkler = (a, b) => {
      if (!a || !b) return 0; a=a.toLowerCase(); b=b.toLowerCase(); const m=Math.floor(Math.max(a.length,b.length)/2)-1; let matches=0, trans=0; const am=new Array(a.length).fill(false), bm=new Array(b.length).fill(false); for (let i=0;i<a.length;i++){ const s=Math.max(0,i-m), e=Math.min(i+m+1,b.length); for (let j=s;j<e;j++){ if(!bm[j]&&a[i]===b[j]){am[i]=bm[j]=true;matches++;break;}}} if(!matches) return 0; let k=0; for(let i=0;i<a.length;i++){ if(am[i]){ while(!bm[k])k++; if(a[i]!==b[k]) trans++; k++; }} trans/=2; const j=(matches/a.length + matches/b.length + (matches-trans)/matches)/3; let p=0; for(; p<Math.min(4,a.length,b.length)&&a[p]===b[p]; p++); return j + p*0.1*(1-j);
    };
    const toRad = (v)=> (v*Math.PI)/180;
    const haversineMeters = (a,b)=>{ const R=6371000; const dLat=toRad(b.lat-a.lat), dLon=toRad(b.lon-a.lon); const lat1=toRad(a.lat), lat2=toRad(b.lat); const h=Math.sin(dLat/2)**2 + Math.cos(lat1)*Math.cos(lat2)*Math.sin(dLon/2)**2; return 2*R*Math.asin(Math.sqrt(h)); };
    const COORD_THRESHOLD_M = 50;

    const verifiedExtIds = new Set(verifiedAll.map(v => (v.externalId ? String(v.externalId) : null)).filter(Boolean));
    const verifiedIndex = verifiedAll.map(v => ({
      id: v._id,
      nameN: normalize(v.name),
      lat: v.coordinates?.lat ?? null,
      lon: v.coordinates?.lon ?? null
    }));

    const filteredOverpass = [];
    for (const p of overpassItems) {
      if (!p?.coordinates) continue;
      if (showAll) { filteredOverpass.push(p); continue; }
      const osmId = p.osm_id != null ? String(p.osm_id) : null;
      if (osmId && verifiedExtIds.has(osmId)) {
        if (process.env.NODE_ENV === 'development') {
          console.log(`[dedupe] externalId match drop osm_id=${osmId}`);
        }
        continue;
      }
      const nameN = normalize(p.pharmacy_name);
      const pt = { lat: p.coordinates.lat, lon: p.coordinates.lon };
      let dup = false;
      for (const v of verifiedIndex) {
        if (v.lat!=null && v.lon!=null) {
          const d = haversineMeters(pt, { lat: v.lat, lon: v.lon });
          if (d < COORD_THRESHOLD_M) {
            const sim = jaroWinkler(nameN, v.nameN);
            if (sim >= 0.85) {
              if (process.env.NODE_ENV === 'development') {
                console.log(`[dedupe] prox+name drop osm_id=${osmId} dist=${Math.round(d)}m sim=${sim.toFixed(2)}`);
              }
              dup = true; break;
            }
          }
        }
      }
      if (!dup) filteredOverpass.push(p);
    }

    // Map verified tiers
    const tier1 = []; // in-stock
    const tier2 = []; // out-of-stock
    for (const v of verifiedAll) {
      const quantity = v?.stock?.quantity ?? 0;
      const open_now = isOpenNow(v.opening_hours);
      const entry = {
        // Unified schema
        id: v._id,
        name: v.name,
        lat: v.coordinates?.lat ?? null,
        lon: v.coordinates?.lon ?? null,
        verified: v.verified === 'manual',
        demo: v.verified === 'demo',
        distance_m: v.distance,
        open_now,
        stock: v.stock ? { medicine: v.stock.medicine || med._id, qty: v.stock.quantity, unitPrice: v.stock.unitPrice } : null,
        // Back-compat for frontend
        pharmacy_id: v._id,
        coordinates: v.coordinates,
        distance: v.distance,
        address: v.address
      };
      if (quantity > 0) tier1.push(entry); else tier2.push(entry);
    }
    tier1.sort((a,b)=>a.distance_m-b.distance_m);
    tier2.sort((a,b)=>a.distance_m-b.distance_m);

    // Map unverified
    const unverified = filteredOverpass.map(p => {
      const entry = {
        id: null,
        name: p.pharmacy_name || 'Unnamed Pharmacy',
        lat: p.coordinates.lat,
        lon: p.coordinates.lon,
        verified: false,
        distance_m: null,
        open_now: p.opening_hours ? !/closed/i.test(p.opening_hours) : null,
        stock: null,
        // Back-compat
        pharmacy_id: null,
        coordinates: p.coordinates,
        distance: null,
        address: p.address
      };
      if (entry.lat!=null && entry.lon!=null) {
        entry.distance_m = haversineMeters({ lat, lon }, { lat: entry.lat, lon: entry.lon });
        entry.distance = entry.distance_m;
      }
      return entry;
    });
    unverified.sort((a,b)=> (a.distance_m??Infinity) - (b.distance_m??Infinity));

    const results = [...tier1, ...tier2, ...unverified];
    // Align response shape with /search-unified and frontend expectations
    return res.status(200).json({
      success: true,
      medicine: med.generic_name || med.name,
      count: results.length,
      results,
      data: results // back-compat
    });
  } catch (err) {
    console.error('Pharmacy unified search error:', err);
    return res.status(500).json({ success: false, message: 'Failed to run unified search', error: process.env.NODE_ENV === 'development' ? err.message : undefined });
  }
});

module.exports = router;

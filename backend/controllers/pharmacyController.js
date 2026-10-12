const Pharmacy = require('../models/Pharmacy');
const { queryPharmacies } = require('../services/overpassService');
const { LICENSE_REGEX } = require('../middlewares/verifySignUp');

// Simple Jaro-Winkler similarity (lightweight, adequate for names)
function jaroWinkler(a, b) {
  if (!a || !b) return 0;
  a = a.toLowerCase();
  b = b.toLowerCase();
  const m = Math.floor(Math.max(a.length, b.length) / 2) - 1;
  let matches = 0, transpositions = 0;
  const aMatch = new Array(a.length).fill(false);
  const bMatch = new Array(b.length).fill(false);
  for (let i = 0; i < a.length; i++) {
    const start = Math.max(0, i - m);
    const end = Math.min(i + m + 1, b.length);
    for (let j = start; j < end; j++) {
      if (!bMatch[j] && a[i] === b[j]) { aMatch[i] = bMatch[j] = true; matches++; break; }
    }
  }
  if (matches === 0) return 0;
  let k = 0;
  for (let i = 0; i < a.length; i++) {
    if (aMatch[i]) { while (!bMatch[k]) k++; if (a[i] !== b[k]) transpositions++; k++; }
  }
  transpositions /= 2;
  const jaro = (matches / a.length + matches / b.length + (matches - transpositions) / matches) / 3;
  // Winkler prefix boost up to 4
  let prefix = 0; const maxPrefix = 4;
  for (; prefix < Math.min(maxPrefix, a.length, b.length) && a[prefix] === b[prefix]; prefix++);
  return jaro + prefix * 0.1 * (1 - jaro);
}

function normalizeName(s) {
  return (s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function proximityScore(meters) {
  if (meters == null) return 0;
  if (meters <= 20) return 1;
  if (meters <= 50) return 0.9;
  if (meters <= 100) return 0.7;
  if (meters <= 200) return 0.5;
  return 0.0;
}

async function registerPharmacy(req, res) {
  try {
    const user = req.user; // set by authenticateToken
    const body = req.body || {};
    // Support both old and new payloads. Prefer new contract fields when present.
    const name = body.name || body.pharmacyName;
    const licenseNumber = body.licenseNumber;
    const isManual = Boolean(body.isManual);
    const ownerName = body.ownerName; // accepted but not stored separately (owner is from auth)
    const contactRaw = body.contact; // string; optional
    // address may be a final string (new) or an object (old). We keep street = final string for display.
    const address = typeof body.address === 'string'
      ? { street: body.address, city: null, state: null, postcode: null, country: 'India' }
      : (body.address || {});
    // Preferred: GeoJSON location { type:'Point', coordinates:[lng,lat] }
    let lat, lon;
    if (body.location && Array.isArray(body.location.coordinates) && body.location.coordinates.length >= 2) {
      lon = Number(body.location.coordinates[0]);
      lat = Number(body.location.coordinates[1]);
    } else {
      // Back-compat numeric fields
      lat = typeof body.lat === 'string' ? Number(body.lat) : body.lat;
      lon = body.lon != null ? (typeof body.lon === 'string' ? Number(body.lon) : body.lon)
                 : (body.lng != null ? (typeof body.lng === 'string' ? Number(body.lng) : body.lng) : undefined);
    }

    // Enforce single-pharmacy-per-owner
    if (user?._id) {
      const existingOwned = await Pharmacy.findOne({ owner: user._id }).select('_id name').lean();
      if (existingOwned) {
        return res.status(409).json({
          success: false,
          message: 'You already have a registered pharmacy linked to this account.',
          data: { pharmacyId: existingOwned._id, name: existingOwned.name }
        });
      }
    }

    if (!name || !address || typeof address.street !== 'string' || !address.street.trim()) {
      return res.status(400).json({ success: false, message: 'address (final string) is required' });
    }
    if (typeof lat !== 'number' || typeof lon !== 'number' || !Number.isFinite(lat) || !Number.isFinite(lon)) {
      return res.status(400).json({ success: false, message: 'Valid lat/lon (or location.coordinates) are required' });
    }
    if (!licenseNumber) {
      return res.status(400).json({ success: false, message: 'licenseNumber is required' });
    }
    if (!LICENSE_REGEX.test(String(licenseNumber).toUpperCase())) {
      return res.status(400).json({ success: false, message: 'Invalid licenseNumber format' });
    }

    // Normalize inputs
    const nameN = normalizeName(name);
    const addrNorm = normalizeName(
      [address.street, address.housenumber, address.city, address.state, address.postcode || address.zipCode, address.country]
        .filter(Boolean)
        .join(' ')
    );

    // Query Overpass around the pin
    const radius = 100; // meters
    let candidates = [];
    try {
      candidates = await queryPharmacies(lat, lon, radius);
    } catch (overpassError) {
      console.warn('[registerPharmacy] Overpass API failed, proceeding with unverified status:', overpassError.message);
      // Continue with empty candidates - pharmacy will be unverified
    }

    // Score candidates
    let best = null;
    for (const c of candidates) {
      const cName = normalizeName(c.pharmacy_name || '');
      const nameSim = jaroWinkler(nameN, cName);
      let dist = null;
      if (c.coordinates?.lat != null && c.coordinates?.lon != null) {
        // Haversine to compute distance roughly
        const R = 6371000; // m
        const toRad = (v) => (v * Math.PI) / 180;
        const dLat = toRad(c.coordinates.lat - lat);
        const dLon = toRad(c.coordinates.lon - lon);
        const a = Math.sin(dLat/2)**2 + Math.cos(toRad(lat)) * Math.cos(toRad(c.coordinates.lat)) * Math.sin(dLon/2)**2;
        const d = 2 * R * Math.asin(Math.sqrt(a));
        dist = d;
      }
      const prox = proximityScore(dist);
      // Weighted score: proximity 0.6, name 0.4
      const score = 0.6 * prox + 0.4 * nameSim;
      if (!best || score > best.score) best = { candidate: c, score, distance: dist };
    }

    const THRESHOLD = 0.7;
    if (process.env.NODE_ENV === 'development') {
      console.log('[registerPharmacy] match_evaluation', {
        inputName: nameN,
        candidate: best ? {
          osm_id: best.candidate?.osm_id,
          name: best.candidate?.pharmacy_name,
          distance_m: best.distance != null ? Math.round(best.distance) : null,
          score: best.score
        } : null,
        threshold: THRESHOLD
      });
    }
    const verified = best && best.score >= THRESHOLD ? 'auto' : 'unverified';
    const externalId = verified === 'auto' ? String(best.candidate.osm_id) : undefined;

    // Dedupe checks before creating a new doc
    if (externalId) {
      const existingByExternal = await Pharmacy.findOne({ externalId });
      if (existingByExternal) {
        return res.status(409).json({
          success: false,
          message: 'Pharmacy already exists (matched by externalId). If this is your business, please use the claim/owner linking flow.',
          data: { existingId: existingByExternal._id, owner: existingByExternal.owner ? 'linked' : 'unlinked' }
        });
      }
    }

    // Nearby dedupe: block creating a new pharmacy if a different owner has a pharmacy within 50m
    const nearExisting = await Pharmacy.findOne({
      location: {
        $near: {
          $geometry: { type: 'Point', coordinates: [Number(lon), Number(lat)] },
          $maxDistance: 50
        }
      }
    });
    if (nearExisting && String(nearExisting.owner || '') !== String(user?._id || '')) {
      return res.status(409).json({
        success: false,
        message: 'A pharmacy is already registered very close to this location by another owner. Please review existing listings or contact support.',
        data: { existingId: nearExisting._id }
      });
    }

    // Prepare document
    const doc = new Pharmacy({
      name: name.trim(),
      owner: user?._id || undefined,
      licenseNumber: String(licenseNumber).trim(),
      address: {
        street: address.street || null, // store final display address in street field for now
        city: address.city || null,
        state: address.state || null,
        zipCode: address.postcode || address.zipCode || null,
        country: address.country || 'India',
        coordinates: [Number(lon), Number(lat)]
      },
      contact_info: {
        phone: contactRaw || undefined
      },
      addressNormalized: addrNorm,
      location: { type: 'Point', coordinates: [Number(lon), Number(lat)] },
      verified,
      autoMatchScore: best ? Number(best.score) : 0,
      externalId
    });

    try {
      await doc.save();
    } catch (e) {
      // Translate unique externalId collisions into 409 response
      if (e && e.code === 11000 && e.keyPattern && e.keyPattern.externalId) {
        return res.status(409).json({
          success: false,
          message: 'Pharmacy already exists (duplicate externalId). If this is your business, use the claim flow.',
        });
      }
      throw e;
    }

    return res.status(201).json({
      success: true,
      data: {
        pharmacyId: doc._id,
        verified: doc.verified,
        matchCandidate: best ? {
          osm_id: best.candidate.osm_id,
          name: best.candidate.pharmacy_name,
          coordinates: best.candidate.coordinates,
          distance_m: best.distance != null ? Math.round(best.distance) : null
        } : null,
        score: best ? Number(best.score.toFixed(3)) : 0
      }
    });
  } catch (err) {
    console.error('Pharmacy register error:', err);
    return res.status(500).json({ success: false, message: 'Failed to register pharmacy' });
  }
}

async function getMedicinesAutocomplete(req, res) {
  try {
    const query = typeof req.query.query === 'string' ? req.query.query.trim() : '';
    if (!query) {
      return res.json({ success: true, data: [] });
    }

    const Medicine = require('../models/Medicine');
    const escapedQuery = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const matcher = new RegExp(escapedQuery, 'i');
    const medicines = await Medicine.find({
      $or: [
        { name: matcher },
        { generic_name: matcher }
      ]
    })
    .select('name generic_name')
    .limit(50)
    .sort({ name: 1 })
    .lean();

    const normalizedQuery = query.toLocaleLowerCase();
    const rank = (value) => {
      const normalizedValue = value.toLocaleLowerCase();
      if (normalizedValue === normalizedQuery) return 0;
      if (normalizedValue.startsWith(normalizedQuery)) return 1;
      if (normalizedValue.split(/\s+/).some((word) => word.startsWith(normalizedQuery))) return 2;
      return 3;
    };
    const data = medicines
      .sort((left, right) => {
        const leftRank = Math.min(rank(left.name), rank(left.generic_name));
        const rightRank = Math.min(rank(right.name), rank(right.generic_name));
        return leftRank - rightRank || left.name.localeCompare(right.name);
      })
      .slice(0, 10)
      .map(med => ({
        name: med.name,
        generic_name: med.generic_name
      }));

    res.json({ success: true, data });
  } catch (error) {
    console.error('Medicines autocomplete error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch medicine suggestions' });
  }
}

module.exports = { registerPharmacy, getMedicinesAutocomplete };

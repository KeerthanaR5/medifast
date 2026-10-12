// Service to query Overpass API for pharmacies around a point
// Uses Node 18+ global fetch

const OVERPASS_ENDPOINT = 'https://overpass-api.de/api/interpreter';

function buildOverpassQuery(lat, lon, radiusMeters) {
  // Overpass QL: around:<radius> <lat> <lon>
  // Query nodes and ways with amenity=pharmacy and optional opening_hours
  return `
    [out:json][timeout:25];
    (
      node["amenity"="pharmacy"](around:${radiusMeters},${lat},${lon});
      way["amenity"="pharmacy"](around:${radiusMeters},${lat},${lon});
      relation["amenity"="pharmacy"](around:${radiusMeters},${lat},${lon});
    );
    out center tags;
  `;
}

function extractCoords(element) {
  // For nodes, lat/lon are present; for ways/relations, use center if present
  if (typeof element.lat === 'number' && typeof element.lon === 'number') {
    return { lat: element.lat, lon: element.lon };
  }
  if (element.center && typeof element.center.lat === 'number' && typeof element.center.lon === 'number') {
    return { lat: element.center.lat, lon: element.center.lon };
  }
  return null;
}

function mapOverpassElement(el) {
  const coords = extractCoords(el);
  const tags = el.tags || {};
  return {
    source: 'overpass',
    osm_type: el.type,
    osm_id: el.id,
    pharmacy_name: tags.name || null,
    coordinates: coords ? { lat: coords.lat, lon: coords.lon } : null,
    address: {
      street: tags['addr:street'] || null,
      housenumber: tags['addr:housenumber'] || null,
      city: tags['addr:city'] || null,
      state: tags['addr:state'] || null,
      postcode: tags['addr:postcode'] || null,
      country: tags['addr:country'] || null
    },
    opening_hours: tags.opening_hours || null,
    phone: tags.phone || tags['contact:phone'] || null,
    website: tags.website || tags['contact:website'] || null
  };
}

async function queryPharmacies(lat, lon, radiusMeters) {
  const query = buildOverpassQuery(lat, lon, radiusMeters);
  const body = new URLSearchParams({ data: query });

  const res = await fetch(OVERPASS_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      'User-Agent': process.env.OVERPASS_USER_AGENT || 'MediFast/1.0 (+https://example.com)'
    },
    body
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Overpass API error: ${res.status} ${res.statusText} - ${text.slice(0, 200)}`);
  }

  const data = await res.json();
  const elements = Array.isArray(data.elements) ? data.elements : [];
  return elements
    .map(mapOverpassElement)
    .filter(item => item.coordinates); // only items with coords
}

// Public alias
async function queryNearby(lat, lon, radiusMeters) {
  return queryPharmacies(lat, lon, radiusMeters);
}

// Simple in-memory LRU cache for nearby queries
const _cache = new Map(); // key -> { data, expiresAt }
const MAX_ENTRIES = 200;

function _makeKey(lat, lon, radiusMeters) {
  return `${lat.toFixed(5)}_${lon.toFixed(5)}_${Math.round(radiusMeters)}`;
}

function _setCache(key, value, ttlMs) {
  const expiresAt = Date.now() + ttlMs;
  if (_cache.size >= MAX_ENTRIES) {
    // delete oldest
    const firstKey = _cache.keys().next().value;
    if (firstKey) _cache.delete(firstKey);
  }
  _cache.set(key, { data: value, expiresAt });
}

function _getCache(key) {
  const entry = _cache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    _cache.delete(key);
    return null;
  }
  return entry.data;
}

async function queryNearbyCached(lat, lon, radiusMeters, ttlMs = undefined) {
  const envTtl = parseInt(process.env.OVERPASS_CACHE_TTL_SECONDS || '90', 10) * 1000;
  ttlMs = ttlMs ?? envTtl;
  const key = _makeKey(lat, lon, radiusMeters);
  const hit = _getCache(key);
  if (hit) {
    if (process.env.NODE_ENV === 'development') {
      console.log(`[overpass-cache] hit ${key}`);
    }
    return hit;
  }
  const data = await queryPharmacies(lat, lon, radiusMeters);
  _setCache(key, data, ttlMs);
  return data;
}

module.exports = {
  queryPharmacies,
  queryNearby,
  queryNearbyCached,
  /**
   * Fetch a single OSM element (node/way/relation) by id. Tries all types.
   */
  async getElementById(osmId) {
    const id = String(osmId).trim();
    const query = `
      [out:json][timeout:25];
      (
        node(${id});
        way(${id});
        relation(${id});
      );
      out center tags;
    `;
    const body = new URLSearchParams({ data: query });
    const res = await fetch(OVERPASS_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'User-Agent': process.env.OVERPASS_USER_AGENT || 'MediFast/1.0 (+https://example.com)'
      },
      body
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Overpass API error: ${res.status} ${res.statusText} - ${text.slice(0,200)}`);
    }
    const data = await res.json();
    const el = (data.elements && data.elements[0]) ? data.elements[0] : null;
    return el ? mapOverpassElement(el) : null;
  }
};

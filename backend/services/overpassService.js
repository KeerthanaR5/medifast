// Service to query Overpass API for pharmacies around a point
// Uses Node 18+ global fetch

const OVERPASS_ENDPOINTS = [
  'https://overpass.private.coffee/api/interpreter',
  'https://overpass-api.de/api/interpreter'
];

function validateSearchParameters(lat, lon, radiusMeters) {
  const isValidNumber = (value) =>
    (typeof value === 'number' ||
      (typeof value === 'string' && value.trim() !== '')) &&
    Number.isFinite(Number(value));

  if (!isValidNumber(lat) || Number(lat) < -90 || Number(lat) > 90) {
    throw new Error('Invalid latitude: must be between -90 and 90');
  }

  if (!isValidNumber(lon) || Number(lon) < -180 || Number(lon) > 180) {
    throw new Error('Invalid longitude: must be between -180 and 180');
  }

  if (
    !isValidNumber(radiusMeters) ||
    Number(radiusMeters) <= 0 ||
    Number(radiusMeters) > 50000
  ) {
    throw new Error('Invalid radius: must be between 0 and 50000 meters');
  }
}

function buildOverpassQuery(lat, lon, radiusMeters) {
  validateSearchParameters(lat, lon, radiusMeters);
  lat = Number(lat);
  lon = Number(lon);
  radiusMeters = Number(radiusMeters);
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

  let lastError;

  for (const endpoint of OVERPASS_ENDPOINTS) {
    try {
      console.log(`[Overpass] Trying ${endpoint}`);

      const res = await fetch(endpoint, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
    'Accept': 'application/json',
    'User-Agent': process.env.OVERPASS_USER_AGENT || 'MediFast/1.0'
  },
  body: new URLSearchParams({ data: query }),
  signal: AbortSignal.timeout(25000)
});

      if (!res.ok) {
        throw new Error(`Overpass returned HTTP ${res.status}`);
      }

      const data = await res.json();

      if (!Array.isArray(data.elements)) {
        throw new Error('Invalid Overpass response');
      }

      console.log(`[Overpass] Success from ${endpoint}`);

      return data.elements
        .map(mapOverpassElement)
        .filter(item => item.coordinates);

    } catch (error) {
      lastError = error;
      console.warn(`[Overpass] ${endpoint} failed: ${error.message}`);
    }
  }

  throw new Error(
    `All Overpass endpoints failed. Last error: ${lastError?.message || 'Unknown error'}`
  );
}

// Public alias
async function queryNearby(lat, lon, radiusMeters) {
  return queryPharmacies(lat, lon, radiusMeters);
}

// Simple in-memory LRU cache for nearby queries
const _cache = new Map(); // key -> { data, expiresAt }
const MAX_ENTRIES = 200;

function _makeKey(lat, lon, radiusMeters) {
  const latitude = Number(lat);
  const longitude = Number(lon);
  const radius = Number(radiusMeters);

  return `${latitude.toFixed(5)}_${longitude.toFixed(5)}_${Math.round(radius)}`;
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
  validateSearchParameters(lat, lon, radiusMeters);
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

  // OSM IDs must contain positive integers only.
  if (!/^[1-9]\d*$/.test(id)) {
    throw new Error('Invalid OSM element ID');
  }

  const query = `
    [out:json][timeout:25];
    (
      node(${id});
      way(${id});
      relation(${id});
    );
    out center tags;
  `;

  let lastError;

  for (const endpoint of OVERPASS_ENDPOINTS) {
    try {
      console.log(`[Overpass] Looking up element ${id} via ${endpoint}`);

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
          'Accept': 'application/json',
          'User-Agent': process.env.OVERPASS_USER_AGENT || 'MediFast/1.0'
        },
        body: new URLSearchParams({ data: query }),
        signal: AbortSignal.timeout(25000)
      });

      if (!res.ok) {
        throw new Error(`Overpass returned HTTP ${res.status}`);
      }

      const data = await res.json();

      if (!Array.isArray(data.elements)) {
        throw new Error('Invalid Overpass response');
      }

      const element = data.elements[0] || null;

      return element ? mapOverpassElement(element) : null;
    } catch (error) {
      lastError = error;
      console.warn(`[Overpass] Element lookup failed: ${error.message}`);
    }
  }

  throw new Error(
    `All Overpass endpoints failed for element ${id}: ${lastError?.message || 'Unknown error'}`
  );
}

};

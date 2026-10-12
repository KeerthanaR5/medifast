// Lightweight matching utilities used in registration and search dedupe

function normalizeName(s) {
  return (s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
}

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

function toRad(v) { return (v * Math.PI) / 180; }
function haversineMeters(a, b) {
  const R = 6371000;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const lat1 = toRad(a.lat), lat2 = toRad(b.lat);
  const h = Math.sin(dLat/2)**2 + Math.cos(lat1)*Math.cos(lat2)*Math.sin(dLon/2)**2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function proximityScore(meters) {
  if (meters == null) return 0;
  if (meters <= 20) return 1;
  if (meters <= 50) return 0.9;
  if (meters <= 100) return 0.7;
  if (meters <= 200) return 0.5;
  return 0.0;
}

module.exports = { normalizeName, jaroWinkler, haversineMeters, proximityScore };

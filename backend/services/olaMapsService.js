const crypto = require('crypto');

const BASE_URL = 'https://api.olamaps.io';

function buildQuery(params) {
  return Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    .join('&');
}

async function httpGet(path, params = {}) {
  const apiKey = process.env.OLA_API_KEY || process.env.OLA_MAPS_API_KEY;
  if (!apiKey) throw new Error('OLA_API_KEY or OLA_MAPS_API_KEY not configured');
  const url = `${BASE_URL}${path}?${buildQuery({ ...params, api_key: apiKey })}`;
  const reqId = crypto.randomUUID();
  const corrId = crypto.randomUUID();
  const res = await fetch(url, {
    headers: {
      'X-Request-Id': reqId,
      'X-Correlation-Id': corrId,
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`OLA API error ${res.status}: ${text}`);
  }
  return res.json();
}

async function autocomplete({ input, location, radius, strictbounds, language }) {
  if (!input || !input.trim()) return { predictions: [] };
  const params = { input: input.trim(), location, radius, strictbounds, language };
  const data = await httpGet('/places/v1/autocomplete', params);
  return data;
}

// Geocode fallback – try Ola geocode, otherwise return empty result
async function geocode({ input, address, language }) {
  const query = (address || input || '').trim();
  if (!query) return { results: [] };
  try {
    const data = await httpGet('/places/v1/geocode', { address: query, language: language || 'en' });
    return data;
  } catch (e) {
    console.error('Ola geocode API error:', e.message);
    return { results: [] };
  }
}

module.exports = { autocomplete, geocode };

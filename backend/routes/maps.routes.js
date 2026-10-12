const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middlewares/authenticateToken');
const { requireRoles } = require('../middlewares/roleAuth');
const ola = require('../services/olaMapsService');

// Protect these routes; keys remain server-side
router.use(authenticateToken);

// Optionally restrict to pharmacy/admin only
// router.use(requireRoles('pharmacy', 'admin'));

// GET /api/maps/ola/autocomplete?input=&location=lat,lon&radius=&strictbounds=&language=
router.get('/ola/autocomplete', async (req, res) => {
  try {
    const { input, location, radius, strictbounds, language } = req.query || {};
    const data = await ola.autocomplete({ input, location, radius, strictbounds, language });
    console.log('[OLA][autocomplete] params=', { input, location, radius, strictbounds, language });
    console.log('[OLA][autocomplete] response.predictions.len=', Array.isArray(data?.predictions) ? data.predictions.length : 0);
    res.json({ success: true, data });
  } catch (e) {
    console.error('ola.autocomplete error', e.message);
    res.status(500).json({ success: false, message: 'Autocomplete failed' });
  }
});

// GET /api/maps/ola/geocode?input=&language=
// GET /api/maps/ola/geocode?input=&language=
router.get('/ola/geocode', async (req, res) => {
  try {
    const { input, address, language } = req.query || {};
    const data = await ola.geocode({ input, address, language });
    console.log('[OLA][geocode] params=', { input, address, language });
    console.log('[OLA][geocode] response geocodingResults.len=', Array.isArray(data?.geocodingResults) ? data.geocodingResults.length : 0);
    const results = Array.isArray(data?.geocodingResults) ? data.geocodingResults : [];
    // Return both the raw data and a convenience top-level results array
    res.json({ success: true, data, results });
  } catch (e) {
    console.error('ola.geocode error', e.message);
    res.status(500).json({ success: false, message: 'Geocode failed' });
  }
});

module.exports = router;

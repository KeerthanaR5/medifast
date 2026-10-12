const express = require('express');
const router = express.Router();
const { getMedicinesAutocomplete } = require('../controllers/pharmacyController');

// GET /api/medicines/autocomplete?query=
router.get('/autocomplete', getMedicinesAutocomplete);

module.exports = router;